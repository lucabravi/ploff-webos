'use strict';

var assert = require('assert');
var BackgroundAudio = require('../app/background-audio');
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
var controller = BackgroundAudio.create(audio, clock);

controller.schedule({ themeKey: 'show:1', themeUrl: '/theme-1.mp3' }, { delay: 1000, volume: 20 });
assert.strictEqual(audio.plays, 0, 'theme audio must never start inside the focus event');
assert.strictEqual(pending[0].delay, 1000, 'the configured delay must be honored');
pending[0].callback();
assert.strictEqual(audio.src, '/theme-1.mp3', 'the selected Plex theme must be loaded after the delay');
assert.strictEqual(audio.volume, 0.2, 'volume percentage must map to the audio element');
assert.strictEqual(audio.currentTime, 0, 'a newly selected theme must start from the beginning');

audio.currentTime = 37;
controller.schedule({ themeKey: 'show:1', themeUrl: '/theme-1.mp3' }, { delay: 500, volume: 15 });
assert.strictEqual(audio.plays, 1, 'rescheduling the active logical theme must not call play again');
assert.strictEqual(audio.currentTime, 37, 'opening Detail for the same logical theme must preserve playback position');
assert.strictEqual(audio.volume, 0.15, 'rescheduling the same theme may still apply the latest volume');

controller.schedule({ themeKey: 'show:1', themeUrl: '/theme-1-new-server.mp3' }, { delay: 0, volume: 15 });
pending[1].callback();
assert.strictEqual(audio.src, '/theme-1-new-server.mp3', 'the current media URL must replace a cached URL when the same logical theme exists on another server or profile');
assert.strictEqual(audio.plays, 2, 'a changed URL for the same logical theme must restart playback instead of preserving the old server stream');

controller.schedule({ themeKey: 'show:2', themeUrl: '/theme-2.mp3' }, { delay: 500, volume: 10 });
controller.schedule({ themeKey: 'show:3', themeUrl: '/theme-3.mp3' }, { delay: 500, volume: 10 });
pending[2].callback();
assert.strictEqual(audio.src, '/theme-1-new-server.mp3', 'a stale delayed focus request must be ignored');
pending[3].callback();
assert.strictEqual(audio.src, '/theme-3.mp3', 'only the newest focus request may play');

var throwingAudio = {
  src: '', volume: 0, currentTime: 0, paused: true,
  play: function () { throw new Error('playback unavailable'); },
  pause: function () {}
};
var throwingPending = [];
var throwingController = BackgroundAudio.create(throwingAudio, {
  setTimeout: function (callback) { throwingPending.push(callback); return throwingPending.length - 1; },
  clearTimeout: function () {}
});
throwingController.schedule({ themeKey: 'show:throw', themeUrl: '/throw.mp3' }, { delay: 0, volume: 10 });
assert.doesNotThrow(function () { throwingPending[0](); }, 'optional theme audio must not crash the application when an old WebView rejects play synchronously');

controller.stop();
assert.strictEqual(audio.paused, true, 'stop must pause the single audio element');
assert.strictEqual(audio.currentTime, 0, 'stop must reset themes so player return restarts them');

console.log('Background audio checks passed');
