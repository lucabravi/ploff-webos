'use strict';

var assert = require('assert');
var PlaybackClock = require('../app/playback-clock');
var PlayerTimelinePolicy = require('../app/player-timeline-policy');
var PlaybackTimeline = require('../app/playback-timeline');

function createRoot() {
  var intervals = [];
  return {
    intervals: intervals,
    clearInterval: function (timer) { if (timer) { timer.cleared = true; } },
    setInterval: function (callback, delay) {
      var timer = { callback: callback, delay: delay, cleared: false };
      intervals.push(timer);
      return timer;
    }
  };
}

function createTimeline(overrides) {
  var root = createRoot();
  var sent = [];
  var pings = [];
  var progress = [];
  var ends = [];
  var values = overrides || {};
  var PlexClient = {
    sendTimeline: function (config, current, stateName, offsetMs, callback) {
      sent.push({ config: config, current: current, state: stateName, offsetMs: offsetMs });
      if (callback) { callback(null); }
    },
    pingTranscode: function (config, current) { pings.push({ config: config, current: current }); }
  };
  var timeline = PlaybackTimeline.create({
    PlaybackClock: PlaybackClock,
    PlayerTimelinePolicy: PlayerTimelinePolicy,
    PlexClient: values.PlexClient || PlexClient,
    config: values.config || { server: 'plex' },
    root: root,
    renderProgress: function (position, duration, snapshot) { progress.push({ position: position, duration: duration, snapshot: snapshot }); },
    updateEstimatedEnd: function (position, duration, snapshot) { ends.push({ position: position, duration: duration, snapshot: snapshot }); }
  });
  return { timeline: timeline, root: root, sent: sent, pings: pings, progress: progress, ends: ends };
}

(function ownsStableClockAndPublicClamping() {
  var h = createTimeline();
  var observation;
  h.timeline.anchor(40, false);
  observation = h.timeline.observe(0, 42, false);
  assert.strictEqual(observation.time, 42);
  assert.strictEqual(h.timeline.position(), 42);
  h.timeline.freeze(true);
  observation = h.timeline.observe(0, 10, false);
  assert.strictEqual(observation.time, 42, 'frozen timeline must not regress to a transient native clock');
  assert.strictEqual(h.timeline.publicTime(120, 100, false), 100, 'public position must clamp to media duration');
  assert.strictEqual(h.timeline.publicTime(12, 100, true), 100, 'terminal playback must expose the exact media duration');
}());

(function decoderSettlementCanAdoptAClockWithoutOwningRepositionPolicy() {
  var h = createTimeline();
  var receivedClock;
  var result;
  h.timeline.anchor(40, false);
  result = h.timeline.settle(function (clock, options) {
    receivedClock = clock;
    return { clock: PlaybackClock.anchor(clock, options.actual), settled: true, actual: options.actual };
  }, { actual: 34 });
  assert.strictEqual(PlaybackClock.position(receivedClock), 40, 'timeline must pass its current clock into the reposition settler');
  assert.strictEqual(result.settled, true);
  assert.strictEqual(h.timeline.position(), 34, 'timeline must adopt the clock returned by reposition settlement');
}());

(function reportingOwnsPolicySuppressionAndPlexTimelineWrites() {
  var h = createTimeline();
  var current = { ratingKey: 'episode-1' };
  var callbackValue = null;
  assert.strictEqual(h.timeline.report(current, 'playing', 10, 100, false, function (position, reported) {
    callbackValue = { position: position, reported: reported };
  }), false);
  assert.deepStrictEqual(callbackValue, { position: 10, reported: false });
  assert.strictEqual(h.sent.length, 0, 'positions below the Plex reporting threshold must not write a timeline');
  h.timeline.setSuppressed(true);
  assert.strictEqual(h.timeline.report(current, 'paused', 40, 100, false), false, 'suppressed editor preview must not write a timeline');
  h.timeline.setSuppressed(false);
  callbackValue = null;
  assert.strictEqual(h.timeline.report(current, 'playing', 40, 100, false, function (position, reported) {
    callbackValue = { position: position, reported: reported };
  }), true);
  assert.deepStrictEqual(h.sent, [{ config: { server: 'plex' }, current: current, state: 'playing', offsetMs: 40000 }]);
  assert.deepStrictEqual(callbackValue, { position: 40, reported: true });
}());

(function failedPlexTimelineWriteIsNotReportedAsPersisted() {
  var callbackValue = null;
  var h = createTimeline({
    PlexClient: {
      sendTimeline: function (_config, _current, _stateName, _offsetMs, callback) { callback(new Error('timeline failed')); },
      pingTranscode: function () {}
    }
  });
  assert.strictEqual(h.timeline.report({ ratingKey: 'episode-1' }, 'playing', 40, 100, false, function (position, reported) {
    callbackValue = { position: position, reported: reported };
  }), true, 'eligible reporting still starts a Plex timeline attempt');
  assert.deepStrictEqual(callbackValue, { position: 40, reported: false },
    'a failed Plex timeline write must not be published as successfully reported');
}());

(function progressAndEstimatedEndUseTheSamePublicClockContract() {
  var h = createTimeline();
  var snapshot = { id: 'snapshot' };
  h.timeline.renderProgress(120, 100, false, snapshot);
  h.timeline.updateEstimatedEnd(12, 100, true, snapshot);
  assert.deepStrictEqual(h.progress, [{ position: 100, duration: 100, snapshot: snapshot }]);
  assert.deepStrictEqual(h.ends, [{ position: 100, duration: 100, snapshot: snapshot }]);
}());

