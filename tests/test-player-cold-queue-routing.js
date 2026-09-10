'use strict';
var assert = require('assert');
var Application = require('../app/coordinator/application-controller');
var Fixture = require('./helpers/application-composition-harness');
var QueueModel = require('../app/playback-queue-model');
var Commands = require('../app/coordinator/input-command-router');
function setup(containerCard) {
  var h = Fixture.createHarness({ deferPlayer: true });
  h.root.PloffPlaybackQueueModel = QueueModel;
  h.root.PloffInputCommandRouter = Commands;
  var app = Application.create(h.root, h.document, {});
  var state = { library: { zone: 'grid' }, grid: { focus: { index: 0, recommendationRow: 0 } }, generation: 1 };
  var item = containerCard ? { containerKey: 'playlist-a', containerType: 'playlist' } : { ratingKey: 'movie-a', type: 'movie' };
  h.created.session.update({ view: 'library' });
  h.created.library.snapshot = function () { return state; };
  h.created.library.focusedItem = function () { return item; };
  h.created.library.activeContainer = function () { return containerCard ? null : { containerKey: 'playlist-a', containerType: 'playlist' }; };
  return { h: h, app: app, state: state, select: function (next) { item = next; } };
}
function captures(h) { return h.invocations.filter(function (entry) { return entry.owner === 'player' && entry.method === 'handleQueueCapture'; }); }
[true, false].forEach(function (containerCard) {
  var f = setup(containerCard);
  var prevented = 0;
  var event = { keyCode: 415, preventDefault: function () { prevented += 1; } };
  assert.strictEqual(f.h.capturedOptions.input.domains.queueCapture(event), true,
    'cold physical Play must retain the existing container/playlist capture path');
  assert.strictEqual(prevented, 1);
  assert.strictEqual(f.h.injectedScripts.length, 1);
  f.h.capturedOptions.input.domains.queueCapture(event);
  f.h.loadPlayerCode();
  assert.strictEqual(captures(f.h).length, 1, 'coalesced activation must be replayed exactly once');
  assert.strictEqual(captures(f.h)[0].args[0].keyCode, 415);
  assert.notStrictEqual(captures(f.h)[0].args[0], event, 'do not retain and replay a live DOM event');
  f.app.destroy();
});
(function ordinaryBrowsingDoesNotForcePlayerReadiness() {
  var f = setup(true);
  assert.strictEqual(f.h.capturedOptions.input.domains.queueCapture({ keyCode: 13 }), false, 'OK on a container remains ordinary navigation');
  f.select({ ratingKey: 'ordinary', type: 'movie' });
  assert.strictEqual(f.h.capturedOptions.input.domains.queueCapture({ keyCode: 13 }), false);
  assert.strictEqual(f.h.capturedOptions.input.domains.queueCapture({ keyCode: 415 }), false, 'ordinary media retains the Detail playback route');
  assert.strictEqual(f.h.injectedScripts.length, 0);
  f.app.destroy();
}());
['item', 'occurrence', 'scope', 'back', 'destroy'].forEach(function (reason) {
  var f = setup(false);
  f.h.capturedOptions.input.domains.queueCapture({ keyCode: 415 });
  if (reason === 'item') { f.select({ ratingKey: 'movie-b', type: 'movie' }); }
  if (reason === 'occurrence') { f.state.grid.focus.index = 2; }
  if (reason === 'scope') { f.h.created.library.activeContainer = function () { return { containerKey: 'different', containerType: 'playlist' }; }; }
  if (reason === 'back') { f.h.capturedOptions.input.lifecycle.cancelPendingPlayback(); }
  if (reason === 'destroy') { f.app.destroy(); }
  f.h.loadPlayerCode();
  assert.strictEqual(captures(f.h).length, 0, reason + ' cancels delayed queue activation');
  f.app.destroy();
});
(function pointerPlaylistSelectionPreservesQueueSetupWithoutRetainingTheButton() {
  var f = setup(false);
  var focused = 0;
  f.h.created.library.pointerFocus = function (_zone, _index, target) { assert.strictEqual(target, button); focused += 1; };
  var button = { hasAttribute: function (name) { return name === 'data-library-index'; } };
  assert.strictEqual(f.h.capturedOptions.pointer.capture.click({ preventDefault: function () {} }, button, {}), true);
  assert.strictEqual(focused, 1);
  f.h.loadPlayerCode();
  assert.strictEqual(captures(f.h).length, 1);
  assert.strictEqual(captures(f.h)[0].args[0].keyCode, 13);
  assert.deepStrictEqual(Object.keys(captures(f.h)[0].args[0]), ['keyCode']);
  f.app.destroy();
}());
console.log('Cold Player queue activation routing checks passed');
