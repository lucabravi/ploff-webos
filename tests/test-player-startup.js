'use strict';
var assert = require('assert');
var Application = require('../app/coordinator/application-controller');
var createHarness = require('./helpers/application-composition-harness').createHarness;
function calls(h, method) { return h.invocations.filter(function (entry) { return entry.owner === 'player' && entry.method === method; }); }
function detail(h, key, generation) {
  h.created.session.update({ view: 'detail' });
  h.created.detail.snapshot = function () { return { selectedItem: { ratingKey: key }, currentDetail: { ratingKey: key }, generation: generation || 1 }; };
}
(function coldCoreDoesNotConstructOrReadPlayerImplementations() {
  var h = createHarness({ deferPlayer: true });
  ['PloffPlayerFeatureController', 'PloffNativeVideoDriver', 'PloffPlaybackSession', 'PloffSubtitleRuntime'].forEach(function (name) {
    Object.defineProperty(h.root, name, { configurable: true, get: function () { throw new Error('cold Player read: ' + name); } });
  });
  var app = Application.create(h.root, h.document, {});
  assert.strictEqual(h.created.player, undefined);
  assert.strictEqual(h.injectedScripts.length, 0);
  h.capturedOptions.input.domains.resetSeekRepeat();
  assert.strictEqual(h.capturedOptions.pointer.capture.focus({}, {}), false);
  app.destroy();
}());
(function onlyOneBoundedWarmupAfterHomeSdAndPrefetchSettlement() {
  var h = createHarness({ deferPlayer: true });
  var marks = [];
  var app = Application.create(h.root, h.document, {}, { mark: function (name) { marks.push(name); } });
  assert.strictEqual(h.timers.filter(function (t) { return t.active && t.delay > 0; }).length, 0);
  h.capturedOptions.shell.transitions.onHomeReady();
  h.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(h.injectedScripts.length, 0, 'Home readiness alone must not warm Player before the SD artwork batch settles');
  h.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  h.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.strictEqual(h.injectedScripts.length, 1, 'SD artwork readiness must enter the completion-driven chain and warm Player once adjacent prefetch settles');
  h.loadPlayerCode();
  assert.strictEqual(h.createOrder.filter(function (name) { return name === 'player'; }).length, 1);
  assert.ok(marks.indexOf('first-focusable-ui') < marks.indexOf('player-load-start'));
  assert.ok(marks.indexOf('player-load-start') < marks.indexOf('player-code-ready'));
  assert.ok(marks.indexOf('player-code-ready') < marks.indexOf('player-feature-ready'));
  app.destroy();
  assert.strictEqual(h.destroyOrder[0], 'player', 'deferred owner tears down before Core');
}());
(function earlyPlayPromotesWarmupAndCoalescesRepeatedOk() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  h.capturedOptions.shell.transitions.onHomeReady();
  detail(h, 'a');
  var play = h.capturedOptions.detail.transitions.requestPlayback;
  assert.strictEqual(play(), true);
  assert.strictEqual(play(), true);
  assert.strictEqual(h.injectedScripts.length, 1);
  assert.strictEqual(h.timers.filter(function (t) { return t.active && t.delay === 5000; }).length, 1,
    'early Play must leave the SD settlement watchdog armed so the remaining background chain can still recover');
  assert.strictEqual(h.timers.some(function (t) {
    return t.active && (t.delay === 600 || t.delay === 1000 || t.delay === 2500 || t.delay === 4000);
  }), false, 'early Play must not restore legacy timer-driven warmups');
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'open').length, 1);
  h.runTimers();
  assert.strictEqual(calls(h, 'open').length, 1);
  play();
  assert.strictEqual(calls(h, 'open').length, 2, 'already-ready path delegates synchronously');
  app.destroy();
}());
(function latestStandaloneIntentWins() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  detail(h, 'a');
  var first = { item: { ratingKey: 'extra-a' }, resume: false };
  var latest = { item: { ratingKey: 'extra-b' }, resume: false };
  h.capturedOptions.detail.transitions.requestStandalonePlayback(first);
  h.capturedOptions.detail.transitions.requestStandalonePlayback(latest);
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'openStandalone').length, 1);
  assert.strictEqual(calls(h, 'openStandalone')[0].args[0], latest);
  app.destroy();
}());
['view', 'detail', 'generation', 'identity', 'reset', 'back', 'destroy'].forEach(function (reason) {
  var identity = { server: 's1', profile: 'p1' };
  var h = createHarness({ deferPlayer: true, methodHandlers: { 'server.mediaIdentity': function () { return identity; } } });
  var app = Application.create(h.root, h.document, {});
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  if (reason === 'view') { h.created.session.update({ view: 'home' }); }
  if (reason === 'detail') { detail(h, 'b'); }
  if (reason === 'generation') { detail(h, 'a', 2); }
  if (reason === 'identity') { identity = { server: 's1', profile: 'p2' }; }
  if (reason === 'reset') { h.capturedOptions.server.lifecycle.resetContent(); }
  if (reason === 'back') { h.capturedOptions.input.lifecycle.cancelPendingPlayback(); }
  if (reason === 'destroy') { app.destroy(); }
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'open').length, 0, reason + ' must cancel pending Play');
  if (reason === 'destroy') { assert.strictEqual(h.created.player, undefined); }
  app.destroy();
});
(function changingPlexOwnerCancelsPendingPlayEvenWhenPrimaryIdentityIsStable() {
  var identity = { server: 'primary-server', profile: 'profile-1' };
  var state = {
    selectedItem: { ratingKey: 'same-key', serverMachineIdentifier: 'server-b' },
    currentDetail: { ratingKey: 'same-key', serverMachineIdentifier: 'server-b' },
    generation: 1
  };
  var h = createHarness({ deferPlayer: true, methodHandlers: { 'server.mediaIdentity': function () { return identity; } } });
  var app = Application.create(h.root, h.document, {});
  h.created.session.update({ view: 'detail' });
  h.created.detail.snapshot = function () { return state; };
  h.capturedOptions.detail.transitions.requestPlayback();
  state = {
    selectedItem: { ratingKey: 'same-key', serverMachineIdentifier: 'server-c' },
    currentDetail: { ratingKey: 'same-key', serverMachineIdentifier: 'server-c' },
    generation: 1
  };
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'open').length, 0, 'changing only the owning PMS must invalidate deferred Play');
  app.destroy();
}());
['load', 'construction'].forEach(function (failure) {
  var h = createHarness({ deferPlayer: true, failCreate: failure === 'construction' ? 'player' : '' });
  var app = Application.create(h.root, h.document, {});
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  if (failure === 'load') { h.injectedScripts[0].onerror({ message: 'secret URL' }); }
  else { h.loadPlayerCode(); }
  assert.deepStrictEqual(h.destroyOrder, [], failure + ' must not roll back Core');
  assert.strictEqual(h.created.session.view(), 'detail');
  assert.ok(h.calls.indexOf('showMessage:shell') !== -1);
  assert.strictEqual(h.injectedScripts.length, 1, 'a Player failure must remain bounded until another explicit Play intent');
  assert.strictEqual(h.createOrder.filter(function (name) { return name === 'player'; }).length, failure === 'construction' ? 1 : 0);
  h.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(h.injectedScripts.length, failure === 'load' ? 2 : 1,
    'an explicit Play must retry a failed runtime load without creating an automatic retry loop');
  assert.strictEqual(h.createOrder.filter(function (name) { return name === 'player'; }).length, failure === 'construction' ? 2 : 0,
    'an explicit Play must retry deferred Player construction exactly once per user intent');
  app.destroy();
});
(function warmFailureIsSilentAndCoreRemainsUsable() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  h.warmPlayer();
  h.injectedScripts[0].onerror();
  assert.deepStrictEqual(h.destroyOrder, []);
  assert.strictEqual(h.calls.indexOf('showMessage:shell'), -1);
  assert.strictEqual(h.created.session.view(), 'home');
  app.destroy();
}());

