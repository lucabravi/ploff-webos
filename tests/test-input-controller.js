'use strict';

var assert = require('assert');
var InputController = require('../app/coordinator/input-controller');
var InputTargetRouter = require('../app/input-target-router');

function event(keyCode, calls) {
  return {
    keyCode: keyCode,
    preventDefault: function () { calls.push('prevent:' + keyCode); }
  };
}

(function testDirectionMapping() {
  var controller = InputController.create({ InputTargetRouter: InputTargetRouter, sessionSnapshot: function () { return { appView: 'home' }; } });
  assert.strictEqual(controller.directionForKey(37), 'left');
  assert.strictEqual(controller.directionForKey(38), 'up');
  assert.strictEqual(controller.directionForKey(39), 'right');
  assert.strictEqual(controller.directionForKey(40), 'down');
  assert.strictEqual(controller.directionForKey(13), '');
}());

(function testExactPrecedenceAndSingleConsumption() {
  var calls = [];
  var state = { appView: 'player' };
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return state; },
    overlays: {
      choiceDialog: function () { calls.push('choice'); },
      queueGap: function () { calls.push('queue-gap'); },
      playerMediaInfo: function () { calls.push('media-info'); },
      resumeChoice: function () { calls.push('resume'); },
      playerError: function () { calls.push('error'); },
      subtitleEditor: function () { calls.push('subtitle'); }
    },
    domains: {
      queueCapture: function (input) {
        if (input.keyCode !== 415 && input.keyCode !== 19) { return false; }
        calls.push('queue-capture');
        return true;
      },
      playerQueue: function () { calls.push('queue'); return true; },
      playerControls: function () { calls.push('controls'); return true; },
      home: function () { calls.push('home'); return true; }
    }
  });

  state.choiceDialogOpen = true;
  controller.handleKeyDown(event(13, calls));
  assert.deepStrictEqual(calls, ['prevent:13', 'choice'], 'global modal must prevent browser behavior and consume before every player handler');

  calls.length = 0;
  state.choiceDialogOpen = false;
  state.queueGapOpen = true;
  controller.handleKeyDown(event(39, calls));
  assert.deepStrictEqual(calls, ['prevent:39', 'queue-gap'], 'queue gap confirmation must consume input before every other player surface');

  calls.length = 0;
  state.queueGapOpen = false;
  state.playerMediaInfoOpen = true;
  controller.handleKeyDown(event(40, calls));
  assert.deepStrictEqual(calls, ['prevent:40', 'media-info'], 'player overlay must prevent browser behavior and consume before queue and controls');

  calls.length = 0;
  state.playerMediaInfoOpen = false;
  controller.handleKeyDown(event(13, calls));
  assert.deepStrictEqual(calls, ['prevent:13', 'queue'], 'visible player queue must consume before controls');

  calls.length = 0;
  controller.handleKeyDown(event(415, calls));
  assert.deepStrictEqual(calls, ['prevent:415', 'controls'], 'the Play media key must bypass queue capture and reach video controls before a focused queue command can open the drawer');

  calls.length = 0;
  controller.handleKeyDown(event(19, calls));
  assert.deepStrictEqual(calls, ['prevent:19', 'controls'], 'the Pause media key must bypass an open queue drawer and pause the current video');

  calls.length = 0;
  state.playerUpNextOpen = true;
  controller.handleKeyDown(event(415, calls));
  assert.deepStrictEqual(calls, ['prevent:415', 'queue'], 'the Play media key must confirm visible Up Next instead of resuming the completed current item');
  state.playerUpNextOpen = false;

  calls.length = 0;
  controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return { appView: 'library' }; },
    domains: {
      queueCapture: function () { calls.push('queue-capture'); return true; },
      library: function () { calls.push('library'); return true; }
    }
  });
  controller.handleKeyDown(event(415, calls));
  assert.deepStrictEqual(calls, ['queue-capture'], 'cross-view playlist queue capture must run once before the active view domain');

  calls.length = 0;
  controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return { appView: 'player' }; },
    domains: {
      playerQueue: function () { calls.push('queue'); return false; },
      playerControls: function () { calls.push('controls'); return true; }
    }
  });
  controller.handleKeyDown(event(461, calls));
  assert.deepStrictEqual(calls, ['prevent:461', 'queue', 'controls'], 'unclaimed queue keys must fall through exactly once to player controls');
}());

(function testViewsMediaKeysT9AndPinRouting() {
  var calls = [];
  var state = { appView: 'setup' };
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return state; },
    domains: {
      setup: function (input) { calls.push('setup:' + input.keyCode); return { handled: true }; },
      settings: function (input) { calls.push('settings:' + input.keyCode); return { handled: true }; },
      detail: function (input) { calls.push('detail:' + input.keyCode); return { handled: true }; },
      library: function (input) { calls.push('library:' + input.keyCode); return { handled: true }; },
      watchlist: function (input) { calls.push('watchlist:' + input.keyCode); return true; },
      search: function (input) { calls.push('search:' + input.keyCode); return true; },
      home: function (input) { calls.push('home:' + input.keyCode); return true; }
    },
    lifecycle: { clearWheelNavigation: function () { calls.push('wheel-clear'); } }
  });

  controller.handleKeyDown(event(53, calls));
  state.appView = 'settings'; controller.handleKeyDown(event(13, calls));
  state.appView = 'detail'; controller.handleKeyDown(event(415, calls));
  state.appView = 'library'; controller.handleKeyDown(event(40, calls));
  state.appView = 'watchlist'; controller.handleKeyDown(event(461, calls));
  state.appView = 'search'; controller.handleKeyDown(event(50, calls));
  state.appView = 'home'; controller.handleKeyDown(event(19, calls));

  assert.deepStrictEqual(calls, [
    'setup:53', 'settings:13', 'detail:415', 'prevent:415', 'wheel-clear', 'library:40',
    'watchlist:461', 'search:50', 'home:19'
  ], 'PIN digits, T9 digits, media keys, OK, Back and directions must reach only the active domain');
}());

