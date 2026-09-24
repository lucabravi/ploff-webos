'use strict';

/* global document, location */

/*
 * Opens the local preview with a real persistent Playwright profile.
 *
 * The Playwright test runner deliberately creates an isolated browser context
 * for every test. That is the right default for deterministic tests, but it
 * is the wrong default for manually logging into Plex while debugging. This
 * helper keeps the browser profile on disk so localStorage (and cookies) are
 * available the next time the session is started.
 */

var fs = require('fs');
var path = require('path');
var playwright = require('@playwright/test');
var chrome53 = require('../tests/e2e/chrome53-profile');

var root = path.resolve(__dirname, '..');
var defaultProfileDir = path.join(root, 'artifacts', 'playwright', 'persistent-profile');
var profileDir = path.resolve(process.env.PLOFF_E2E_PROFILE_DIR || defaultProfileDir);
var baseUrl = process.env.PLOFF_E2E_BASE_URL || 'http://127.0.0.1:8098/app/';
var executablePath = process.env.PLOFF_E2E_BROWSER_PATH
  ? path.resolve(process.env.PLOFF_E2E_BROWSER_PATH)
  : undefined;
var logPath = path.resolve(process.env.PLOFF_E2E_SESSION_LOG ||
  path.join(root, 'artifacts', 'playwright', 'session.log'));
var closed = false;
var context = null;
var uiTimer = null;

function redactUrl(value) {
  var url;
  try {
    url = new URL(String(value || ''));
    ['X-Plex-Token', 'token', 'authToken'].forEach(function (name) {
      if (url.searchParams.has(name)) { url.searchParams.set(name, '<redacted>'); }
    });
    return url.toString();
  } catch (_error) {
    return String(value || '').replace(/([?&](?:X-Plex-Token|token|authToken)=)[^&]*/ig, '$1<redacted>');
  }
}

function logLine(message) {
  var line = new Date().toISOString() + ' ' + message + '\n';
  try { fs.appendFileSync(logPath, line, 'utf8'); } catch (_error) {}
  console.log(message);
}

function snapshotUi(page) {
  return page.evaluate(function () {
    function text(selector) {
      var target = document.querySelector(selector);
      return target ? String(target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    }

    function className(selector) {
      var target = document.querySelector(selector);
      return target ? String(target.className || '') : '';
    }

    return {
      hash: String(location.hash || ''),
      body: String(document.body && document.body.className || ''),
      subnav: text('#library-subnav'),
      subnavClass: className('#library-subnav'),
      status: text('#library-status'),
      statusClass: className('#library-status'),
      gridClass: className('#library-grid-content'),
      gridItems: document.querySelectorAll('#library-grid-content [data-rating-key], #library-grid-content .media-card').length,
      gridText: text('#library-grid-content')
    };
  });
}

function startUiLogging(page) {
  var previous = '';
  function poll() {
    snapshotUi(page).then(function (snapshot) {
      var serialized = JSON.stringify(snapshot);
      if (serialized === previous) { return; }
      previous = serialized;
      logLine('[ui] ' + serialized);
    }).catch(function (error) {
      logLine('[ui-error] ' + error.message);
    });
  }
  poll();
  uiTimer = setInterval(poll, 250);
}

function close(code) {
  if (closed) { return; }
  closed = true;
  if (uiTimer !== null) { clearInterval(uiTimer); uiTimer = null; }
  if (!context) {
    process.exitCode = code || 0;
    return;
  }
  context.close().then(function () {
    process.exitCode = code || 0;
  }).catch(function (error) {
    console.error('Impossibile chiudere la sessione Playwright:', error.message);
    process.exitCode = code || 1;
  });
}

async function main() {
  var launchOptions = {
    headless: process.env.PLOFF_E2E_HEADLESS === '1',
    viewport: { width: 1920, height: 1080 },
    userAgent: chrome53.userAgent,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  };
  var pages;
  var page;

  if (executablePath) { launchOptions.executablePath = executablePath; }
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  logLine('[session] start profile=' + profileDir + ' url=' + redactUrl(baseUrl));
  context = await playwright.chromium.launchPersistentContext(profileDir, launchOptions);
  chrome53.install(context);

  pages = context.pages();
  page = pages.length ? pages[0] : await context.newPage();
  page.on('console', function (message) {
    if (message.type() === 'error' || message.type() === 'warning') {
      logLine('[console:' + message.type() + '] ' + message.text());
    }
  });
  page.on('request', function (request) {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      logLine('[request] ' + request.method() + ' ' + redactUrl(request.url()));
    }
  });
  page.on('response', function (response) {
    if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
      logLine('[response] ' + response.status() + ' ' + redactUrl(response.url()));
    }
  });
  page.on('requestfailed', function (request) {
    logLine('[requestfailed] ' + request.method() + ' ' + redactUrl(request.url()) +
      ' ' + String(request.failure() && request.failure().errorText || 'unknown'));
  });
  page.on('pageerror', function (error) {
    logLine('[pageerror] ' + error.message);
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  startUiLogging(page);
  logLine('Sessione Playwright persistente pronta.');
  logLine('URL: ' + redactUrl(baseUrl));
  logLine('Profilo: ' + profileDir);
  logLine('Log diagnostico: ' + logPath);
  logLine('Il login resterà disponibile ai prossimi avvii; termina con Ctrl+C.');

  process.once('SIGINT', function () { close(0); });
  process.once('SIGTERM', function () { close(0); });
  process.stdin.resume();
  await new Promise(function (resolve) {
    process.stdin.once('end', resolve);
  });
  close(0);
}

main().catch(function (error) {
  console.error('Avvio della sessione Playwright fallito:', error.stack || error.message);
  close(1);
});
