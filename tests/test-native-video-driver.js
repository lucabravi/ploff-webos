'use strict';

var assert = require('assert');
var NativeVideoDriver = require('../app/native-video-driver');

function fakeVideo() {
  var listeners = {};
  var source = '';
  var currentTime = 0;
  var calls = [];
  return {
    autoplay: true,
    paused: true,
    readyState: 3,
    networkState: 2,
    duration: 123.5,
    videoWidth: 1920,
    videoHeight: 1080,
    offsetWidth: 1280,
    offsetHeight: 720,
    error: { code: 4 },
    buffered: { length: 1, start: function () { return 1; }, end: function () { return 2; } },
    seekable: { length: 1, start: function () { return 0; }, end: function () { return 120; } },
    calls: calls,
    addEventListener: function (name, handler) { listeners[name] = handler; calls.push(['on', name]); },
    removeEventListener: function (name, handler) { if (listeners[name] === handler) { delete listeners[name]; } calls.push(['off', name]); },
    dispatch: function (name) { if (name === 'playing') { this.paused = false; } if (name === 'pause') { this.paused = true; } if (listeners[name]) { listeners[name](); } if (this['on' + name]) { this['on' + name](); } },
    play: function () { calls.push(['play']); this.paused = false; return { catch: function () {} }; },
    pause: function () { calls.push(['pause']); this.paused = true; },
    load: function () { calls.push(['load']); },
    removeAttribute: function (name) { calls.push(['removeAttribute', name]); if (name === 'src') { source = ''; } },
    get src() { return source; },
    set src(value) { source = String(value || ''); calls.push(['src', source]); },
    get currentTime() { return currentTime; },
    set currentTime(value) { currentTime = Number(value); calls.push(['seek', currentTime]); }
  };
}

(function exposesNativeMechanicsWithoutPolicy() {
  var video = fakeVideo();
  var driver = NativeVideoDriver.create(video);
  var events = 0;
  function onPlaying() { events += 1; }

  driver.setAutoplay(false);
  driver.pause();
  driver.setSource('/stream.m3u8');
  driver.load();
  driver.seek(42.25);
  driver.on('playing', onPlaying);
  video.dispatch('playing');

  assert.strictEqual(events, 1);
  assert.strictEqual(driver.currentTime(), 42.25);
  assert.strictEqual(driver.duration(), 123.5);
  assert.strictEqual(driver.paused(), false);
  assert.strictEqual(driver.readyState(), 3);
  assert.strictEqual(driver.networkState(), 2);
  assert.deepStrictEqual(driver.error(), { code: 4 });
  assert.strictEqual(driver.buffered(), video.buffered);
  assert.strictEqual(driver.seekable(), video.seekable);
  assert.deepStrictEqual(driver.dimensions(), { width: 1920, height: 1080 }, 'native dimensions must stay behind the driver boundary');

  driver.off('playing', onPlaying);
  video.dispatch('playing');
  assert.strictEqual(events, 1, 'event unsubscription must use the same native target');

  var playResult = driver.play();
  assert.ok(playResult && typeof playResult.catch === 'function', 'native play result must be returned to Playback');
  driver.clearSource();
  assert.strictEqual(video.src, '');
  assert.strictEqual(driver.paused(), true);
  assert.deepStrictEqual(video.calls, [
    ['pause'], ['src', '/stream.m3u8'], ['load'], ['seek', 42.25], ['on', 'playing'], ['off', 'playing'],
    ['play'], ['pause'], ['removeAttribute', 'src'], ['load']
  ], 'the driver must preserve physical media-element effect order');
}());

(function rejectsMissingVideo() {
  assert.throws(function () { NativeVideoDriver.create(null); }, /native video/i);
}());

console.log('Native video driver checks passed');
