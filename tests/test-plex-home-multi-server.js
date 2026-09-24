'use strict';
var assert = require('assert');
var HomeModel = require('../app/plex-home-model');
var defs = HomeModel.sectionDefinitions([{ key: '9', title: 'Anime', type: 'show' }]);
assert.strictEqual(defs[0].sectionKey, '9', 'Recently Added definitions must retain the owning library section key');
assert.strictEqual(defs[0].sectionTitle, 'Anime');
console.log('Plex Home multi-server metadata checks passed');
