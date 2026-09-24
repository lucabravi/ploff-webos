'use strict';

/* global window */

var base = require('@playwright/test');
var chrome53 = require('./chrome53-profile');

function redactedUrl(value) {
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

function createDiagnostics() {
  var events = [];
  var started = Date.now();

  function add(type, payload) {
    if (events.length >= 5000) { return; }
    events.push({
      at: Date.now() - started,
      type: type,
      payload: payload || {}
    });
  }

  return {
    add: add,
    events: events,
    started: started
  };
}

var test = base.test.extend({
  chrome53Profile: [async function ({ context }, use) {
    /* Register before the first page is created. This is an engine capability
     * profile, not a claim that the bundled Chromium is actually Chrome 53. */
    chrome53.install(context);
    await use();
  }, { auto: true }],
  diagnostics: async function ({ page, chrome53Profile: _chrome53Profile }, use, testInfo) {
    var log = createDiagnostics();
    page.on('console', function (message) {
      log.add('console', {
        level: message.type(),
        text: message.text(),
        location: message.location()
      });
    });
    page.on('pageerror', function (error) {
      log.add('pageerror', { message: error.message, stack: error.stack || '' });
    });
    page.on('request', function (request) {
      log.add('request', {
        method: request.method(),
        url: redactedUrl(request.url()),
        resourceType: request.resourceType()
      });
    });
    page.on('response', function (response) {
      log.add('response', {
        status: response.status(),
        url: redactedUrl(response.url())
      });
    });
    page.on('requestfailed', function (request) {
      log.add('requestfailed', {
        method: request.method(),
        url: redactedUrl(request.url()),
        failure: request.failure()
      });
    });
    await use(log);
    try {
      log.runtime = await page.evaluate(function () {
        function safeResourceUrl(value) {
          return String(value || '').replace(
            /([?&](?:X-Plex-Token|token|authToken)=)[^&]*/ig,
            '$1<redacted>'
          );
        }

        return {
          profile: window.__PLOFF_E2E_PROFILE__ || null,
          userAgent: navigator.userAgent,
          capabilities: {
            webAssembly: typeof window.WebAssembly !== 'undefined',
            resizeObserver: typeof window.ResizeObserver !== 'undefined',
            offscreenCanvas: typeof window.OffscreenCanvas !== 'undefined',
            fetch: typeof window.fetch === 'function',
            promise: typeof window.Promise === 'function',
            urlSearchParams: typeof window.URLSearchParams === 'function'
          },
          performance: window.performance && typeof window.performance.getEntriesByType === 'function'
            ? window.performance.getEntriesByType('resource').map(function (entry) {
              return { name: safeResourceUrl(entry.name), duration: entry.duration, startTime: entry.startTime };
            }) : []
        };
      });
    } catch (error) {
      log.runtime = { evaluationError: error.message };
    }
    await testInfo.attach('browser-events.json', {
      body: Buffer.from(JSON.stringify(log.events, null, 2)),
      contentType: 'application/json'
    });
    await testInfo.attach('browser-runtime.json', {
      body: Buffer.from(JSON.stringify(log.runtime || {}, null, 2)),
      contentType: 'application/json'
    });
  }
});

module.exports = { test: test, expect: base.expect };
