'use strict';

var fs = require('fs');
var path = require('path');
var test = require('@playwright/test').test;
var expect = require('@playwright/test').expect;

test('shared controls and cards show rounded focus surfaces in immersive theme', async function ({ page }) {
  await page.setContent('<body class="visual-theme-immersive">' +
    '<button class="nav-item">Library</button><button class="library-tab">Catalog</button>' +
    '<button class="library-control">Sort</button><button class="library-action">Filter</button>' +
    '<button class="library-card is-focused">Card</button>' +
    '<button class="server-activity is-focused">Activity</button><div class="server-activity-panel">Tasks</div>' +
    '<button class="active-profile"><span class="active-profile-avatar-frame">A</span>Profile</button>' +
    '<button class="search-key is-focused">A</button><div class="search-t9-legend-key is-active">2</div>' +
    '</body>');
  await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../app/styles.css'), 'utf8') });
  var selectors = ['.nav-item', '.library-tab', '.library-control', '.library-action',
    '.library-card', '.server-activity', '.server-activity-panel', '.active-profile',
    '.search-key', '.search-t9-legend-key'];
  for (var i = 0; i < selectors.length; i++) {
    var radii = await page.locator(selectors[i]).evaluateAll(function (elements) {
      return elements.map(function (element) {
        return parseFloat(element.ownerDocument.defaultView.getComputedStyle(element).borderTopLeftRadius);
      });
    });
    expect(radii.length, selectors[i]).toBeGreaterThan(0);
    radii.forEach(function (radius) {
      expect(radius, selectors[i]).toBeGreaterThan(0);
    });
  }
});

test('modal and overlay action controls share rounded corners in immersive theme', async function ({ page }) {
  await page.setContent('<body class="visual-theme-immersive">' +
    '<div class="language-editor-actions"><button>Language</button></div>' +
    '<button class="detail-summary-dialog-close">Close summary</button>' +
    '<div class="media-info-dialog-actions"><button class="media-info-dialog-close">Close Plex</button>' +
    '<button class="media-info-dialog-apply">Apply</button></div>' +
    '<button class="media-info-dialog-version-value">Version</button>' +
    '<div class="library-filter-actions"><button>Filter</button></div>' +
    '<div class="text-input-dialog-actions"><button>Save</button></div>' +
    '<div class="diagnostics-actions"><button>Diagnostics</button></div>' +
    '<div class="diagnostics-qr-dialog"><button>QR</button></div>' +
    '<div class="library-tabs-editor-actions"><button>Tabs</button></div>' +
    '<button class="playback-compatibility-option">Compatibility</button>' +
    '<div class="playback-compatibility-actions"><button>Playback settings</button></div>' +
    '<div class="player-error-actions"><button>Retry</button></div>' +
    '<div class="queue-gap-actions"><button>Queue</button></div>' +
    '<div class="resume-choice-actions"><button>Resume</button></div>' +
    '<div class="view-state-actions"><button>View state</button></div>' +
    '<button class="choice-dialog-option">Choice</button>' +
    '<div class="choice-dialog-actions"><button>Choose</button></div>' +
    '<button class="up-next-layout-option">Up next option</button>' +
    '<div class="up-next-layout-actions"><button>Up next</button></div>' +
    '<div class="subtitle-editor-action-row"><button>Subtitle</button></div>' +
    '<div class="autoplay-actions"><button>Autoplay</button></div>' +
    '<button class="privacy-dialog-close">Privacy</button>' +
    '<div class="update-dialog-actions"><button>Update</button></div>' +
    '</body>');
  await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../app/styles.css'), 'utf8') });
  var selectors = ['.language-editor-actions button', '.detail-summary-dialog-close',
    '.media-info-dialog-close', '.media-info-dialog-apply', '.media-info-dialog-version-value',
    '.media-info-dialog-actions button', '.library-filter-actions button',
    '.text-input-dialog-actions button', '.diagnostics-actions button',
    '.diagnostics-qr-dialog button', '.library-tabs-editor-actions button',
    '.playback-compatibility-option', '.playback-compatibility-actions button',
    '.player-error-actions button', '.queue-gap-actions button', '.resume-choice-actions button',
    '.view-state-actions button', '.choice-dialog-option', '.choice-dialog-actions button',
    '.up-next-layout-option', '.up-next-layout-actions button', '.subtitle-editor-action-row button',
    '.autoplay-actions button', '.privacy-dialog-close', '.update-dialog-actions button'];
  for (var i = 0; i < selectors.length; i++) {
    var radii = await page.locator(selectors[i]).evaluateAll(function (elements) {
      return elements.map(function (element) {
        return parseFloat(element.ownerDocument.defaultView.getComputedStyle(element).borderTopLeftRadius);
      });
    });
    expect(radii.length, selectors[i]).toBeGreaterThan(0);
    radii.forEach(function (radius) {
      expect(radius, selectors[i]).toBeGreaterThan(0);
    });
  }
});

test('Back buttons sit clear of their headings without moving the titles', async function ({ page }) {
  await page.setContent('<body class="visual-theme-immersive">' +
    '<div class="detail-heading" style="position:relative;margin-left:150px">' +
    '<button class="detail-back detail-arrow-button">Back</button><h1 class="detail-title">Film</h1></div>' +
    '<div class="app-settings-heading" style="position:relative;margin-left:150px">' +
    '<button class="app-settings-back detail-arrow-button">Back</button><h1 class="app-settings-title">Settings</h1></div></body>');
  await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../app/styles.css'), 'utf8') });
  for (var heading of ['.detail-heading', '.app-settings-heading']) {
    var positions = await page.locator(heading).evaluate(function (element) {
      var button = element.querySelector('button').getBoundingClientRect();
      var title = element.querySelector('h1').getBoundingClientRect();
      return { gap: title.left - button.right, titleOffset: title.left - element.getBoundingClientRect().left };
    });
    expect(positions.gap).toBe(20);
    expect(positions.titleOffset).toBe(0);
  }
});

test('poster box follows portrait artwork so rounding reaches its visible corners', async function ({ page }) {
  await page.setContent('<body class="visual-theme-immersive"><div class="detail-primary-pane" style="position:relative;width:1920px;height:1080px">' +
    '<img class="detail-poster is-loaded" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect width=\'200\' height=\'300\' fill=\'red\'/%3E%3C/svg%3E"></div></body>');
  await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../app/styles.css'), 'utf8') });
  var poster = await page.locator('.detail-poster').evaluate(function (element) {
    var rect = element.getBoundingClientRect();
    return { ratio: rect.width / rect.height,
      radius: parseFloat(element.ownerDocument.defaultView.getComputedStyle(element).borderTopLeftRadius) };
  });
  expect(poster.ratio).toBeCloseTo(2 / 3, 2);
  expect(poster.radius).toBeGreaterThan(0);
});
