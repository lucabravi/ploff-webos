'use strict';

var assert = require('assert');
var BackgroundAudio = require('../shell/background-audio');
var pending = [];
var audio = {
  src: '', volume: 0, currentTime: 99, paused: true, plays: 0,
  play: function () { this.paused = false; this.plays += 1; },
  pause: function () { this.paused = true; }
};
var clock = {
  setTimeout: function (callback, delay) { pending.push({ callback: callback, delay: delay, active: true }); return pending.length - 1; },
  clearTimeout: function (id) { if (pending[id]) { pending[id].active = false; } }
};
var controller = BackgroundAudio.create(audio, clock, 2);

controller.schedule({ themeKey: 'show:1', themeUrl: '/theme-1.mp3' }, { delay: 1000, volume: 20 });
assert.strictEqual(audio.plays, 0, 'theme audio must never start inside the focus event');
assert.strictEqual(pending[0].delay, 1000, 'the configured delay must be honored');
pending[0].callback();
assert.strictEqual(audio.src, '/theme-1.mp3', 'the selected Plex theme must be loaded after the delay');
assert.strictEqual(audio.volume, 0.2, 'volume percentage must map to the audio element');
assert.strictEqual(audio.currentTime, 0, 'a newly selected theme must start from the beginning');

controller.schedule({ themeKey: 'show:2', themeUrl: '/theme-2.mp3' }, { delay: 500, volume: 10 });
controller.schedule({ themeKey: 'show:3', themeUrl: '/theme-3.mp3' }, { delay: 500, volume: 10 });
pending[1].callback();
assert.strictEqual(audio.src, '/theme-1.mp3', 'a stale delayed focus request must be ignored');
pending[2].callback();
assert.strictEqual(audio.src, '/theme-3.mp3', 'only the newest focus request may play');

controller.stop();
assert.strictEqual(audio.paused, true, 'stop must pause the single audio element');
assert.strictEqual(audio.currentTime, 0, 'stop must reset themes so player return restarts them');
assert.deepStrictEqual(controller.cacheKeys(), ['show:1', 'show:3'], 'the cache must retain only recently used logical themes');

console.log('Background audio checks passed');
