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

  function formatTime(seconds) {
    var value = Math.round(safeSeconds(seconds));
    return Math.floor(value / 60) + ':' + (value % 60 < 10 ? '0' : '') + value % 60;
  }

  function formatLongTime(seconds) {
    var value = Math.floor(safeSeconds(seconds));
    var hours = Math.floor(value / 3600);
    var minutes = Math.floor((value % 3600) / 60);
    var remaining = value % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes + ':' + (remaining < 10 ? '0' : '') + remaining;
  }

  function shouldReport(options) {
    var values = options || {};
    var position = Number(values.position);
    return !!values.hasPlayback && !values.suppressed && isFinite(position) && position >= 20;
  }

  return { formatLongTime: formatLongTime, formatTime: formatTime, shouldReport: shouldReport };
}));
