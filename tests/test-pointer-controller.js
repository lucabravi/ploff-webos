'use strict';

var assert = require('assert');
var PointerController = require('../app/coordinator/pointer-controller');

function timerRoot() {
  var next = 1;
  var timers = {};
  return {
    innerHeight: 1000,
    pageXOffset: 0,
    timers: timers,
    setTimeout: function (callback, delay) {
      var id = next;
      next += 1;
      timers[id] = { callback: callback, delay: delay };
      return id;
    },
    clearTimeout: function (id) { delete timers[id]; },
    runDelay: function (delay) {
      Object.keys(timers).map(Number).forEach(function (id) {
        if (timers[id] && timers[id].delay === delay) {
          var callback = timers[id].callback;
          delete timers[id];
          callback();
        }
      });
    }
  };
}

function button(attributes, options) {
  var attrs = attributes || {};
  var values = options || {};
  return {
    tagName: 'BUTTON',
    id: values.id || '',
    className: values.className || '',
    disabled: values.disabled === true,
    parentNode: values.parentNode || null,
    onclick: values.onclick || null,
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    getAttribute: function (name) { return attrs[name]; },
    contains: function (target) { return target === this; },
    getBoundingClientRect: function () { return values.rect || { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 }; }
  };
}

var root = timerRoot();
var clock = 1000;
var inputCodes = [];
var pressedCodes = [];
var calls = [];
var focusSelectionStates = [];
var scrolled = [];
var blurred = 0;
var mediaHoldEnabled = false;
var mediaHolding = false;
var mediaHoldTriggered = false;
var session = {
  appView: 'home', homeArea: 'media', libraryZone: '', libraryViewKey: '', watchlistZone: '', searchZone: '',
  serverEditorOpen: false, languageKind: '', summaryDialogOpen: false,
  navigationHasFocus: false, navReorderMode: false, navReorderReady: false, navHoldTriggered: false,
  choiceDialogOpen: false, privacyDialogOpen: false, updateDialogOpen: false, resumeChoiceOpen: false, subtitleEditorOpen: false,
  playerControlsMode: 'hidden', playerChapterOpen: false, playerSettingsOpen: false, safeAreaOpen: false, subtitleStyleOpen: false
};
var visibleHome = button({ 'data-row-index': '2', 'data-column': '1' }, { rect: { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50 } });
var content = {
  clientHeight: 800,
  scrollTop: 0,
  scrollBy: function (options) { scrolled.push(options); },
  getBoundingClientRect: function () { return { left: 0, top: 0, right: 1600, bottom: 800 }; },
  querySelectorAll: function () { return [visibleHome]; }
};
var elements = { content: content };
var document = {
  activeElement: { blur: function () { blurred += 1; } },
  getElementById: function (id) { return elements[id] || null; },
  querySelectorAll: function () { return []; }
};
var controller;

controller = PointerController.create({
  root: root,
  document: document,
  now: function () { return clock; },
  sessionSnapshot: function () { return session; },
  wheelBehavior: function () { return session.wheelBehavior || 'items'; },
  inputKey: function (event) { inputCodes.push(event.keyCode); },
  inputPress: function (event) { pressedCodes.push(event.keyCode); calls.push('press:' + event.keyCode); },
  capture: {
    focus: function (target) {
      if (target.hasAttribute('data-queue-index')) { calls.push('queue-focus:' + target.getAttribute('data-queue-index')); return true; }
      return false;
    },
    click: function (event, target) {
      if (target.hasAttribute('data-queue-index')) { calls.push('queue-click:' + target.getAttribute('data-queue-index')); return true; }
      return false;
    }
  },
  focus: {
    home: function (row, column) {
      focusSelectionStates.push(controller.isSelectionActive());
      calls.push('focus-home:' + row + ':' + column);
    },
    navigation: function (index) { calls.push('focus-nav:' + index); },
    search: function () { calls.push('focus-search'); },
    settings: function (index) { calls.push('focus-setting:' + index); },
    safeArea: function (index) { calls.push('focus-safe-area:' + index); },
    subtitleStyle: function (index) { calls.push('focus-subtitle-style:' + index); },
    diagnostics: function (index) { calls.push('focus-diagnostics:' + index); },
    updateDialog: function (index) { calls.push('focus-update:' + index); },
    resume: function (index) { calls.push('focus-resume:' + index); },
    player: function (zone, index) { calls.push('focus-player:' + zone + ':' + index); }
  },
  contextMenu: {
    canOpen: function () { return mediaHoldEnabled; },
    startHold: function () { mediaHolding = true; calls.push('media-hold-start'); return true; },
    holding: function () { return mediaHolding; },
    releaseHold: function () { mediaHolding = false; calls.push('media-hold-release'); return mediaHoldTriggered; }
  },
  selectAccent: function (color) { calls.push('accent:' + color); },
  navigation: {
    startHold: function (index) { calls.push('hold:' + index); },
    cancelHold: function () { calls.push('cancel-hold'); },
    markReorderReady: function () { calls.push('reorder-ready'); },
    finishReorder: function () { calls.push('finish-reorder'); }
  },
  page: {
    restoreHome: function (row, column) { calls.push('restore-home:' + row + ':' + column); },
    scrollSummary: function (direction) { calls.push('summary:' + direction); },
    beginLibraryWheel: function (duration) { calls.push('library-wheel:' + duration); }
  },
  player: {
    playbackSnapshot: function () { return { active: true, streamSwitching: false, durationSeconds: 200 }; },
    seekTimeline: function (seconds) { calls.push('seek:' + seconds); },
    activity: function () { calls.push('player-activity'); },
    renewControls: function () { calls.push('renew-controls'); },
    settingRows: function () { return []; },
    settingIndex: function () { return 0; }
  }
});

