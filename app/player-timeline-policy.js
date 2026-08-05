(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlayerTimelinePolicy = factory();
  }
}(this, function () {
  'use strict';

  function safeSeconds(seconds) {
    var value = Number(seconds);
    return isFinite(value) ? Math.max(0, value) : 0;
  }

  function formatClock(value) {
    var hours = Math.floor(value / 3600);
    var minutes = Math.floor((value % 3600) / 60);
    var seconds = value % 60;
    var hourText = hours < 10 ? '0' + hours : '' + hours;
    var minuteText = minutes < 10 ? '0' + minutes : '' + minutes;
    var secondText = seconds < 10 ? '0' + seconds : '' + seconds;
    return hourText + ':' + minuteText + ':' + secondText;
  }

  function formatTime(seconds) {
    var value = Math.round(safeSeconds(seconds));
    if (value >= 3600) { return formatClock(value); }
    return Math.floor(value / 60) + ':' + (value % 60 < 10 ? '0' : '') + value % 60;
  }

  function formatLongTime(seconds) {
    var value = Math.floor(safeSeconds(seconds));
    return formatClock(value);
  }

  function shouldReport(options) {
    var values = options || {};
    var position = Number(values.position);
    return !!values.hasPlayback && !values.suppressed && isFinite(position) && position >= 20;
  }

  return { formatLongTime: formatLongTime, formatTime: formatTime, shouldReport: shouldReport };
}));
