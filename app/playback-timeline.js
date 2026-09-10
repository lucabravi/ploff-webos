(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlaybackTimeline = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var PlaybackClock = values.PlaybackClock;
    var PlayerTimelinePolicy = values.PlayerTimelinePolicy;
    var PlexClient = values.PlexClient;
    var timerRoot = values.root || {};
    var clock = PlaybackClock.create(2);
    var timelineTimer = null;
    var estimatedEndTimer = null;
    var keepaliveTimer = null;
    var timelineSuppressed = false;

    function call(callback, arg1, arg2, arg3) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3); }
      return undefined;
    }

    function stopReporting() {
      if (timelineTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(timelineTimer); }
      if (estimatedEndTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(estimatedEndTimer); }
      timelineTimer = null;
      estimatedEndTimer = null;
    }

    function stopKeepalive() {
      if (keepaliveTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(keepaliveTimer); }
      keepaliveTimer = null;
    }

    function anchor(absolute, frozen) {
      clock = PlaybackClock.anchor(clock, absolute);
      clock = PlaybackClock.freeze(clock, !!frozen);
      return PlaybackClock.position(clock);
    }

    function freeze(frozen) {
      clock = PlaybackClock.freeze(clock, !!frozen);
      return PlaybackClock.position(clock);
    }

    function position() { return PlaybackClock.position(clock); }

    function observe(offsetBase, nativeTime, allowBackward) {
      var observation = PlaybackClock.observe(clock, offsetBase, nativeTime, allowBackward === true);
      clock = observation.state;
      return observation;
    }

    function settle(settler, settleOptions) {
      var result = typeof settler === 'function' ? settler(clock, settleOptions || {}) : null;
      if (result && result.clock) { clock = result.clock; }
      return result || { clock: clock, settled: false };
    }

    function publicTime(value, duration, terminal) {
      var total = Number(duration || 0);
      var current = Number(value);
      if (!isFinite(current)) { current = 0; }
      current = Math.max(0, current);
      if (total > 0) { current = Math.min(total, current); }
      return terminal === true && total > 0 ? total : current;
    }

    function setSuppressed(suppressed) { timelineSuppressed = suppressed === true; }
    function suppressed() { return timelineSuppressed; }

    function renderProgress(positionValue, duration, terminal, snapshot) {
      var total = Number(duration || 0);
      call(values.renderProgress, publicTime(positionValue, total, terminal), total, snapshot);
    }

    function updateEstimatedEnd(positionValue, duration, terminal, snapshot) {
      var total = Number(duration || 0);
      call(values.updateEstimatedEnd, publicTime(positionValue, total, terminal), total, snapshot);
    }

    function report(current, stateName, positionValue, duration, terminal, callback) {
      var reportPosition = publicTime(positionValue, duration, terminal);
      if (!PlayerTimelinePolicy.shouldReport({ hasPlayback: !!current, suppressed: timelineSuppressed, position: reportPosition })) {
        call(callback, reportPosition, false);
        return false;
      }
      PlexClient.sendTimeline(values.config, current, stateName, reportPosition * 1000, callback ? function (error) {
        callback(reportPosition, !error);
      } : undefined);
      return true;
    }

    function startReporting(accessors) {
      var source = accessors || {};
      var reportPosition = source.reportPosition || source.position;
      var estimatedPosition = source.estimatedPosition || source.position;
      stopReporting();
      if (!timerRoot.setInterval) { return false; }
      timelineTimer = timerRoot.setInterval(function () {
        report(call(source.current), call(source.state), call(reportPosition), call(source.duration), call(source.terminal));
      }, 3000);
      estimatedEndTimer = timerRoot.setInterval(function () {
        updateEstimatedEnd(call(estimatedPosition), call(source.duration), call(source.terminal), call(source.snapshot));
      }, 10000);
      updateEstimatedEnd(call(estimatedPosition), call(source.duration), call(source.terminal), call(source.snapshot));
      return true;
    }

    function startKeepalive(current, isCurrent) {
      stopKeepalive();
      if (!current || !current.transcodeSession || current.options && current.options.delivery === 'direct-play') { return false; }
      PlexClient.pingTranscode(values.config, current);
      if (!timerRoot.setInterval) { return true; }
      keepaliveTimer = timerRoot.setInterval(function () {
        if (call(isCurrent) !== true) { stopKeepalive(); return; }
        PlexClient.pingTranscode(values.config, current);
      }, 30000);
      return true;
    }

    function reset() {
      stopReporting();
      stopKeepalive();
      clock = PlaybackClock.create(2);
      timelineSuppressed = false;
    }

    if (!PlaybackClock || !PlayerTimelinePolicy || !PlexClient) { throw new Error('PlaybackTimeline requires clock, timeline policy, and Plex client capabilities'); }

    return {
      anchor: anchor,
      freeze: freeze,
      position: position,
      observe: observe,
      settle: settle,
      publicTime: publicTime,
      setSuppressed: setSuppressed,
      suppressed: suppressed,
      renderProgress: renderProgress,
      updateEstimatedEnd: updateEstimatedEnd,
      report: report,
      startReporting: startReporting,
      stopReporting: stopReporting,
      startKeepalive: startKeepalive,
      stopKeepalive: stopKeepalive,
      reset: reset
    };
  }

  return { create: create };
}));