assert.deepStrictEqual(Object.keys(controller).sort(), [
  'clearPageScrollPendingFocus', 'clearWheelNavigation', 'destroy', 'handleClick', 'handleDown',
  'handleMove', 'handleOver', 'handleUp', 'handleWheel', 'isSelectionActive',
  'isWheelNavigationActive', 'seekTimelineFromPointer', 'snapshot', 'syncFocus', 'syncPageFocus'
], 'pointer controller must expose only its explicit event, state and lifecycle contract');

var first = button({ 'data-row-index': '0', 'data-column': '0' });
var second = button({ 'data-row-index': '1', 'data-column': '2' });
controller.handleMove({ clientX: 10, clientY: 10, target: first });
controller.handleMove({ clientX: 20, clientY: 20, target: second });
assert.strictEqual(calls.length, 0, 'movement below the priming threshold must not steal focus');
controller.handleMove({ clientX: 45, clientY: 10, target: second });
assert.ok(calls.indexOf('focus-home:1:2') >= 0, 'real pointer movement to another button must focus that card');
assert.deepStrictEqual(focusSelectionStates, [true], 'native focus suppression must remain active while logical pointer focus is rendered');
assert.strictEqual(controller.isSelectionActive(), false, 'pointer focus suppression must end after rendering');

controller.handleClick({ target: second });
assert.deepStrictEqual(pressedCodes, [13], 'pointer click must route one semantic OK press after focusing the Home card');

var setting = button({ 'data-setting-index': '4' });
session.appView = 'settings';
controller.handleClick({ target: setting });
assert.ok(calls.indexOf('focus-setting:4') >= 0, 'pointer clicks must focus the addressed Settings row');
assert.deepStrictEqual(pressedCodes, [13, 13], 'pointer clicks must use the same semantic OK path for Settings rows');
session.safeAreaOpen = true;
assert.strictEqual(controller.syncFocus(button({ 'data-safe-area-index': '6' })), true, 'pointer movement must enter the safe-area modal focus model');
assert.ok(calls.indexOf('focus-safe-area:6') >= 0, 'pointer focus must address safe-area actions while the modal is open');
session.safeAreaOpen = false;
session.subtitleStyleOpen = true;
assert.strictEqual(controller.syncFocus(button({ 'data-subtitle-style-index': '5' })), true, 'pointer movement must enter the subtitle appearance modal focus model');
assert.ok(calls.indexOf('focus-subtitle-style:5') >= 0, 'pointer focus must address subtitle appearance actions while the modal is open');
session.subtitleStyleOpen = false;
session.updateDialogOpen = true;
var updateClose = button({ 'data-update-index': '1' });
controller.handleClick({ target: updateClose });
assert.ok(calls.indexOf('focus-update:1') >= 0, 'update dialog clicks must synchronize the focused action before semantic OK');
assert.deepStrictEqual(pressedCodes, [13, 13, 13], 'update dialog clicks must use the shared semantic OK path');
pressedCodes.pop();
session.updateDialogOpen = false;
session.resumeChoiceOpen = true;
session.appView = 'player';
var resumeCancel = button({ 'data-resume-index': '2' });
controller.handleClick({ target: resumeCancel });
assert.ok(calls.indexOf('focus-resume:2') >= 0, 'resume dialog clicks must synchronize the selected action before semantic OK');
assert.deepStrictEqual(pressedCodes, [13, 13, 13], 'resume dialog clicks must use the shared semantic OK path');
pressedCodes.pop();
session.resumeChoiceOpen = false;
session.appView = 'home';

