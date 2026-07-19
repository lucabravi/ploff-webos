'use strict';

var assert = require('assert');
var SearchModel = require('../app/search-model');

assert.deepStrictEqual(SearchModel.letterRows[0], ['1','2','3','4','5','6','7','8','9','0'], 'the primary keyboard must expose numbers');
assert.ok(SearchModel.letterRows.some(function (row) { return row.indexOf('backspace') !== -1; }), 'Backspace must remain visible on the keyboard');
assert.ok(SearchModel.letterRows.some(function (row) { return row.indexOf('space') !== -1 && row.indexOf('clear') !== -1; }), 'Space and Clear must be visible actions');
assert.deepStrictEqual(
  SearchModel.symbolRows.reduce(function (all, row) { return all.concat(row); }, []).filter(function (key) {
    return ['shift', 'space', 'backspace', 'clear'].indexOf(key) === -1;
  }),
  ['-','_','.',':',"'",'&','!','?','+','/','(',')'],
  'Shift must expose the approved symbol set'
);

assert.deepStrictEqual(SearchModel.applyKey('re', 'n', false), { query: 'ren', symbolMode: false }, 'character keys must append synchronously');
assert.deepStrictEqual(SearchModel.applyKey('rent', 'backspace', false), { query: 'ren', symbolMode: false }, 'Backspace must remove one character');
assert.deepStrictEqual(SearchModel.applyKey('rent', 'clear', false), { query: '', symbolMode: false }, 'Clear must empty the query');
assert.deepStrictEqual(SearchModel.applyKey('rent', 'space', false), { query: 'rent ', symbolMode: false }, 'Space must append a space');
assert.deepStrictEqual(SearchModel.applyKey('rent', 'shift', false), { query: 'rent', symbolMode: true }, 'Shift must open symbols');
assert.deepStrictEqual(SearchModel.applyKey('rent', 'shift', true), { query: 'rent', symbolMode: false }, 'Shift must return to letters');

assert.deepStrictEqual(SearchModel.relevantCloudItems('attack', [
  { title: 'Attack on Titan', guid: 'plex://show/attack', score: 0.64 },
  { title: 'Blue Box', guid: 'plex://show/blue-box', score: 0.31 },
  { title: 'Attack on Titan', guid: 'plex://show/attack', score: 0.64 }
]), [
  { title: 'Attack on Titan', guid: 'plex://show/attack', score: 0.64 }
], 'cloud aliases must be relevant to the typed query and deduplicated before local resolution');
assert.deepStrictEqual(SearchModel.relevantCloudItems('yomi no tsugai', [
  { title: 'Daemons of the Shadow Realm', guid: 'plex://show/daemons', score: 0.93 },
  { title: 'No Goal', guid: 'plex://show/no-goal', score: 0.27 }
]), [
  { title: 'Daemons of the Shadow Realm', guid: 'plex://show/daemons', score: 0.93 }
], 'the top high-confidence Discover alias must survive even when its localized title does not contain the query');
assert.deepStrictEqual(SearchModel.relevantCloudItems('yomi', [
  { title: 'Daemons of the Shadow Realm', guid: 'plex://show/daemons', score: 0.54 },
  { title: 'Blue Box', guid: 'plex://show/blue-box', score: 0.31 }
]), [
  { title: 'Daemons of the Shadow Realm', guid: 'plex://show/daemons', score: 0.54 }
], 'a partial alternate title must retain the first provider-ranked alias without admitting unrelated lower-ranked items');
assert.deepStrictEqual(SearchModel.mergeLocalResults([
  { ratingKey: '1', title: 'L’attacco dei giganti' }
], [
  { ratingKey: '1', title: 'L’attacco dei giganti' },
  { ratingKey: '2', title: 'Attack the Block' }
]).map(function (item) { return item.ratingKey; }), ['2', '1'], 'online aliases must add only distinct locally resolved items and retain alphabetical ordering');

var layout = { keyboardRows: [10, 10, 9, 9, 2], resultColumns: 5, resultCount: 12 };
assert.deepStrictEqual(SearchModel.move({ zone: 'nav', row: 0, column: 3, index: 0 }, 'down', layout), { zone: 'keyboard', row: 0, column: 3, index: 0 }, 'Down from navbar must enter the keyboard');
assert.deepStrictEqual(SearchModel.move({ zone: 'keyboard', row: 4, column: 1, index: 0 }, 'down', layout), { zone: 'results', row: 0, column: 1, index: 1 }, 'Down from keyboard must enter results');
assert.deepStrictEqual(SearchModel.move({ zone: 'results', row: 0, column: 1, index: 1 }, 'up', layout), { zone: 'keyboard', row: 4, column: 1, index: 0 }, 'Up from the first result row must return to keyboard');
assert.deepStrictEqual(SearchModel.move({ zone: 'results', row: 0, column: 4, index: 4 }, 'right', layout), { zone: 'results', row: 0, column: 4, index: 4 }, 'Right must not wrap at a grid edge');
assert.deepStrictEqual(SearchModel.move({ zone: 'results', row: 1, column: 2, index: 7 }, 'down', layout), { zone: 'results', row: 1, column: 2, index: 7 }, 'Down must stay put when the next result row has no matching card');

assert.deepStrictEqual(
  SearchModel.measureLayout(1612, 629, 230, 410, 60),
  { columns: 7, visibleRows: 2, totalRows: 9 },
  'layout measurement must include a partially visible result row'
);
assert.deepStrictEqual(
  SearchModel.measureLayout(800, 400, 230, 410, 4),
  { columns: 3, visibleRows: 1, totalRows: 2 },
  'layout measurement must adapt to narrower result containers'
);
assert.deepStrictEqual(
  SearchModel.virtualWindow(0, 60, 7, 2, 1, 0),
  { start: 0, end: 21, visibleStartRow: 0, offsetRows: 0 },
  'the initial window must contain visible rows and lower overscan'
);
assert.deepStrictEqual(
  SearchModel.virtualWindow(15, 60, 7, 2, 1, 0),
  { start: 0, end: 28, visibleStartRow: 1, offsetRows: 1 },
  'crossing the lower edge must advance only enough to reveal focus'
);
assert.deepStrictEqual(
  SearchModel.virtualWindow(58, 60, 7, 2, 1, 1),
  { start: 42, end: 60, visibleStartRow: 7, offsetRows: 1 },
  'the final window must clamp to the last result row'
);
assert.deepStrictEqual(
  SearchModel.virtualWindow(0, 0, 7, 2, 1, 0),
  { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 },
  'empty results must produce an empty window'
);

console.log('Search model checks passed');
