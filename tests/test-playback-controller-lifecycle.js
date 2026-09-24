'use strict';
var assert = require('assert');
var Harness = require('./helpers/playback-controller-harness');
var failures = 0;
function test(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
function playing(h) {
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  h.video.dispatch('canplay'); h.root.runNextTimeout(); h.video.dispatch('playing');
}

test('a rejected native play from A cannot release the pending play for B', function () {
  var rejects = [];
  var plays = 0;
  var h = Harness.harness();
  h.video.play = function () {
    plays += 1;
    return { catch: function (callback) { rejects.push(callback); } };
  };
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  h.video.dispatch('canplay'); h.root.runNextTimeout();
  h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 0 });
  h.video.dispatch('canplay'); h.root.runNextTimeout();
  assert.strictEqual(plays, 2);
  rejects[0](new Error('old source aborted'));
  h.video.dispatch('canplay');
  assert.strictEqual(plays, 2, 'old rejection must not authorize another play');
  h.controller.destroy();
});

test('only the latest selection may install a source', function () {
  var writes = [];
  var aborted = 0;
  var callbacks = [];
  var h = Harness.harness({ prepare: function (options) {
    options.PlexClient.setStreamSelection = function (config, playback, selection, callback) {
      writes.push(callback); return { abort: function () { aborted += 1; } };
    };
  } });
  playing(h);
  h.video.currentTime = 10; h.video.dispatch('timeupdate');
  h.controller.changeTrack('audio', 'a2', function () { callbacks.push('old'); });
  h.video.currentTime = 20; h.video.dispatch('timeupdate');
  h.controller.changeTrack('audio', 'a1', function () { callbacks.push('new'); });
  writes[1](null);
  var count = h.video.sourceWrites.length;
  writes[0](null); writes[1](null);
  assert.strictEqual(h.video.sourceWrites.length, count, 'late or duplicate selection cannot restart playback');
  assert.deepStrictEqual(callbacks, ['new']);
  assert.strictEqual(aborted, 1);
  h.controller.destroy();
});

test('selection commit uses the current position rather than request time', function () {
  var complete;
  var h = Harness.harness({ prepare: function (options) {
    options.PlexClient.setStreamSelection = function (config, playback, selection, callback) {
      complete = callback; return { abort: function () {} };
    };
  } });
  playing(h);
  h.video.currentTime = 10; h.video.dispatch('timeupdate');
  h.controller.changeTrack('audio', 'a2');
  h.video.currentTime = 30; h.video.dispatch('timeupdate');
  complete(null);
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 30);
  h.controller.destroy();
});

