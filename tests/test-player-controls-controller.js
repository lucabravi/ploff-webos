'use strict';

var assert = require('assert');
var Controller = require('../app/coordinator/player-controls-controller');
var ControlsState = require('../app/player-controls-state');
var ChapterState = require('../app/chapter-state');
var SkipMarkerState = require('../app/skip-marker-state');

function fakeRoot() {
  var nextId = 1;
  var timers = {};
  return {
    setTimeout: function (callback) { var id = nextId; nextId += 1; timers[id] = callback; return id; },
    clearTimeout: function (id) { delete timers[id]; },
    runNext: function () {
      var ids = Object.keys(timers).map(Number).sort(function (a, b) { return a - b; });
      var callback;
      if (!ids.length) { return false; }
      callback = timers[ids[0]]; delete timers[ids[0]]; callback(); return true;
    },
    runAll: function () { var count = 0; while (count < 100 && this.runNext()) { count += 1; } return count; },
    pending: function () { return Object.keys(timers).length; }
  };
}

function key(code) { return { keyCode: code }; }

function createHarness(extra) {
  var root = fakeRoot();
  var now = extra && extra.now || 1000;
  var playback = {
    active: true,
    positionSeconds: extra && extra.position || 0,
    durationSeconds: 120,
    markers: extra && extra.markers || [
      { key: 'intro:10000:30000', type: 'intro', startTimeOffset: 10000, endTimeOffset: 30000 }
    ],
    chapters: extra && extra.chapters || [
      { key: 'one', startTimeOffset: 0, endTimeOffset: 30000 },
      { key: 'two', startTimeOffset: 30000, endTimeOffset: 90000 },
      { key: 'three', startTimeOffset: 90000, endTimeOffset: 120000 }
    ],
    skipPromptDuration: 5,
    seekSettling: extra && extra.seekSettling === true
  };
  var queue = { drawer: { open: false }, upNext: { visible: false, preparing: false } };
  var calls = [];
  var seeks = [];
  var skipRenders = [];
  var signature = 'initial';
  var rows = [
    { key: 'audio', disabled: false },
    { key: 'subtitles', disabled: true },
    { key: 'subtitle-advanced', disabled: false },
    { key: 'media-info', disabled: false },
    { key: 'version', disabled: false },
    { key: 'close', disabled: false }
  ];
  var actions = ['previous', 'toggle', 'next', 'queue', 'settings'];
  var queueAdapter = {
    snapshot: function () { return queue; },
    drawerSnapshot: function () { return queue.drawer; }
  };
  var controller = Controller.create({
    root: root,
    PlayerControlsState: ControlsState,
    ChapterState: ChapterState,
    SkipMarkerState: SkipMarkerState,
    queueController: queueAdapter,
    now: function () { return now; },
    playerActive: function () { return playback.active; },
    playbackSnapshot: function () { return playback; },
    buttonCount: function () { return actions.length; },
    buttonAvailable: function () { return true; },
    buttonAction: function (index) { return actions[index]; },
    settingsRows: function () { return rows; },
    settingsSignature: function () { return signature; },
    applySettings: function () { calls.push(['apply-settings']); },
    renderMode: function () {}, renderFocus: function () {}, renderChapters: function () {},
    renderSkip: function (snapshot) { skipRenders.push(snapshot.settingsOpen); }, renderSettings: function () {},
    onSettingsOpenChanged: function (open) { calls.push(['settings-open', open]); },
    toggle: function () { calls.push(['toggle']); },
    mediaPlay: function () { calls.push(['play']); },
    mediaPause: function () { calls.push(['pause']); },
    seekAbsolute: function (seconds, options) { seeks.push({ seconds: seconds, options: options || {} }); },
    startAdjacent: function (direction) { calls.push(['adjacent', direction]); },
    changeTrack: function (kind, value) { calls.push(['track', kind, value]); },
    changeVersion: function (value) { calls.push(['version', value]); },
    changeSetting: function (kind, value) { calls.push(['setting', kind, value]); },
    openSettingChoice: function (kind) { calls.push(['choice', kind]); },
    openSubtitleEditor: function () { calls.push(['subtitle-editor']); },
    openMediaInfo: function () { calls.push(['media-info']); },
    openQueue: function () { calls.push(['queue-open']); },
    closeQueue: function (restore) { calls.push(['queue-close', restore]); queue.drawer.open = false; },
    cancelUpNext: function () { calls.push(['up-next-cancel']); queue.upNext.visible = false; },
    closePlayer: function () { calls.push(['close-player']); }
  });
  return {
    root: root, controller: controller, calls: calls, seeks: seeks, skipRenders: skipRenders,
    setNow: function (value) { now = value; },
    setPosition: function (value) { playback.positionSeconds = value; },
    setSeekSettling: function (value) { playback.seekSettling = value === true; },
    setActive: function (value) { playback.active = value; },
    setQueue: function (value) { queue = value; },
    setSignature: function (value) { signature = value; },
    setRows: function (value) { rows = value; },
    setActions: function (value) { actions = value; }
  };
}

