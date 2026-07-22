'use strict';

var assert = require('assert');
var DetailNavigation = require('../app/detail-navigation');
var navigation = DetailNavigation.create();
var context = { hasSeries: true, seasonCount: 5, episodeCount: 12, choiceZones: ['audio', 'subtitles', 'version'], summaryOverflowing: true, mediaInfoOverflowing: true };

navigation.set({ zone: 'seasons', seasonIndex: 4 });
assert.strictEqual(navigation.navigate('right', context).state.seasonIndex, 4, 'season focus must clamp at the final tab');
assert.strictEqual(navigation.navigate('left', context).effect, 'season-preview', 'season movement must request a deferred preview');
assert.strictEqual(navigation.snapshot().seasonIndex, 3, 'season movement must update the selected index');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'play', 'Down from a season must reach Play');

assert.strictEqual(navigation.navigate('down', context).state.zone, 'audio', 'Down from actions must enter the first available preference');
assert.strictEqual(navigation.navigate('right', context).effect, 'cycle-audio-right', 'Left and Right must cycle the active preference');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'subtitles', 'preference controls must be navigated vertically');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'version', 'the last enabled preference must remain in order');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'media-info', 'media info must follow preferences when it overflows');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'episodes', 'episodes must follow expanded media info');

navigation.set({ zone: 'episodes', episodeIndex: 11 });
assert.strictEqual(navigation.navigate('right', context).state.episodeIndex, 11, 'episode focus must clamp at the final episode');
assert.strictEqual(navigation.navigate('left', context).effect, 'episode-preview', 'episode movement must request its deferred metadata preview');
assert.strictEqual(navigation.navigate('up', context).state.zone, 'media-info', 'Up from episodes must return through media info');

navigation.set({ zone: 'play', actionIndex: 0 });
assert.strictEqual(navigation.navigate('up', context).state.zone, 'summary', 'an expandable summary must be reachable above actions');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'play', 'Down must close the summary focus path back to Play');
assert.strictEqual(navigation.snapshot().actionIndex, 0, 'returning from summary must select Play');

navigation.set({ zone: 'play' });
assert.strictEqual(navigation.navigate('up', { hasSeries: false, choiceZones: [], summaryOverflowing: false }).state.zone, 'nav', 'movie actions must return to navigation when no summary expansion exists');

console.log('Detail navigation checks passed');