session.appView = 'diagnostics';
assert.strictEqual(controller.syncFocus(button({ 'data-diagnostics-action': 'refresh' })), true, 'pointer focus must route diagnostics Refresh');
assert.strictEqual(controller.syncFocus(button({ 'data-diagnostics-action': 'export' })), true, 'pointer focus must route diagnostics Export');
assert.strictEqual(controller.syncFocus(button({ 'data-diagnostics-action': 'back' })), true, 'pointer focus must route diagnostics Back');
assert.ok(calls.indexOf('focus-diagnostics:0') >= 0 && calls.indexOf('focus-diagnostics:1') >= 0 && calls.indexOf('focus-diagnostics:2') >= 0, 'all diagnostics actions must receive their own focus slot');
session.appView = 'home';

var queue = button({ 'data-queue-index': '4' });
controller.handleOver({ target: queue, relatedTarget: null });
controller.handleClick({ target: queue });
assert.ok(calls.indexOf('queue-focus:4') >= 0, 'queue hover capture must run before generic focus routing');
assert.ok(calls.indexOf('queue-click:4') >= 0, 'queue click capture must run before generic activation');
assert.deepStrictEqual(pressedCodes, [13, 13], 'captured pointer clicks must not also trigger semantic OK');

var timeline = button({}, { id: 'player-timeline-button', rect: { left: 100, top: 0, right: 500, bottom: 50, width: 400, height: 50 } });
var prevented = 0;
controller.handleClick({ target: timeline, clientX: 300, preventDefault: function () { prevented += 1; } });
assert.ok(calls.indexOf('seek:100') >= 0, 'timeline pointer seek must convert the click ratio to an absolute playback time');
assert.strictEqual(prevented, 1, 'timeline seek must suppress the native click behavior');
assert.deepStrictEqual(pressedCodes, [13, 13], 'coordinate-based timeline clicks must remain outside generic OK routing');

session.wheelBehavior = 'items';
controller.handleWheel({ deltaY: 5, preventDefault: function () { prevented += 1; } });
controller.handleWheel({ deltaY: 5, preventDefault: function () { prevented += 1; } });
assert.deepStrictEqual(inputCodes, [40], 'wheel item mode must debounce and route one Down key through the input controller');
assert.strictEqual(prevented, 3, 'debounced wheel events must still be canceled');
root.runDelay(70);
controller.handleWheel({ wheelDelta: 5, preventDefault: function () {} });
assert.deepStrictEqual(inputCodes, [40, 38], 'legacy wheelDelta must normalize to Up navigation');
root.runDelay(70);

session.wheelBehavior = 'page';
controller.handleWheel({ deltaY: 8, preventDefault: function () {} });
assert.strictEqual(scrolled.length, 1, 'page wheel mode must scroll the active view container');
assert.strictEqual(scrolled[0].top, 440, 'page scrolling must retain the fifty-five percent viewport step');
assert.strictEqual(blurred, 1, 'page scrolling must release native focus before moving content');
assert.strictEqual(controller.snapshot().pageScrollPendingFocus, true, 'page scrolling must defer logical focus restoration to the next arrow key');
assert.strictEqual(controller.isWheelNavigationActive(), true, 'page scrolling must suppress duplicate virtual-grid focus movement');
assert.strictEqual(controller.syncPageFocus(), true, 'page focus restoration must find the first visible card');
assert.ok(calls.indexOf('restore-home:2:1') >= 0, 'page focus restoration must preserve visible Home row and column coordinates');
controller.clearPageScrollPendingFocus();
assert.strictEqual(controller.snapshot().pageScrollPendingFocus, false, 'input routing must be able to clear pending page focus explicitly');
root.runDelay(350);
assert.strictEqual(controller.isWheelNavigationActive(), false, 'wheel-navigation suppression must expire after the original interval');
root.runDelay(70);

var third = button({ 'data-row-index': '3', 'data-column': '0' });
var countBeforeLockMove = calls.length;
clock += 600;
controller.handleMove({ clientX: 50, clientY: 20, target: third });
assert.strictEqual(calls.length, countBeforeLockMove, 'small movement after wheel scrolling must not steal focus while the pointer is locked');
controller.handleMove({ clientX: 50, clientY: 400, target: third });
assert.ok(calls.indexOf('focus-home:3:0') >= 0, 'moving across thirty percent of the screen must unlock pointer focus');