(function testHiddenFullTimelineAndSilentMediaKeys() {
  var h = createHarness();
  h.controller.initializeHidden();
  assert.strictEqual(h.controller.snapshot().mode, 'hidden');
  assert.strictEqual(h.controller.handleKey(key(13), null), true);
  assert.strictEqual(h.controller.snapshot().mode, 'full');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'toggle'; }), false, 'first OK only reveals controls');
  h.controller.hide(false);
  h.controller.handleKey(key(39), 'right');
  assert.strictEqual(h.controller.snapshot().mode, 'timeline');
  assert.strictEqual(h.seeks[0].seconds, 10);
  assert.strictEqual(h.seeks[0].options.source, 'remote');
  h.controller.hide(false);
  h.controller.handleKey(key(415), null);
  h.controller.handleKey(key(19), null);
  assert.deepStrictEqual(h.calls.slice(-2), [['play'], ['pause']], 'media keys must not reveal controls');
  assert.strictEqual(h.controller.snapshot().mode, 'hidden');
}());

(function testEverySeekIsAbsoluteAndPointerUsesInjectedCommand() {
  var h = createHarness({ position: 50 });
  h.controller.seekRelative(-1);
  h.controller.pointerSeek(75.5);
  assert.deepStrictEqual(h.seeks.map(function (entry) { return entry.seconds; }), [40, 75.5]);
  h.seeks.forEach(function (entry) {
    assert.ok(isFinite(entry.seconds) && entry.seconds >= 0, 'all seeks must be finite absolute Plex seconds');
  });
  assert.strictEqual(h.seeks[1].options.source, 'pointer');
}());

(function testChapterOpeningUsesCurrentAbsolutePosition() {
  var h = createHarness({ position: 42 });
  assert.strictEqual(h.controller.openChapters(), true);
  assert.strictEqual(h.controller.snapshot().chapter.index, 1, 'current chapter must be focused from absolute playback time');
  h.controller.moveChapter(1);
  assert.strictEqual(h.controller.snapshot().chapter.index, 2);
  assert.strictEqual(h.controller.activateChapter(), true);
  assert.strictEqual(h.seeks[0].seconds, 90);
  assert.strictEqual(h.seeks[0].options.source, 'chapter');
  assert.strictEqual(h.controller.snapshot().chapter.open, false);
  assert.strictEqual(h.controller.snapshot().zone, 'buttons');
}());

(function testSkipPromptLifetimeAndUpNextPrecedence() {
  var h = createHarness({ position: 20, now: 10000 });
  h.controller.initializeHidden();
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true);
  assert.strictEqual(h.controller.snapshot().zone, 'skip');
  assert.strictEqual(h.root.pending() > 0, true, 'timed skip prompt must own an expiry timer');
  h.setNow(16000); h.root.runNext();
  assert.strictEqual(h.controller.snapshot().skip.visible, false);
  h = createHarness({ position: 20 });
  h.setQueue({ drawer: { open: false }, upNext: { visible: true, preparing: false } });
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false, 'Up Next must suppress skip prompt');
}());