test('duplicate preparation completion installs the native source exactly once', function () {
  var complete;
  var h = Harness.harness({ preparePlayback: function (config, playback, options, callback) {
    complete = callback; return { abort: function () {} };
  } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  complete(null, 'https://source.test/one.m3u8');
  var count = h.video.sourceWrites.length;
  complete(null, 'https://source.test/duplicate.m3u8');
  assert.strictEqual(h.video.sourceWrites.length, count);
  h.controller.destroy();
});

test('duplicate playback metadata cannot start another playback attempt', function () {
  var complete;
  var h = Harness.harness({ loadPlayback: function (config, key, session, options, callback) {
    complete = callback; return { abort: function () {} };
  } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  complete(null, Harness.playbackFixture());
  var count = h.video.sourceWrites.length;
  complete(null, Harness.playbackFixture());
  assert.strictEqual(h.video.sourceWrites.length, count);
  assert.strictEqual(h.playbackLoads(), 1);
  h.controller.destroy();
});

function assPlayback() {
  var playback = Harness.playbackFixture();
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = ['ass-a', 'ass-b'].map(function (id) {
    return { id: id, codec: 'ass', format: 'ass', external: true, key: '/subtitles/' + id };
  });
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  return playback;
}

test('closing after an asynchronous ASS cache miss aborts the live fallback request', function () {
  var claimComplete;
  var directComplete;
  var aborted = 0;
  var h = Harness.harness({
    playback: assPlayback(),
    subtitleRendering: function () { return { srt: true, ass: true }; },
    assSubtitlePrefetchIdentity: function () { return 'a|ass-a'; },
    AssSubtitlePrefetch: {
      claim: function (identity, callback) { claimComplete = callback; return { abort: function () {} }; },
      request: function () { throw new Error('not expected after claim error'); }
    },
    loadSubtitleText: function (config, current, track, callback) {
      directComplete = callback; return { abort: function () { aborted += 1; } };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  claimComplete(new Error('cache transport failed'));
  assert.strictEqual(typeof directComplete, 'function');
  h.controller.close();
  assert.strictEqual(aborted, 1, 'the owner must follow the request across fallback stages');
  directComplete(null, '[Script Info]');
  assert.strictEqual(h.controller.snapshot().active, false);
  h.controller.destroy();
});

test('a delayed ASS editor restore cannot seek or replace the next playback', function () {
  var restoreComplete;
  var loads = 0;
  var p = assPlayback();
  var h = Harness.harness({
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadPlayback: function (config, key, session, preferences, callback) {
      var next = key === 'a' ? p : Harness.playbackFixture();
      next.ratingKey = key; callback(null, next);
    },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: ' + track.id);
      return { abort: function () {} };
    },
    AssSubtitleRenderer: { create: function () { return {
      load: function (content, callback) {
        loads += 1;
        if (loads === 3) { restoreComplete = callback; }
        else { callback(null); }
      },
      setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
    }; } }
  });
  playing(h);
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  h.controller.cancelSubtitleEditor();
  assert.strictEqual(typeof restoreComplete, 'function', 'restore must actually be pending');
  h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 90 });
  var count = h.video.sourceWrites.length;
  restoreComplete(null);
  assert.strictEqual(h.video.sourceWrites.length, count, 'stale renderer cannot install a source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 90);
  assert.strictEqual(h.controller.snapshot().playback.ratingKey, 'b');
  h.controller.destroy();
});


test('startup transport failure may recover its route once before surfacing an error', function () {
  var loadConfigs = [];
  var recoveries = 0;
  var shownErrors = 0;
  var h = Harness.harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var error;
      loadConfigs.push(String(config.apiBaseUrl || ''));
      if (loadConfigs.length === 1) {
        error = new Error('route A unavailable');
        error.transportFailure = true;
        callback(error);
        return null;
      }
      callback(null, Harness.playbackFixture());
      return null;
    },
    showError: function () { shownErrors += 1; },
    prepare: function (options) {
      options.config = { apiBaseUrl: 'https://route-a.example', token: 'token-a' };
      options.recoverStartupRoute = function (error, request, callback) {
        recoveries += 1;
        assert.strictEqual(error.transportFailure, true);
        assert.strictEqual(request.detail.ratingKey, 'a');
        callback(null, { apiBaseUrl: 'https://route-b.example', token: 'token-a' });
        return null;
      };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  assert.deepStrictEqual(loadConfigs, ['https://route-a.example', 'https://route-b.example']);
  assert.strictEqual(recoveries, 1, 'startup failover must be bounded to one recovery attempt');
  assert.strictEqual(shownErrors, 0, 'a recovered route must not expose the transient startup failure');
  assert.strictEqual(h.errors.length, 0, 'a recovered route must not publish the transient startup error');
  assert.strictEqual(h.openings(), 1, 'route recovery must not dispatch a second Player open intent');
  assert.strictEqual(h.playbackLoads(), 1, 'only the recovered metadata load may establish playback');
  h.controller.destroy();
});

test('startup route recovery never handles HTTP or application failures', function () {
  var recoveries = 0;
  var loads = 0;
  var shownErrors = 0;
  var h = Harness.harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var error = new Error('Plex rejected playback');
      error.status = 503;
      error.transportFailure = false;
      loads += 1;
      callback(error);
      return null;
    },
    showError: function () { shownErrors += 1; },
    prepare: function (options) {
      options.recoverStartupRoute = function () { recoveries += 1; };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  assert.strictEqual(loads, 1);
  assert.strictEqual(recoveries, 0, 'HTTP/application errors must not trigger route failover');
  assert.strictEqual(shownErrors, 1, 'non-transport startup errors retain the normal error path');
  h.controller.destroy();
});

test('startup route recovery is bounded even if the promoted route also fails', function () {
  var recoveries = 0;
  var loads = 0;
  var shownErrors = 0;
  var h = Harness.harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var error = new Error('transport unavailable');
      error.transportFailure = true;
      loads += 1;
      callback(error);
      return null;
    },
    showError: function () { shownErrors += 1; },
    prepare: function (options) {
      options.config = { apiBaseUrl: 'https://route-a.example' };
      options.recoverStartupRoute = function (error, request, callback) {
        recoveries += 1;
        callback(null, { apiBaseUrl: 'https://route-b.example' });
        return null;
      };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  assert.strictEqual(loads, 2, 'the same Play intent may retry loadPlayback only once');
  assert.strictEqual(recoveries, 1, 'the retry must not recursively request another failover');
  assert.strictEqual(shownErrors, 1, 'the second transport failure must enter the normal error path');
  h.controller.destroy();
});

test('closing while startup failover is pending retires the retry', function () {
  var recoveryComplete;
  var loads = 0;
  var h = Harness.harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var error = new Error('route unavailable');
      error.transportFailure = true;
      loads += 1;
      callback(error);
      return null;
    },
    prepare: function (options) {
      options.recoverStartupRoute = function (error, request, callback) {
        recoveryComplete = callback;
        return null;
      };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  assert.strictEqual(typeof recoveryComplete, 'function');
  h.controller.close();
  recoveryComplete(null, { apiBaseUrl: 'https://route-b.example' });
  assert.strictEqual(loads, 1, 'Back/close must prevent a late failover completion from retrying playback');
  assert.strictEqual(h.controller.snapshot().active, false);
  h.controller.destroy();
});

test('a superseding open retires the previous pending startup failover', function () {
  var oldRecoveryComplete;
  var loads = [];
  var h = Harness.harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var error;
      loads.push(key);
      if (key === 'a') {
        error = new Error('old route unavailable');
        error.transportFailure = true;
        callback(error);
      } else {
        var playback = Harness.playbackFixture();
        playback.ratingKey = key;
        callback(null, playback);
      }
      return null;
    },
    prepare: function (options) {
      options.recoverStartupRoute = function (error, request, callback) {
        oldRecoveryComplete = callback;
        return null;
      };
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  assert.strictEqual(typeof oldRecoveryComplete, 'function');
  h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 0 });
  oldRecoveryComplete(null, { apiBaseUrl: 'https://late-route.example' });
  assert.deepStrictEqual(loads, ['a', 'b'], 'late recovery from the superseded Play intent must not dispatch another load');
  assert.strictEqual(h.controller.snapshot().playback.ratingKey, 'b');
  h.controller.destroy();
});

if (failures) { process.exitCode = 1; }
else { console.log('Playback lifecycle operation checks passed'); }
