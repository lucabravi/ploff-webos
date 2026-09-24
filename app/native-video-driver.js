(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffNativeVideoDriver = factory(); }
}(this, function () {
  'use strict';

  function create(video) {
    if (!video) { throw new Error('NativeVideoDriver requires a native video element'); }

    return {
      setAutoplay: function (value) { video.autoplay = value === true; },
      setSource: function (value) { video.src = String(value || ''); },
      clearSource: function () {
        var cleanupError = null;
        try { video.pause(); } catch (error) { cleanupError = error; }
        try { video.removeAttribute('src'); } catch (error) { if (!cleanupError) { cleanupError = error; } }
        try { video.load(); } catch (error) { if (!cleanupError) { cleanupError = error; } }
        if (cleanupError) { throw cleanupError; }
      },
      seek: function (seconds) { video.currentTime = Number(seconds); },
      play: function () { return video.play(); },
      pause: function () { return video.pause(); },
      load: function () { return video.load(); },
      on: function (name, handler) { video.addEventListener(name, handler, false); },
      off: function (name, handler) { video.removeEventListener(name, handler, false); },
      currentTime: function () { return Number(video.currentTime || 0); },
      duration: function () { return Number(video.duration); },
      paused: function () { return !!video.paused; },
      readyState: function () { return Number(video.readyState || 0); },
      networkState: function () { return Number(video.networkState || 0); },
      error: function () { return video.error || null; },
      buffered: function () { return video.buffered; },
      seekable: function () { return video.seekable; },
      dimensions: function () {
        var width = Number(video.videoWidth || video.offsetWidth || 0);
        var height = Number(video.videoHeight || video.offsetHeight || 0);
        return { width: width, height: height };
      }
    };
  }

  return { create: create };
}));
