'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function compatibilityIssues(styles, playerQueueSource) {
  var issues = [];
  if (/display\s*:\s*grid|\bgap\s*:|aspect-ratio|backdrop-filter/.test(styles)) {
    issues.push('legacy-css');
  }
  if (styles.indexOf('transform:translateX(100%)') !== -1) {
    issues.push('queue-offscreen-transform');
  }
  if (styles.indexOf('width:440px') === -1 || styles.indexOf('.player-playlist-queue.is-open { right:0;') === -1) {
    issues.push('queue-right-edge-geometry');
  }
  if (playerQueueSource.indexOf('function resetViewportScroll()') === -1 ||
      playerQueueSource.indexOf('document.documentElement.scrollLeft = 0') === -1) {
    issues.push('legacy-viewport-scroll-reset');
  }
  return issues;
}

(function provesCompatibilityGuardSensitivityWithMutatedFixtures() {
  var goodStyles = [
    '.player-playlist-queue { width:440px; right:0; }',
    '.player-playlist-queue.is-open { right:0; }'
  ].join('\n');
  var goodQueue = [
    'function resetViewportScroll() {',
    '  document.documentElement.scrollLeft = 0;',
    '}'
  ].join('\n');

  assert.deepStrictEqual(compatibilityIssues(goodStyles + '\n.card { display:grid; }', goodQueue), ['legacy-css']);
  assert.deepStrictEqual(compatibilityIssues(goodStyles + '\n.drawer { transform:translateX(100%); }', goodQueue), ['queue-offscreen-transform']);
  assert.deepStrictEqual(compatibilityIssues('.player-playlist-queue.is-open { right:0; }', goodQueue), ['queue-right-edge-geometry']);
  assert.deepStrictEqual(compatibilityIssues(goodStyles, 'function resetViewportScroll() {}'), ['legacy-viewport-scroll-reset']);
}());

(function currentSourcesSatisfyLegacyCompatibilityGuards() {
  var root = path.join(__dirname, '..', 'app');
  var styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  var playerQueueSource = fs.readFileSync(path.join(root, 'coordinator', 'player-queue-controller.js'), 'utf8');
  assert.deepStrictEqual(compatibilityIssues(styles, playerQueueSource), [],
    'current TV sources must satisfy Chrome 53 compatibility source guards');
}());

(function behaviorTestsMustNotOwnDedicatedSourceCompatibilityPolicy() {
  var tvShellTest = fs.readFileSync(path.join(__dirname, 'test-tv-shell.js'), 'utf8');
  var playlistTest = fs.readFileSync(path.join(__dirname, 'test-playlist-queue.js'), 'utf8');
  [
    'shell JavaScript must remain ES5 compatible',
    'only NativeVideoDriver may assign native playback currentTime',
    'only NativeVideoDriver may assign the native video source',
    'Playback facade and sibling coordinators must not write Plex timeline or keepalive traffic directly',
    'PlayerFeatureController must not retain queue presentation state after PlayerQueueController extraction'
  ].forEach(function (message) {
    assert.strictEqual(tvShellTest.indexOf(message), -1,
      'dedicated architecture/compatibility guards must own: ' + message);
  });
  [
    'CSS must avoid unsupported Chrome 53 features',
    'the webOS queue drawer must never focus content while translated outside the viewport',
    'the queue drawer must use stable explicit right-edge geometry on Chromium 53',
    'queue focus must neutralize legacy Chromium viewport scrolling'
  ].forEach(function (message) {
    assert.strictEqual(tvShellTest.indexOf(message), -1,
      'TV shell behavior tests must not own source compatibility policy: ' + message);
    assert.strictEqual(playlistTest.indexOf(message), -1,
      'playlist behavior tests must not own source compatibility policy: ' + message);
  });
}());

console.log('Source compatibility guard checks passed');
