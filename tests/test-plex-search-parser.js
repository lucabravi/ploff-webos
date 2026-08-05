'use strict';

var assert = require('assert');
var Parser = require('../app/plex-search-parser');
var parser = Parser.create({
  mediaFromAttributes: function (attributes) {
    return { ratingKey: attributes.ratingKey, title: attributes.title, type: attributes.type };
  }
});

assert.strictEqual(parser.normalizedSearchText('Yomi no Tsugai: Vol. 1'), 'yomi no tsugai vol 1', 'normalizes punctuation and case');
assert.strictEqual(parser.searchAttributesMatch({ title: 'Yomi no Tsugai', originalTitle: '', titleSort: '' }, 'yomi tsu'), true, 'matches separate normalized terms');
assert.strictEqual(parser.searchAttributesMatch({ title: 'Yomi no Tsugai', originalTitle: '', titleSort: '' }, 'attack'), false, 'does not return unrelated local results');

var results = parser.searchItemsFromAttributes([
  { type: 'show', ratingKey: '1', title: 'Yomi no Tsugai', librarySectionTitle: 'Anime' },
  { type: 'show', ratingKey: '1', title: 'Yomi no Tsugai duplicate', librarySectionTitle: 'Anime' },
  { type: 'episode', ratingKey: '2', title: 'Yomi no Tsugai Episode' }
], 'https://plex.example', 'token', 'yomi');

assert.deepStrictEqual(results, [{ ratingKey: '1', title: 'Yomi no Tsugai', type: 'show', libraryTitle: 'Anime' }], 'keeps only unique local movie and show results');

console.log('Plex search parser checks passed');
