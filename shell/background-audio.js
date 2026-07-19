(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffBackgroundAudio = factory();
  }
}(this, function () {
  'use strict';

  function create(audio, clock, maximumEntries) {
    var timer = null;
    var requestToken = 0;
    var currentKey = '';
    var keys = [];
    var urls = {};
    var scheduler = clock || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    var limit = maximumEntries || 20;

    function remember(key, url) {
      var position = keys.indexOf(key);
      if (position !== -1) { keys.splice(position, 1); }
      keys.push(key);
      urls[key] = url;
      while (keys.length > limit) {
        delete urls[keys.shift()];
      }
    }

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
      url = urls[key] || item.themeUrl;
      audio.volume = Math.max(0, Math.min(1, Number(settings.volume || 20) / 100));
      if (currentKey === key && !audio.paused) { return; }
      timer = scheduler.setTimeout(function () {
        var result;
        if (token !== requestToken) { return; }
        timer = null;
        remember(key, url);
        currentKey = key;
        if (audio.src !== url) { audio.src = url; }
        try { audio.currentTime = 0; } catch (error) { /* Metadata may not be loaded yet. */ }
        result = audio.play();
        if (result && result.catch) { result.catch(function () {}); }
      }, Number(settings.delay || 1000));
    }

    return {
      cacheKeys: function () { return keys.slice(0); },
      schedule: schedule,
      stop: stop
    };
  }

  return { create: create };
}));
