(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffBackgroundAudio = factory();
  }
}(this, function () {
  'use strict';

  function create(audio, clock) {
    var timer = null;
    var requestToken = 0;
    var currentKey = '';
    var scheduler = clock || { setTimeout: setTimeout, clearTimeout: clearTimeout };

    function cancelTimer() {
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
    }

    function stop() {
      requestToken += 1;
      cancelTimer();
      audio.pause();
      try { audio.currentTime = 0; } catch (error) { /* Old webOS can reject seeks before metadata. */ }
      currentKey = '';
    }

    function schedule(item, options) {
      var token;
      var key;
      var url;
      var settings = options || {};
      requestToken += 1;
      token = requestToken;
      cancelTimer();
      if (!item || !item.themeKey || !item.themeUrl) {
        stop();
        return;
      }
      key = item.themeKey;
      url = item.themeUrl;
      audio.volume = Math.max(0, Math.min(1, Number(settings.volume || 20) / 100));
      if (currentKey === key && audio.src === url && !audio.paused) { return; }
      timer = scheduler.setTimeout(function () {
        var result;
        if (token !== requestToken) { return; }
        timer = null;
        currentKey = key;
        if (audio.src !== url) { audio.src = url; }
        try { audio.currentTime = 0; } catch (error) { /* Metadata may not be loaded yet. */ }
        try {
          result = audio.play();
          if (result && result.catch) { result.catch(function () {}); }
        } catch (_error) {}
      }, Number(settings.delay || 1000));
    }

    return { schedule: schedule, stop: stop };
  }

  return { create: create };
}));