(function reentrantDestroyDuringFactoryDoesNotResurrectTheFeature() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  var featureDestroy = 0;
  var diagnosticsCalls = 0;
  h.created.diagnostics.setError = function () { diagnosticsCalls += 1; };
  h.root.PloffPlayerComposition = { create: function () {
    app.destroy();
    return { open: function () { throw new Error('must not open'); }, destroy: function () { featureDestroy += 1; } };
  } };
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(featureDestroy, 1);
  assert.strictEqual(diagnosticsCalls, 0);
  app.destroy();
  assert.strictEqual(featureDestroy, 1);
}());
(function reentrantDestroyThenConstructorFailureCannotTouchDeadCore() {
  var h = createHarness();
  var app = Application.create(h.root, h.document, {});
  var diagnosticsCalls = 0;
  h.created.diagnostics.setError = function () { diagnosticsCalls += 1; };
  h.root.PloffPlayerComposition = { create: function () { app.destroy(); throw new Error('late construction failure'); } };
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(diagnosticsCalls, 0, 'construction failure after teardown must not update destroyed diagnostics');
}());
(function delayedConstructionReceivesCurrentPortsAndSharedAssPool() {
  var identity = { server: 'old', profile: 'old-profile' };
  var server = { name: 'old' };
  var h = createHarness({ deferPlayer: true, deferDevice: true, methodHandlers: {
    'server.mediaIdentity': function () { return identity; },
    'server.activeServer': function () { return server; }
  } });
  var app = Application.create(h.root, h.document, {});
  h.warmPlayer();
  identity = { server: 'new', profile: 'new-profile' };
  server = { name: 'new' };
  h.completeDevice({ directPlay: true });
  h.loadPlayerCode();
  var ports = h.capturedOptions.player;
  assert.strictEqual(ports.data.activeServer(), server);
  assert.strictEqual(ports.data.mediaIdentity(), identity);
  assert.strictEqual(ports.data.playbackCapabilities().directPlay, true);
  assert.strictEqual(ports.modules.AssSubtitleRenderer, h.created.assPool);
  identity = { server: 'newer', profile: 'newer-profile' };
  assert.strictEqual(ports.data.mediaIdentity(), identity, 'ports must remain live after warm construction too');
  app.destroy();
}());
(function playDuringAnAlreadyStartedBackgroundLoadUsesTheSameRequest() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  h.warmPlayer();
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(h.injectedScripts.length, 1);
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'open').length, 1);
  assert.strictEqual(h.createOrder.filter(function (name) { return name === 'player'; }).length, 1);
  app.destroy();
}());

