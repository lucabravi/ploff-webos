'use strict';

/* global window, document */

var testModule = require('./fixtures');
var test = testModule.test;
var expect = testModule.expect;
var session = require('./app-session');
var mockPlex = require('./mock-plex');

test('boots the local preview with the Chrome 53 compatibility profile', async function ({ page, diagnostics }, testInfo) {
  await session.seedOfflineSession(page);
  await mockPlex.installMockPlex(page);
  await page.goto('./');

  await expect(page.locator('#navigation')).toContainText('Home');
  await expect(page.locator('body')).not.toHaveClass(/\bis-booting\b/);
  await expect(page.locator('#content')).not.toContainText('Loading');

  var runtime = await page.evaluate(function () {
    return window.__PLOFF_E2E_PROFILE__ || null;
  });
  expect(runtime).not.toBeNull();
  expect(runtime.name).toBe('chrome53-compatible');
  expect(runtime.disabledApis).toContain('WebAssembly');
  expect(diagnostics.events.some(function (entry) { return entry.type === 'pageerror'; })).toBe(false);

  await testInfo.attach('boot-summary.json', {
    body: Buffer.from(JSON.stringify({
      view: await page.evaluate(function () { return document.body.className; }),
      requests: diagnostics.events.filter(function (entry) { return entry.type === 'request'; }).length,
      responses: diagnostics.events.filter(function (entry) { return entry.type === 'response'; }).length
    }, null, 2)),
    contentType: 'application/json'
  });
});
