'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'shell', 'chapter-state.js');

assert.ok(fs.existsSync(modulePath), 'the player chapter state module must exist');

var ChapterState = require(modulePath);
var chapters = [
  { key: 'prologue', startTimeOffset: 0, endTimeOffset: 10000 },
  { key: 'opening', startTimeOffset: 10000, endTimeOffset: 20000 },
  { key: 'episode', startTimeOffset: 20000, endTimeOffset: 80000 }
];

assert.strictEqual(ChapterState.indexAt(chapters, 15000), 1, 'the active chapter must follow the absolute Plex playback clock');
assert.strictEqual(ChapterState.indexAt(chapters, 90000), 2, 'times after the final chapter must retain the final chapter');
assert.strictEqual(ChapterState.indexAt([], 15000), -1, 'media without chapters must not expose a chapter focus');

var state = ChapterState.create();
state = ChapterState.open(state, chapters, 15000);
assert.deepStrictEqual(state, { open: true, index: 1 }, 'opening the drawer must focus the current chapter');
state = ChapterState.move(state, chapters.length, 1);
assert.strictEqual(state.index, 2, 'Right must move to the next chapter');
state = ChapterState.move(state, chapters.length, 1);
assert.strictEqual(state.index, 2, 'chapter focus must stop at the final card');
state = ChapterState.move(state, chapters.length, -1);
assert.strictEqual(state.index, 1, 'Left must move to the previous chapter');

var selection = ChapterState.select(state, chapters);
assert.strictEqual(selection.seekSeconds, 10, 'selecting a chapter must return its absolute start in seconds');
assert.strictEqual(selection.chapter.key, 'opening', 'selection must return the focused chapter');
assert.deepStrictEqual(selection.state, { open: false, index: 1 }, 'selecting a chapter must close the drawer');
assert.deepStrictEqual(ChapterState.close(state), { open: false, index: 1 }, 'Back or Up must close the chapter drawer without changing selection');
assert.deepStrictEqual(ChapterState.open(ChapterState.create(), [], 0), { open: false, index: -1 }, 'media without chapters must keep the drawer closed');

console.log('Chapter state checks passed');
