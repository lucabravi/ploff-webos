'use strict';
var assert = require('assert');
var Runtime = require('../app/subtitle-runtime');
var Sync = require('../app/subtitle-sync');
var renderer = {
  calls: [], epochs: [],
  load: function (content, callback) { callback(null); },
  setTime: function (time, paused) { this.calls.push({ time: time, paused: paused }); },
  discontinuity: function (time) { this.epochs.push(time); },
  hide: function () {}, show: function () {}, dispose: function () {}, setSize: function () {}
};
var runtime = Runtime.create({ PlaybackOperation: require('../app/playback-operation'), SubtitleSync: Sync, AssSubtitleRenderer: { create: function () { return renderer; } } });
runtime.loadAss({ id: 'a1' }, '[Script Info]', function (error) { assert.ifError(error); });
runtime.setLocal({ rendererType: 'ass', offsetMs: 250, streamId: 'a1' });
runtime.clearLocal();
var editor = { open: true, rendererType: 'ass', offsetMs: 750 };
runtime.syncAssClock(110, true, editor);
assert.deepStrictEqual(renderer.calls[0], { time: 109.25, paused: true }, 'preview ownership must receive pause and its own offset immediately');
runtime.render(editor, 110, true);
assert.deepStrictEqual(renderer.calls[1], renderer.calls[0], 'clock priming and rendering must choose the same active owner');
var epochs = renderer.epochs.length;
runtime.syncAssClock(110, false, editor);
assert.strictEqual(renderer.epochs.length, epochs, 'resume must not reset an unchanged preview offset');
assert.deepStrictEqual(renderer.calls[2], { time: 109.25, paused: false });
runtime.setLocal({ rendererType: 'ass', offsetMs: 250, streamId: 'a1' });
runtime.syncAssClock(110, true, { open: false, rendererType: 'ass', offsetMs: 750 });
assert.deepStrictEqual(renderer.calls[3], { time: 109.75, paused: true }, 'a closed preview must not replace the restored runtime owner');
runtime.syncAssClock(110, true, { open: true, rendererType: 'text', offsetMs: 750 });
assert.strictEqual(renderer.calls.length, 4, 'a text editor must not drive the preceding ASS owner');
runtime.reset();
console.log('Subtitle runtime preview clock ownership passed');
