'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'player-feature-controller.js'), 'utf8');

function functionBody(name, nextName) {
  var start = source.indexOf('function ' + name + '(');
  var end = nextName ? source.indexOf('function ' + nextName + '(', start + 1) : source.length;
  assert.ok(start >= 0 && end > start, 'expected function range for ' + name);
  return source.slice(start, end);
}

function playbackReads(name, nextName) {
  return (functionBody(name, nextName).match(/currentPlayerPlayback\(\)/g) || []).length;
}

assert.ok(playbackReads('subtitleEditorAvailability', 'subtitleOffsetFor') <= 1,
  'subtitle availability must read the playback snapshot at most once');
assert.ok(playbackReads('subtitleOffsetFor', 'ensurePlayerControlsView') <= 1,
  'subtitle offset resolution must read the playback snapshot at most once');
assert.ok(playbackReads('subtitleTrackLabelWithOffset', 'playerSettingDisabled') <= 1,
  'subtitle labels must reuse one playback snapshot');
assert.ok(playbackReads('playerSettingDisabled', 'playerSettingRows') <= 1,
  'setting availability must reuse one playback snapshot');
assert.ok(playbackReads('updateSettingsDisplay', 'renderPlayerSettingsState') <= 1,
  'one settings render must read the playback snapshot once');
assert.ok(playbackReads('renderPlayerPlaybackSummary', 'renderPlaybackInfo') <= 1,
  'one compact summary render must read the playback snapshot once');
assert.ok(playbackReads('renderPlaybackInfo', 'cycleTrack') <= 1,
  'one playback information render must read the playback snapshot once');
assert.strictEqual(playbackReads('openPlayerSettingChoiceForKey', 'mediaVersionLabelForPlayback'), 1,
  'opening a setting choice must read the playback snapshot once');
assert.ok(playbackReads('mediaVersionLabelForPlayback', 'cyclePlaybackVersion') <= 1,
  'version labels must reuse one playback snapshot');
assert.ok(!/renderPlayerPlaybackSummary\(\)/.test(functionBody('renderPlaybackInfo', 'cycleTrack')),
  'playback information rendering must not redraw the compact summary implicitly');

console.log('Player feature hot-path checks passed');