(function testActivatedSkipStaysHiddenUntilTheMarkerIsExited() {
  var h = createHarness({ position: 20, now: 1000 });
  h.controller.initializeHidden();
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true);
  assert.strictEqual(h.controller.snapshot().zone, 'skip');
  assert.strictEqual(h.controller.handleKey(key(13), null), true, 'OK must activate the focused skip marker');
  assert.strictEqual(h.seeks.length, 1, 'activating skip must issue one seek');
  assert.strictEqual(h.seeks[0].options.source, 'skip');
  assert.strictEqual(h.controller.snapshot().skip.visible, false, 'the skip marker must hide immediately after activation');
  assert.strictEqual(h.controller.snapshot().skip.consumed, true, 'the active marker must be remembered as consumed');

  h.controller.showFull();
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'a controls refresh while the seek is pending must not resurrect the consumed marker');
  h.setPosition(29);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'a new seek that remains inside the consumed interval must stay hidden');

  h.setPosition(30);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.marker, null,
    'reaching the exclusive marker end must clear the consumed interval');
  h.setPosition(20);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true,
    'seeking out and then back into the marker must allow a new skip prompt');
}());

(function testActivatedSkipSurvivesProjectedEndAndDecoderRollback() {
  var h = createHarness({ position: 20, now: 1000 });
  h.controller.initializeHidden();
  h.controller.updateSkip();
  h.controller.handleKey(key(13), null);
  assert.strictEqual(h.controller.snapshot().skip.consumed, true, 'activated intro must start consumed');

  h.setSeekSettling(true);
  h.setPosition(30);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.consumed, true,
    'the optimistic marker-end position must not clear consumption while the skip seek is settling');
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'the skip prompt must stay hidden at the projected marker end');

  h.setPosition(27);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'a bounded decoder rollback into the intro must not resurrect the consumed prompt');

  h.setSeekSettling(false);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.consumed, true,
    'once the decoder settles inside the consumed marker, consumption must remain until playback exits it');
  h.setPosition(30);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.marker, null,
    'after settlement, naturally exiting the marker must release the consumed state');
}());

(function testCompactOkActivatesVisibleSkipWithoutOpeningFullControls() {
  var h = createHarness({ position: 0, now: 10000 });
  h.controller.initializeHidden();
  h.controller.handleKey(key(39), 'right');
  assert.strictEqual(h.controller.snapshot().mode, 'timeline', 'seek input must leave compact timeline controls visible');
  assert.strictEqual(h.controller.snapshot().zone, 'timeline', 'timeline seek must retain timeline focus');

  h.setPosition(20);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true, 'entering the marker must show the skip prompt');
  assert.strictEqual(h.controller.snapshot().zone, 'timeline', 'the standalone prompt must not steal timeline focus');

  assert.strictEqual(h.controller.handleKey(key(13), null), true, 'OK must be handled while the standalone skip prompt is visible');
  assert.strictEqual(h.seeks.length, 2, 'OK must issue exactly one additional seek for the skip action');
  assert.strictEqual(h.seeks[1].seconds, 30, 'skip OK must seek to the marker end');
  assert.strictEqual(h.seeks[1].options.source, 'skip', 'skip OK must use the skip seek source');
  assert.strictEqual(h.controller.snapshot().mode, 'timeline', 'skip OK must not expand compact controls to full mode');
  assert.strictEqual(h.controller.snapshot().skip.visible, false, 'skip OK must hide the prompt immediately');
  assert.strictEqual(h.controller.snapshot().skip.consumed, true, 'skip OK must consume the active marker');

  h.setSeekSettling(true);
  h.setPosition(30);
  h.controller.updateSkip();
  h.setPosition(29.5);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'the skip seek target followed by a keyframe rollback must not resurrect the consumed prompt');
  h.setSeekSettling(false);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, false,
    'decoder settlement inside the consumed interval must keep the compact skip prompt hidden');
}());

(function testCompactOkAlsoActivatesCreditsMarker() {
  var h = createHarness({
    position: 70,
    now: 10000,
    markers: [{ key: 'credits:80000:90000', type: 'credits', startTimeOffset: 80000, endTimeOffset: 90000 }]
  });
  h.controller.initializeHidden();
  h.controller.handleKey(key(39), 'right');
  h.setPosition(85);
  h.controller.updateSkip();

  h.controller.handleKey(key(13), null);
  assert.strictEqual(h.seeks[h.seeks.length - 1].seconds, 90, 'OK must skip to the end of a visible credits marker');
  assert.strictEqual(h.seeks[h.seeks.length - 1].options.source, 'skip');
  assert.strictEqual(h.controller.snapshot().skip.visible, false, 'credits prompt must hide immediately after OK');
  assert.strictEqual(h.controller.snapshot().skip.consumed, true, 'credits marker must remain consumed after activation');
}());

