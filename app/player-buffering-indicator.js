(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerBufferingIndicator = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var graceTimer = null;
    var watchdogTimer = null;
    var visible = false;
    var lastPosition = 0;
    var advancingSamples = 0;
    var graceDelay = Number(values.graceDelay || 500);
    var watchdogDelay = Number(values.watchdogDelay || 250);

    function clearTimers() {
      values.root.clearTimeout(graceTimer);
      values.root.clearTimeout(watchdogTimer);
      graceTimer = null;
      watchdogTimer = null;
    }

    function hide() {
      clearTimers();
      advancingSamples = 0;
      if (!visible) { return; }
      visible = false;
      values.onHide();
    }

    function watch() {
      watchdogTimer = values.root.setTimeout(function () {
        var current;
        watchdogTimer = null;
        if (!visible || !values.isEligible()) { hide(); return; }
        current = Number(values.position() || 0);
        if (current > lastPosition + 0.05) { advancingSamples += 1; }
        else { advancingSamples = 0; }
        lastPosition = current;
        if (advancingSamples >= 2) { hide(); return; }
        watch();
      }, watchdogDelay);
    }

    function signal() {
      var initialPosition;
      if (visible || graceTimer || !values.isEligible()) { return; }
      initialPosition = Number(values.position() || 0);
      graceTimer = values.root.setTimeout(function () {
        var current = Number(values.position() || 0);
        graceTimer = null;
        if (!values.isEligible() || current > initialPosition + 0.05) { return; }
        visible = true;
        lastPosition = current;
        advancingSamples = 0;
        values.onShow();
        watch();
      }, graceDelay);
    }

    return {
      isVisible: function () { return visible; },
      signal: signal,
      stop: hide
    };
  }

  return { create: create };
}));
