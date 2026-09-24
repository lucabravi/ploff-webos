(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffAssSubtitlePrefetchPolicy = factory(); }
}(this, function () {
  'use strict';

  function number(value) {
    var result = Number(value);
    return isFinite(result) ? result : 0;
  }

  function durationLead(durationSeconds) {
    var duration = number(durationSeconds);
    if (duration > 600) { return 240; }
    if (duration > 480) { return 180; }
    if (duration > 360) { return 120; }
    if (duration > 300) { return 60; }
    return null;
  }

  function creditsTrigger(markers) {
    var source = Object.prototype.toString.call(markers) === '[object Array]' ? markers : [];
    var trigger = null;
    var index;
    var marker;
    var start;
    for (index = 0; index < source.length; index += 1) {
      marker = source[index] || {};
      if (String(marker.type || '').toLowerCase() !== 'credits') { continue; }
      start = number(marker.startTimeOffset) / 1000;
      if (start < 0 || (trigger !== null && start >= trigger + 30)) { continue; }
      trigger = Math.max(0, start - 30);
    }
    return trigger;
  }

  function triggerSeconds(durationSeconds, markers) {
    var credits = creditsTrigger(markers);
    var lead = durationLead(durationSeconds);
    var durationTrigger;
    if (credits !== null) { return credits; }
    durationTrigger = lead === null ? null : Math.max(0, number(durationSeconds) - lead);
    return durationTrigger;
  }

  function due(currentSeconds, durationSeconds, markers) {
    var trigger = triggerSeconds(durationSeconds, markers);
    return trigger !== null && number(currentSeconds) >= trigger;
  }

  return {
    due: due,
    triggerSeconds: triggerSeconds
  };
}));