(function reportingTimersStayTogetherAndUseCurrentCallbacks() {
  var h = createTimeline();
  var current = { ratingKey: 'episode-1' };
  var state = 'playing';
  var position = 40;
  var snapshot = { id: 1 };
  h.timeline.startReporting({
    current: function () { return current; },
    state: function () { return state; },
    position: function () { return position; },
    duration: function () { return 100; },
    terminal: function () { return false; },
    snapshot: function () { return snapshot; }
  });
  assert.strictEqual(h.root.intervals.length, 2, 'reporting must own the 3s Plex timer and 10s estimated-end timer together');
  assert.strictEqual(h.root.intervals[0].delay, 3000);
  assert.strictEqual(h.root.intervals[1].delay, 10000);
  assert.deepStrictEqual(h.ends, [{ position: 40, duration: 100, snapshot: snapshot }], 'estimated end must refresh immediately when reporting starts');
  state = 'paused';
  position = 45;
  h.root.intervals[0].callback();
  assert.strictEqual(h.sent[h.sent.length - 1].state, 'paused');
  assert.strictEqual(h.sent[h.sent.length - 1].offsetMs, 45000);
  h.root.intervals[1].callback();
  assert.deepStrictEqual(h.ends[h.ends.length - 1], { position: 45, duration: 100, snapshot: snapshot });
  h.timeline.stopReporting();
  assert.strictEqual(h.root.intervals[0].cleared, true);
  assert.strictEqual(h.root.intervals[1].cleared, true);
}());

(function reportingKeepsConfirmedPlexClockSeparateFromPendingDisplayTime() {
  var h = createTimeline();
  var current = { ratingKey: 'episode-1' };
  h.timeline.startReporting({
    current: function () { return current; },
    state: function () { return 'playing'; },
    reportPosition: function () { return 40; },
    estimatedPosition: function () { return 75; },
    duration: function () { return 100; },
    terminal: function () { return false; },
    snapshot: function () { return {}; }
  });
  h.root.intervals[0].callback();
  assert.strictEqual(h.sent[h.sent.length - 1].offsetMs, 40000, 'Plex reports must use the confirmed clock while a UI seek target is pending');
  assert.strictEqual(h.ends[0].position, 75, 'estimated-end UI may use the pending display position without changing the Plex clock');
}());

(function transcodeKeepaliveHasOneOwnerAndStopsWhenPlaybackChanges() {
  var h = createTimeline();
  var current = { options: { delivery: 'direct-stream' }, transcodeSession: 'session-1' };
  var samePlayback = true;
  h.timeline.startKeepalive(current, function () { return samePlayback; });
  assert.strictEqual(h.pings.length, 1, 'transcode playback must ping immediately');
  assert.strictEqual(h.root.intervals[h.root.intervals.length - 1].delay, 30000);
  h.root.intervals[h.root.intervals.length - 1].callback();
  assert.strictEqual(h.pings.length, 2);
  samePlayback = false;
  h.root.intervals[h.root.intervals.length - 1].callback();
  assert.strictEqual(h.pings.length, 2, 'stale playback keepalive must stop instead of pinging another session');
  assert.strictEqual(h.root.intervals[h.root.intervals.length - 1].cleared, true);

  h.timeline.startKeepalive({ options: { delivery: 'direct-play' }, transcodeSession: 'session-2' }, function () { return true; });
  assert.strictEqual(h.pings.length, 2, 'Direct Play must not create Plex transcode keepalive traffic');
}());

(function resetStopsTimersAndClearsClockAndSuppression() {
  var h = createTimeline();
  h.timeline.anchor(50, false);
  h.timeline.setSuppressed(true);
  h.timeline.startReporting({
    current: function () { return { ratingKey: 'episode-1' }; },
    state: function () { return 'playing'; },
    position: function () { return 50; },
    duration: function () { return 100; },
    terminal: function () { return false; },
    snapshot: function () { return {}; }
  });
  h.timeline.reset();
  assert.strictEqual(h.timeline.position(), 0);
  assert.strictEqual(h.timeline.suppressed(), false);
  assert.strictEqual(h.root.intervals[0].cleared, true);
  assert.strictEqual(h.root.intervals[1].cleared, true);
}());



(function retiredKeepaliveCallbackCannotStopTheNewSessionTimer() {
  var h = createTimeline();
  h.timeline.startKeepalive({ transcodeSession: 'a' }, function () { return false; });
  var old = h.root.intervals[0];
  h.timeline.reset({ server: 'b' });
  h.timeline.startKeepalive({ transcodeSession: 'b' }, function () { return true; });
  var next = h.root.intervals[1];
  old.callback();
  assert.strictEqual(next.cleared, false, 'a copied old timer must not cancel the replacement timer');
  next.callback();
  assert.strictEqual(h.pings[h.pings.length - 1].config.server, 'b');
  h.timeline.reset();
}());

(function retiredReportingCallbackCannotReportTheOldItemToTheNewServer() {
  var h = createTimeline({ config: { server: 'a' } });
  h.timeline.startReporting({
    current: function () { return { ratingKey: 'a' }; }, state: function () { return 'playing'; },
    position: function () { return 40; }, duration: function () { return 100; }
  });
  var old = h.root.intervals[0];
  h.timeline.reset({ server: 'b' });
  old.callback();
  assert.strictEqual(h.sent.length, 0, 'an already copied callback is still owned by its reporting lifetime');
}());

console.log('Playback timeline checks passed');