(function testFullControlsKeepFocusedButtonPriorityOverVisibleSkip() {
  var h = createHarness({ position: 20, now: 10000 });
  h.controller.initializeHidden();
  h.controller.updateSkip();
  h.controller.showFull();
  h.controller.setZone('buttons', 1);
  assert.strictEqual(h.controller.snapshot().skip.visible, true, 'full controls may keep the active skip prompt visible');
  assert.strictEqual(h.controller.snapshot().mode, 'full');

  assert.strictEqual(h.controller.handleKey(key(13), null), true);
  assert.strictEqual(h.seeks.length, 0, 'full controls must not let a visible skip prompt override the focused button');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'toggle'; }), true,
    'full controls must preserve the focused Play/Pause action');
  assert.strictEqual(h.controller.snapshot().skip.visible, true, 'using another full-control action must not consume the skip marker');
}());

(function testSkipPromptDoesNotHijackTimelineSeekOrHorizontalInput() {
  var h = createHarness({ position: 0, now: 10000 });
  h.controller.initializeHidden();
  h.controller.handleKey(key(39), 'right');
  assert.strictEqual(h.controller.snapshot().zone, 'timeline');
  h.setPosition(20);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true, 'credits prompt may remain visible during timeline seeking');
  assert.strictEqual(h.controller.snapshot().zone, 'timeline', 'a newly visible skip prompt must not steal timeline focus');

  h = createHarness({ position: 20, now: 10000 });
  h.controller.initializeHidden();
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().zone, 'skip');
  h.controller.handleKey(key(39), 'right');
  assert.strictEqual(h.controller.snapshot().zone, 'skip', 'horizontal input on the skip prompt must not move focus to player buttons');
  assert.strictEqual(h.seeks.length, 0, 'horizontal input on the skip prompt must not seek or trigger another action');
}());

(function testSettingsOpenFocusesFirstSelectableRowAndRefreshesSkipPresentation() {
  var h = createHarness();
  h.setRows([
    { key: 'audio', disabled: true },
    { key: 'subtitles', disabled: true },
    { key: 'quality', disabled: false },
    { key: 'close', disabled: false }
  ]);
  h.controller.setSettingsOpen(true);
  assert.strictEqual(h.controller.snapshot().settingIndex, 2, 'player settings must focus the first selectable row');
  assert.strictEqual(h.skipRenders[h.skipRenders.length - 1], true, 'opening player settings must refresh the skip prompt as hidden');
}());

(function testSettingsChoicesAdvancedSubtitleAndFileInfo() {
  var h = createHarness();
  h.controller.setSettingsOpen(true);
  assert.strictEqual(h.controller.snapshot().settingIndex, 0);
  h.controller.moveSetting(1);
  assert.strictEqual(h.controller.snapshot().settingIndex, 2, 'disabled settings rows must be skipped');
  h.controller.handleKey(key(13), '');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'subtitle-editor'; }));
  assert.strictEqual(h.controller.snapshot().settingsOpen, false);
  h.controller.resumeSettings();
  h.controller.focusSetting(3); h.controller.handleKey(key(13), '');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'media-info'; }));
  assert.strictEqual(h.controller.snapshot().settingIndex, 3, 'opening media information must retain its settings-row origin');
  h.controller.resumeSettings();
  assert.strictEqual(h.controller.snapshot().settingsOpen, true);
  assert.strictEqual(h.controller.snapshot().settingIndex, 3, 'returning from media information must restore the same settings row');
  h.controller.focusSetting(0); h.controller.cycleSetting(1);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'track' && entry[1] === 'audio' && entry[2] === 1; }));
  h.controller.applySettingChoice('version', '1:0');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'version' && entry[1] === '1:0'; }));
  h.controller.resumeSettings();
  h.controller.focusSetting(5); h.controller.handleKey(key(13), '');
  assert.strictEqual(h.controller.snapshot().settingsOpen, false, 'the visible Close row must leave player settings');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'settings-open' && entry[1] === false; }), 'Close must use the shared settings-open command');
  h.controller.resumeSettings(); h.setSignature('changed'); h.controller.setSettingsOpen(false);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'apply-settings'; }));
}());

