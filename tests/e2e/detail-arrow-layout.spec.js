'use strict';

var test = require('@playwright/test').test;
var expect = require('@playwright/test').expect;

test('icon Back controls keep their geometry on pointer and remote focus', async function ({ page }) {
  await page.goto('./');
  await page.setContent('<!doctype html><html><head><link rel="stylesheet" href="styles.css?v=dev"></head>' +
    '<body class="visual-theme-immersive"><section class="detail-view"><div class="detail-snap-track">' +
    '<div class="detail-primary-pane"><div class="detail-copy"><div class="detail-heading">' +
    '<button id="detail-back" class="detail-back detail-arrow-button" type="button">‹</button>' +
    '<h1 id="detail-title" class="detail-title">Example title</h1></div></div>' +
    '<div class="episode-viewport"><button id="episode-overflow-left" class="detail-row-overflow-button detail-arrow-button is-visible" type="button">‹</button></div>' +
    '</div></div></section><section class="app-settings-view"><div class="app-settings-heading">' +
    '<button id="app-settings-back" class="app-settings-back detail-arrow-button" type="button">‹</button>' +
    '<h1 class="app-settings-title">Settings</h1></div></section></body></html>');

  async function geometry(id) {
    return page.locator('#' + id).evaluate(function (element) {
      var rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  }

  for (var id of ['detail-back', 'app-settings-back']) {
    var atRest = await geometry(id);
    if (id === 'detail-back') {
      await page.locator('#' + id).hover();
      expect(await geometry(id)).toEqual(atRest);
    }
    await page.locator('#' + id).evaluate(function (element) { element.classList.add('is-focused'); });
    expect(await geometry(id)).toEqual(atRest);
    expect((await geometry('episode-overflow-left')).width).toBe(atRest.width);
  }
});
