'use strict';

var assert = require('assert');
var SearchText = require('../app/search-text');

assert.strictEqual(SearchText.normalize('  L’attacco dei Giganti: Élite!  '), 'l attacco dei giganti elite', 'search normalization must remain accent and punctuation insensitive');
assert.deepStrictEqual(SearchText.terms('  Café   noir '), ['cafe', 'noir'], 'search terms must share the same normalization and remove empty tokens');
assert.deepStrictEqual(SearchText.terms('---'), [], 'punctuation-only searches must not create empty terms');

console.log('Search text checks passed');
