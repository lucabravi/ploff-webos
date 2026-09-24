'use strict';

var assert = require('assert');
var Parser = require('../app/plex-search-parser');
var parser = Parser.create({
  mediaFromAttributes: function (attributes) {
    return { ratingKey: attributes.ratingKey, title: attributes.title, type: attributes.type };
  }
});

assert.strictEqual(parser.normalizedSearchText('Sample Saga: Vol. 1'), 'sample saga vol 1', 'normalizes punctuation and case');
assert.strictEqual(parser.searchAttributesMatch({ title: 'Sample Saga', originalTitle: '', titleSort: '' }, 'sample sa'), true, 'matches separate normalized terms');
assert.strictEqual(parser.searchAttributesMatch({ title: 'Sample Saga', originalTitle: '', titleSort: '' }, 'unrelated'), false, 'does not return unrelated local results');

var results = parser.searchItemsFromAttributes([
  { type: 'show', ratingKey: '1', title: 'Sample Saga', librarySectionTitle: 'Anime' },
  { type: 'show', ratingKey: '1', title: 'Sample Saga duplicate', librarySectionTitle: 'Anime' },
  { type: 'episode', ratingKey: '2', title: 'Sample Saga Episode' }
], 'https://plex.example', 'token', 'sample');

assert.deepStrictEqual(results, [{ ratingKey: '1', title: 'Sample Saga', type: 'show', libraryTitle: 'Anime' }], 'keeps only unique local movie and show results');

console.log('Plex search parser checks passed');