(function testEverySupportedRemoteCodeUsesOneDomainPath() {
  var calls = [];
  var supported = [8, 13, 19, 27, 37, 38, 39, 40, 48, 57, 96, 105, 412, 413, 415, 417, 461];
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return { appView: 'player' }; },
    domains: {
      playerQueue: function () { return false; },
      playerControls: function (input) { calls.push(input.keyCode); return true; }
    }
  });
  supported.forEach(function (keyCode) { controller.handleKeyDown(event(keyCode, [])); });
  assert.deepStrictEqual(calls, supported, 'Back variants, arrows, digits, numpad digits, media play/pause/stop and rewind/forward must use one player route');
}());

(function testHomeDirectionsBypassCrossViewQueueCapture() {
  var calls = [];
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return { appView: 'home' }; },
    domains: {
      queueCapture: function () { calls.push('queue-capture'); return false; },
      home: function () { calls.push('home'); return true; }
    }
  });
  controller.handleKeyDown(event(39, calls));
  assert.deepStrictEqual(calls, ['home'], 'Home directions must not enter playlist queue routing');
}());

(function testViewStatePageScrollAndNavigationReorder() {
  var calls = [];
  var state = { appView: 'library', viewStateOpen: true, pageScrollPendingFocus: true };
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return state; },
    overlays: { viewState: function () { calls.push('view-state'); } },
    lifecycle: {
      syncPageScrollFocus: function () { calls.push('page-sync'); },
      clearPageScrollPendingFocus: function () { calls.push('page-clear'); }
    },
    navigation: {
      moveReorderedLibrary: function (direction) { calls.push('move:' + direction); },
      finishReorder: function (save) { calls.push('finish:' + save); }
    },
    domains: { library: function () { calls.push('library'); return true; } }
  });

  controller.handleKeyDown(event(40, calls));
  assert.deepStrictEqual(calls, ['page-sync', 'page-clear', 'prevent:40', 'view-state'], 'page focus must synchronize before the active overlay prevents and consumes the direction');

  calls.length = 0;
  state.viewStateOpen = false;
  state.pageScrollPendingFocus = false;
  state.navReorderActive = true;
  controller.handleKeyDown(event(37, calls));
  state.navReorderReady = true;
  controller.handleKeyDown(event(13, calls));
  controller.handleKeyDown(event(461, calls));
  assert.deepStrictEqual(calls, ['prevent:37', 'move:-1', 'prevent:13', 'finish:true', 'prevent:461', 'finish:false']);
}());

(function testDownFromNavigationSynchronizesTheFocusedViewBeforeEnteringContent() {
  var calls = [];
  var state = { appView: 'settings', navigationHasFocus: true, navigationContentEntryFocused: true };
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return state; },
    navigation: { enterActiveView: function () { calls.push('enter-navigation'); } },
    domains: { settings: function () { calls.push('settings'); return true; } }
  });

  assert.strictEqual(controller.handleKeyDown(event(40, calls)), true);
  assert.deepStrictEqual(calls, ['prevent:40', 'enter-navigation'], 'Down from a navbar entry must commit its view before focus can enter stale page content');

  calls.length = 0;
  state.navigationContentEntryFocused = false;
  controller.handleKeyDown(event(40, calls));
  assert.deepStrictEqual(calls, ['settings'], 'special navbar controls must retain their view-owned Down behavior');
}());

(function testShortAndLongPressKeyUp() {
  var calls = [];
  var state = { navigationHasFocus: true, navHoldActive: true, navHoldTriggered: false, navReorderMode: false };
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return state; },
    navigation: {
      cancelHold: function () { calls.push('cancel-hold'); },
      enterActiveView: function () { calls.push('enter'); },
      markReorderReady: function () { calls.push('ready'); }
    },
    domains: { resetSeekRepeat: function () { calls.push('reset-seek'); } }
  });

  assert.strictEqual(controller.handleKeyUp(event(13, calls)), true);
  assert.deepStrictEqual(calls, ['cancel-hold', 'enter'], 'short OK release must enter the previewed library');

  calls.length = 0;
  state.navHoldActive = false;
  state.navHoldTriggered = true;
  state.navReorderMode = true;
  assert.strictEqual(controller.handleKeyUp(event(13, calls)), true);
  assert.deepStrictEqual(calls, ['ready'], 'long OK release must arm reorder confirmation without entering the view');

  calls.length = 0;
  controller.handleKeyUp(event(37, calls));
  controller.handleKeyUp(event(39, calls));
  assert.deepStrictEqual(calls, ['reset-seek', 'reset-seek'], 'releasing either seek arrow must reset repeat acceleration');
}());

(function testDestroyMakesDispatchInert() {
  var calls = [];
  var controller = InputController.create({
    InputTargetRouter: InputTargetRouter,
    sessionSnapshot: function () { return { appView: 'home' }; },
    domains: { home: function () { calls.push('home'); return true; } }
  });
  controller.destroy();
  assert.strictEqual(controller.handleKeyDown(event(13, calls)), false);
  assert.strictEqual(controller.handleKeyUp(event(13, calls)), false);
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(controller.snapshot().destroyed, true);
}());

console.log('Input controller checks passed');