(function testDynamicButtonActionAndBackPrecedence() {
  var h = createHarness();
  h.setActions(['previous', 'toggle', 'next', 'queue', 'settings']);
  h.controller.focus('buttons', 3); h.controller.handleKey(key(13), null);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'queue-open'; }));
  h.setQueue({ drawer: { open: true }, upNext: { visible: false } });
  assert.strictEqual(h.controller.handleBack(), 'queue');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'queue-close' && entry[1] === true; }));
}());

(function testBackGraceAndDestroyIdempotency() {
  var h = createHarness({ position: 20, now: 1000 });
  h.controller.showFull(); h.controller.updateSkip();
  assert.ok(h.root.pending() > 0);
  assert.strictEqual(h.controller.handleBack(), 'controls');
  h.setNow(1500); assert.strictEqual(h.controller.handleBack(), 'player');
  h.controller.destroy(); h.controller.destroy();
  assert.strictEqual(h.root.pending(), 0);
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.handleKey(key(13), null), false);
}());

(function testCompletedPlaybackControlsResumeTheirNormalTimeoutAfterRewind() {
  var h = createHarness();
  h.controller.holdVisible();
  assert.strictEqual(h.controller.snapshot().mode, 'full', 'completed playback keeps the complete controls visible');
  assert.strictEqual(h.root.pending(), 0, 'completed playback must not schedule the normal controls timeout');
  h.controller.resumeAutoHide();
  assert.ok(h.root.pending() > 0, 'rewinding away from the end restores the normal controls timeout');
}());

(function testNativePlaybackIsolation() {
  var source = require('fs').readFileSync(require('path').join(__dirname, '../app/coordinator/player-controls-controller.js'), 'utf8');
  assert.ok(!/currentTime|\.src\s*=|PlaybackClock|rebuildCurrentStream|sendPlayerTimeline|player-video/.test(source), 'presentation controller must not own native stream or clock state');
}());



(function testExtractedZoneRoutingPreservesChaptersSettingsAndSkipPrecedence() {
  var h = createHarness({ position: 20 });
  h.controller.focus('buttons', 1);
  h.controller.handleKey(key(40), 'down');
  assert.strictEqual(h.controller.snapshot().chapter.open, true, 'Down from player buttons must open Chapters when chapters exist');
  h.controller.closeChapters(true);
  h.controller.focus('chapter-hint', 0);
  h.controller.handleKey(key(40), 'down');
  assert.strictEqual(h.controller.snapshot().chapter.open, true, 'Down from the chapter hint must open the same Chapters drawer');
  h.controller.closeChapters(true);
  h.controller.setSettingsOpen(true);
  h.controller.focus('buttons', 1);
  h.controller.handleKey(key(40), 'down');
  assert.strictEqual(h.controller.snapshot().chapter.open, false, 'Settings navigation must keep Down inside Settings instead of opening Chapters');
  assert.strictEqual(h.controller.snapshot().settingIndex, 2, 'Settings Down must still skip disabled rows after routing extraction');

  h = createHarness({ position: 20 });
  h.controller.focus('timeline', 0);
  h.controller.updateSkip();
  assert.strictEqual(h.controller.snapshot().skip.visible, true);
  h.controller.handleKey(key(38), 'up');
  assert.strictEqual(h.controller.snapshot().zone, 'skip', 'Up from timeline must still prioritize a visible Skip action');
}());

(function testInputRoutingDelegatesByInteractionZone() {
  var fs = require('fs');
  var path = require('path');
  var source = fs.readFileSync(path.join(__dirname, '../app/coordinator/player-controls-controller.js'), 'utf8');
  [
    'handleChaptersKey', 'handleSettingsKey', 'handleCompactModeKey',
    'handleSkipKey', 'handleTimelineKey', 'handleButtonsKey', 'handleChapterHintKey'
  ].forEach(function (name) {
    assert.ok(new RegExp('function ' + name + '\\(').test(source), 'player controls input routing must delegate to ' + name);
  });
  var start = source.indexOf('    function handleKey(event, _direction) {');
  var end = source.indexOf('    function pointerFocus(', start);
  var body = source.slice(start, end);
  assert.ok(body.split('\n').length <= 50, 'player controls handleKey must remain a compact interaction dispatcher');
}());

console.log('Player controls controller tests passed');
