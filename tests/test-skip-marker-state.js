'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'shell', 'skip-marker-state.js');

assert.ok(fs.existsSync(modulePath), 'skip marker state module must exist');

var SkipMarkerState = require(modulePath);
var markers = [
  { key: 'intro:10000:30000', type: 'intro', startTimeOffset: 10000, endTimeOffset: 30000 },
  { key: 'credits:80000:90000', type: 'credits', startTimeOffset: 80000, endTimeOffset: 90000 },
  { key: 'credits:95000:100000', type: 'credits', startTimeOffset: 95000, endTimeOffset: 100000 }
];
var state = SkipMarkerState.create();

state = SkipMarkerState.update(state, markers, 5000, 1000, 5);
assert.strictEqual(state.visible, false, 'prompt must stay hidden outside markers');

state = SkipMarkerState.update(state, markers, 12000, 2000, 5);
assert.strictEqual(state.visible, true, 'entering an intro must reveal the prompt');
assert.strictEqual(state.marker.type, 'intro', 'the active intro must be retained');
assert.strictEqual(state.deadline, 7000, 'the configured display duration must use wall-clock time');
assert.strictEqual(state.focusRequested, true, 'a newly shown prompt must request focus');

state = SkipMarkerState.clearFocusRequest(state);
state = SkipMarkerState.update(state, markers, 15000, 7001, 5);
assert.strictEqual(state.visible, false, 'a standalone prompt must hide after its deadline');

state = SkipMarkerState.showForControls(state);
assert.strictEqual(state.visible, true, 'opening controls inside a marker must reveal an expired prompt again');
assert.strictEqual(state.mode, 'controls', 'a reopened prompt must follow the controls lifetime');
assert.strictEqual(state.focusRequested, true, 'a prompt reopened by controls must receive focus');

var restored = SkipMarkerState.showForControls(SkipMarkerState.create(), markers[0]);
assert.strictEqual(restored.visible, true, 'opening controls must restore the currently active marker even when UI state no longer retains it');
assert.strictEqual(restored.marker.key, markers[0].key, 'the marker detected from playback time must become the controls prompt');
restored = SkipMarkerState.clearFocusRequest(restored);
restored = SkipMarkerState.showForControls(restored, markers[0]);
assert.strictEqual(restored.focusRequested, false, 'polling an already visible controls prompt must not steal focus repeatedly');

state = SkipMarkerState.hideWithControls(state);
assert.strictEqual(state.visible, false, 'a controls-bound prompt must hide with the controls');
state = SkipMarkerState.update(state, markers, 16000, 8000, 5);
assert.strictEqual(state.visible, false, 'a hidden prompt must not immediately reappear in the same marker');

state = SkipMarkerState.update(state, markers, 85000, 9000, 3);
assert.strictEqual(state.marker.key, 'credits:80000:90000', 'the first credits interval must be detected independently');
state = SkipMarkerState.dismiss(state);
assert.strictEqual(state.visible, false, 'activating a prompt must dismiss it');

state = SkipMarkerState.update(state, markers, 92000, 10000, 3);
assert.strictEqual(state.marker, null, 'leaving a marker must reset the active interval');
state = SkipMarkerState.update(state, markers, 96000, 11000, 3);
assert.strictEqual(state.marker.key, 'credits:95000:100000', 'a later credits interval must create a new prompt');

assert.strictEqual(SkipMarkerState.activeMarker(markers, 30000), null, 'marker end offsets must be exclusive');

console.log('Skip marker state checks passed');