mediaHoldEnabled = true;
mediaHoldTriggered = true;
var pressesBeforeMediaHold = pressedCodes.length;
controller.handleDown({ target: second, button: 0 });
assert.ok(calls.indexOf('media-hold-start') >= 0, 'Magic Remote center down on a media card must start the contextual hold');
controller.handleUp({ preventDefault: function () { calls.push('media-up-prevent'); }, stopPropagation: function () { calls.push('media-up-stop'); } });
controller.handleClick({ target: second, preventDefault: function () { calls.push('media-click-prevent'); }, stopPropagation: function () { calls.push('media-click-stop'); } });
assert.strictEqual(pressedCodes.length, pressesBeforeMediaHold, 'the click emitted after a triggered Magic Remote long press must not open the media');
assert.ok(calls.indexOf('media-click-prevent') >= 0 && calls.indexOf('media-click-stop') >= 0, 'the post-hold click must be consumed once');
mediaHoldEnabled = false;
mediaHoldTriggered = false;

var nav = button({ 'data-nav-index': '2' });
session.navigationHasFocus = true;
controller.handleDown({ target: nav });
assert.ok(calls.indexOf('hold:2') >= 0, 'pointer down on focused navigation must start the reorder hold');
session.navHoldTriggered = true;
session.navReorderMode = true;
controller.handleUp();
assert.ok(calls.indexOf('reorder-ready') >= 0, 'pointer up after a triggered hold must arm reorder completion');
var activationsBeforeSuppressedClick = calls.filter(function (entry) { return entry === 'finish-reorder'; }).length;
controller.handleClick({
  target: nav,
  preventDefault: function () { calls.push('suppressed-prevent'); },
  stopPropagation: function () { calls.push('suppressed-stop'); }
});
assert.ok(calls.indexOf('suppressed-prevent') >= 0 && calls.indexOf('suppressed-stop') >= 0, 'long-press click suppression must stop the captured click before it reaches button onclick handlers');
assert.strictEqual(calls.filter(function (entry) { return entry === 'finish-reorder'; }).length, activationsBeforeSuppressedClick, 'the synthetic click following a long press must be suppressed once');
session.navReorderReady = true;
controller.handleClick({ target: nav });
assert.ok(calls.indexOf('finish-reorder') >= 0, 'a later navigation click must finish the armed reorder');

var searchKey = button({ 'data-search-key': 'a' });
session.navReorderMode = false;
session.navigationHasFocus = false;
session.appView = 'search';
controller.handleClick({ target: searchKey });
assert.ok(calls.indexOf('focus-search') >= 0, 'pointer clicks must first synchronize Search focus');
assert.deepStrictEqual(pressedCodes, [13, 13, 13], 'Search clicks must activate through the same semantic OK path');

var nativeOption = button({ 'data-up-next-layout': 'compact' });
controller.handleClick({ target: nativeOption });
assert.deepStrictEqual(pressedCodes, [13, 13, 13], 'controls with dedicated native click handling must not activate stale logical focus');

controller.destroy();
controller.destroy();
assert.strictEqual(controller.snapshot().destroyed, true, 'destroy must be idempotent');
var callsAfterDestroy = calls.length;
controller.handleClick({ target: second });
controller.handleWheel({ deltaY: 1, preventDefault: function () {} });
assert.strictEqual(calls.length, callsAfterDestroy, 'destroyed pointer controllers must ignore late input');
assert.strictEqual(Object.keys(root.timers).length, 0, 'destroy must cancel pointer-owned timers');


(function testPointerOwnershipWasRemovedFromLegacyRuntime() {
  var fs = require('fs');
  var path = require('path');
  var project = path.join(__dirname, '..');
  var runtime = fs.readFileSync(path.join(project, 'app/coordinator/application-controller.js'), 'utf8');
  var wiring = runtime;
  var builder = require('../scripts/build-app');
  assert.strictEqual(fs.existsSync(path.join(project, 'app/source')), false, 'the final legacy source directory must be deleted');
  assert.ok(!/var (suppressNextPointerClick|pointerOriginX|pointerOriginY|pointerOriginTarget|pointerPrimed|pointerSelectionActive|pointerSuppressedUntil|pointerCurrentButton|wheelDebounceTimer|pageScrollPendingFocus|wheelPointerLocked|wheelPointerLockX|wheelPointerLockY|pointerLastX|pointerLastY)/.test(runtime), 'pointer state must no longer be owned by the shared runtime');
  assert.ok(builder.MODULE_FILES.indexOf('pointer-controller.js') !== -1 && !Object.prototype.hasOwnProperty.call(builder, 'LEGACY_FILES'), 'the generated bundle must load the controller instead of the deleted fragment');
  assert.ok(/name: 'mouseover', handler: pointerController\.handleOver/.test(wiring) && /name: 'click', handler: pointerController\.handleClick, options: true/.test(wiring), 'all Magic Remote events must bind directly to the pointer controller');
}());

console.log('Pointer controller checks passed');