(function changingEpisodeWithinTheSameShowCancelsTheOldIntent() {
  var h = createHarness({ deferPlayer: true });
  var app = Application.create(h.root, h.document, {});
  h.created.session.update({ view: 'detail' });
  var state = { selectedItem: { ratingKey: 'show' }, currentDetail: { ratingKey: 'episode-a' }, generation: 1, seasonIndex: 0, episodeIndex: 0 };
  h.created.detail.snapshot = function () { return state; };
  h.capturedOptions.detail.transitions.requestPlayback();
  state.currentDetail = { ratingKey: 'episode-b' };
  state.episodeIndex = 1;
  h.loadPlayerCode();
  assert.strictEqual(calls(h, 'open').length, 0, 'same-show selection changes must not play a different episode without a new Play');
  app.destroy();
}());

(function invalidReturnedFeatureIsReleasedWithoutDestroyingCore() {
  var h = createHarness(); var released = 0;
  var app = Application.create(h.root, h.document, {});
  h.root.PloffPlayerComposition = { create: function () {
    return { destroy: function () { released += 1; throw new Error('cleanup failure'); } };
  } };
  detail(h, 'a');
  h.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(released, 1, 'a returned but unusable owner must be released');
  assert.deepStrictEqual(h.destroyOrder, [], 'failed deferred cleanup must leave Core alive');
  app.destroy();
  assert.strictEqual(released, 1);
}());

console.log('Deferred Player application startup checks passed');
