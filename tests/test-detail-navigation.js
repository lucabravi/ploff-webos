'use strict';

var assert = require('assert');
var DetailNavigation = require('../app/detail-navigation');
var navigation = DetailNavigation.create();
var context = { hasSeries: true, seasonCount: 5, episodeCount: 12, choiceZones: ['version', 'audio', 'subtitles'], summaryOverflowing: true, actionCount: 4 };

navigation.set({ zone: 'seasons', seasonIndex: 4 });
assert.strictEqual(navigation.navigate('right', context).state.seasonIndex, 4, 'season focus must clamp at the final tab');
assert.strictEqual(navigation.navigate('left', context).effect, 'season-preview', 'season movement must request a deferred preview');
assert.strictEqual(navigation.snapshot().seasonIndex, 3, 'season movement must update the selected index');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'play', 'Down from a season must reach Play');

assert.strictEqual(navigation.navigate('down', context).state.zone, 'version', 'Down from actions must enter Version first');
assert.strictEqual(navigation.navigate('right', context).effect, 'cycle-version-right', 'Left and Right must preserve quick version cycling');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'audio', 'Audio must follow Version in playback preferences');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'subtitles', 'Subtitles must remain the final playback preference');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'episodes', 'episodes must follow the final preference');

navigation.set({ zone: 'episodes', episodeIndex: 11 });
assert.strictEqual(navigation.navigate('right', context).state.episodeIndex, 11, 'episode focus must clamp at the final episode');
assert.strictEqual(navigation.navigate('left', context).effect, 'episode-preview', 'episode movement must request its deferred metadata preview');
assert.strictEqual(navigation.navigate('up', context).state.zone, 'subtitles', 'Up from episodes must return to the final preference');

navigation.set({ zone: 'play', actionIndex: 3 });
assert.strictEqual(navigation.navigate('right', context).state.actionIndex, 3, 'the media options action must clamp at the final action');
navigation.set({ zone: 'play', actionIndex: 0 });
assert.strictEqual(navigation.navigate('up', context).state.zone, 'summary', 'an expandable summary must be reachable above actions');
assert.strictEqual(navigation.navigate('down', context).state.zone, 'play', 'Down must close the summary focus path back to Play');
assert.strictEqual(navigation.snapshot().actionIndex, 0, 'returning from summary must select Play');

navigation.set({ zone: 'play' });
assert.strictEqual(navigation.navigate('up', { hasSeries: false, choiceZones: [], summaryOverflowing: false }).state.zone, 'play', 'movie actions must not move focus into the hidden detail navbar');

console.log('Detail navigation checks passed');
