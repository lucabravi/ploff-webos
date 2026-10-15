(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLaunchCommandController = factory(); }
}(this, function () {
  'use strict';

  function parse(params) {
    var command;
    var ratingKey;
    if (typeof params === 'string') {
      if (params.length > 4096) { throw new Error('invalid_command'); }
      try { params = JSON.parse(params); } catch (_error) { throw new Error('invalid_command'); }
    }
    if (!params || !Object.prototype.hasOwnProperty.call(params, 'ploff')) { return null; }
    command = params.ploff;
    if (!command || typeof command !== 'object' || Array.isArray(command)) { throw new Error('invalid_command'); }
    Object.keys(command).forEach(function (key) {
      if (['version', 'action', 'requestId', 'serverMachineIdentifier', 'ratingKey', 'type', 'resume', 'issuedAt'].indexOf(key) < 0) {
        throw new Error('unsupported_parameter');
      }
    });
    // HA's native YAML templates can turn a digit-only string into an integer.
    ratingKey = command.ratingKey;
    if (typeof ratingKey === 'number' && isFinite(ratingKey) && ratingKey >= 0 &&
        Math.floor(ratingKey) === ratingKey && ratingKey <= 9007199254740991) { ratingKey = String(ratingKey); }
    if (command.version !== 1 || command.action !== 'play' ||
        typeof command.requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(command.requestId) ||
        typeof command.serverMachineIdentifier !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(command.serverMachineIdentifier) ||
        typeof ratingKey !== 'string' || !/^[0-9]{1,20}$/.test(ratingKey) ||
        ['item', 'playlist', 'collection'].indexOf(command.type) < 0 ||
        (command.resume !== undefined && typeof command.resume !== 'boolean') ||
        (command.issuedAt !== undefined && (typeof command.issuedAt !== 'number' || !isFinite(command.issuedAt)))) {
      throw new Error('invalid_command');
    }
    return {version: 1, action: 'play', requestId: command.requestId,
      serverMachineIdentifier: command.serverMachineIdentifier, ratingKey: ratingKey,
      type: command.type, resume: command.resume !== false, issuedAt: command.issuedAt};
  }

  function create(options) {
    var ports = options || {};
    var root = ports.root;
    var video = ports.video || ports.document.getElementById('player-video');
    var pending = null;
    var timer = null;
    var destroyed = false;
    var playingEpoch = 0;
    var history = [];
    var last = {state: 'idle'};
    function now() { return ports.now ? ports.now() : new Date().getTime(); }
    function publish(state, reason, command) {
      last = {requestId: command ? command.requestId : '', state: state, reason: reason || ''};
      if (ports.publish) { ports.publish(snapshot()); }
    }
    function snapshot() { return {requestId: last.requestId || '', state: last.state, reason: last.reason || ''}; }
    function active(job) { return !destroyed && pending === job; }
    function clearTimer() { if (timer !== null) { root.clearTimeout(timer); timer = null; } }
    function stop(job, state, reason) {
      if (!active(job)) { return; }
      pending = null;
      clearTimer();
      if (job.request && job.request.abort) { job.request.abort(); }
      // Only a failed/displaced attempt owns cancellation. Successful playback remains alive.
      if (state !== 'playing' && job.started && ports.cancelStart) { ports.cancelStart(); }
      publish(state, reason, job.command);
      job.record.result = snapshot();
    }
    function cancel(reason) { if (pending) { stop(pending, 'cancelled', reason || 'cancelled'); } }
    function fail(job, reason) {
      stop(job, 'error', reason);
      if (ports.showError) { ports.showError(reason); }
    }
    function schedule(job) {
      clearTimer();
      timer = root.setTimeout(function () { timer = null; tick(job); }, Math.min(250, Math.max(0, job.deadline - now())));
    }
    function tick(job) {
      var context;
      var status;
      if (!active(job)) { return; }
      if (now() >= job.deadline) { fail(job, 'launch_timeout'); return; }
      if (ports.hidden && ports.hidden()) {
        if (job.foregroundSeen) { cancel('app_hidden'); }
        else { schedule(job); }
        return;
      }
      job.foregroundSeen = true;
      if (job.started) {
        status = ports.observe();
        if (status.error) { fail(job, 'playback_failed'); return; }
        if (job.expected && playingEpoch > job.playingEpoch && status.playing &&
            status.ratingKey === job.expected && status.serverMachineIdentifier === job.command.serverMachineIdentifier) {
          stop(job, 'playing', ''); return;
        }
      } else if (!job.loading) {
        context = ports.context(job.command.serverMachineIdentifier);
        if (context) { load(job, context); }
      }
      if (active(job)) { schedule(job); }
    }
    function load(job, context) {
      var completed = false;
      var handle;
      job.loading = true;
      publish('loading', '', job.command);
      handle = ports.load(job.command, context, function (error, target) {
        completed = true;
        if (!active(job)) { return; }
        job.request = null;
        if (now() >= job.deadline) { fail(job, 'launch_timeout'); return; }
        if (error || !target) { fail(job, 'media_unavailable'); return; }
        ports.ready(function (readyError) {
          if (!active(job)) { return; }
          if (now() >= job.deadline) { fail(job, 'launch_timeout'); return; }
          if (readyError) { fail(job, 'player_unavailable'); return; }
          job.started = true;
          job.playingEpoch = playingEpoch;
          publish('starting', '', job.command);
          try {
            if (ports.start(target, context, job.command.resume, function (startError, ratingKey) {
              if (!active(job)) { return; }
              if (now() >= job.deadline) { fail(job, 'launch_timeout'); return; }
              if (startError) { fail(job, 'playback_failed'); return; }
              job.expected = String(ratingKey || '');
            }) === false) { fail(job, 'playback_failed'); }
          } catch (_error) { fail(job, 'playback_failed'); }
        });
      });
      if (!completed && active(job)) { job.request = handle; }
    }
    function submit(params) {
      var command;
      var fingerprint;
      var record;
      var i;
      if (destroyed) { return false; }
      try { command = parse(params); }
      catch (error) {
        if (!pending) { publish('error', error.message, null); }
        return false;
      }
      if (!command) { return false; }
      fingerprint = [command.serverMachineIdentifier, command.type, command.ratingKey, command.resume].join('|');
      for (i = 0; i < history.length; i += 1) {
        if (history[i].id === command.requestId) {
          if (history[i].fingerprint !== fingerprint) { return false; }
          // Duplicate launch events and transport retries never restart a request.
          return true;
        }
      }
      if (command.issuedAt !== undefined && (now() - command.issuedAt >= 90000 || command.issuedAt > now() + 30000)) {
        if (!pending) { publish('error', 'expired_command', command); }
        return false;
      }
      cancel('superseded');
      record = {id: command.requestId, fingerprint: fingerprint, result: null};
      history.push(record);
      if (history.length > 128) { history.shift(); }
      pending = {command: command, record: record,
        deadline: Math.min(now() + 90000, command.issuedAt === undefined ? Infinity : command.issuedAt + 90000),
        loading: false, started: false, foregroundSeen: false, expected: '', request: null};
      publish('waiting', '', command);
      tick(pending);
      return true;
    }
    function destroy() { cancel('app_closed'); destroyed = true; clearTimer(); if (events) { events.destroy(); } }
    var events = ports.Events.bind([
      {target: video, name: 'playing', handler: function () { playingEpoch += 1; }},
      {target: ports.document, name: 'visibilitychange', handler: function () { if (ports.hidden()) { cancel('app_hidden'); } }},
      {target: ports.document, name: 'keydown', handler: function () { cancel('manual_input'); }}
    ]);
    return {submit: submit, snapshot: snapshot, cancel: cancel, destroy: destroy};
  }
  return {parse: parse, create: create};
}));
