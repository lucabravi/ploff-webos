'use strict';

var assert = require('assert');
var LibrarySource = require('../app/library-source');

var primary = LibrarySource.fromSection(
  { machineIdentifier: 'server-a', name: 'PloffNAS', owned: true },
  { key: '4', title: 'Film', type: 'movie' },
  'server-a'
);
var secondaryOwned = LibrarySource.fromSection(
  { machineIdentifier: 'server-c', name: 'Studio', owned: true },
  { key: '4', title: 'Film', type: 'movie' },
  'server-a'
);
var shared = LibrarySource.fromSection(
  { machineIdentifier: 'server-b', name: 'Marco', owned: false },
  { key: '4', title: 'Film', type: 'movie' },
  'server-a'
);

assert.strictEqual(primary.id, 'server-a|4', 'source identity must combine server and section identities');
assert.strictEqual(shared.id, 'server-b|4', 'equal section keys on two PMS instances must remain distinct');
assert.strictEqual(primary.defaultTitle, 'Film', 'primary libraries keep their Plex title');
assert.strictEqual(primary.primary, true, 'primary source identity must remain explicit');
assert.strictEqual(secondaryOwned.primary, false, 'owned secondary PMS sources must remain distinguishable from the primary server');
assert.strictEqual(secondaryOwned.defaultTitle, 'Film \u00b7 Studio', 'owned secondary libraries must include their server name by default');
assert.strictEqual(shared.defaultTitle, 'Film \u00b7 Marco', 'secondary libraries include the server name by default');
assert.strictEqual(shared.owned, false, 'shared ownership must survive source normalization');
assert.strictEqual(shared.primary, false, 'shared sources are secondary to the active primary server');
assert.strictEqual(LibrarySource.defaultIcon({ sectionType: 'movie', sectionTitle: 'Anime' }), 'anime', 'anime-like libraries receive the anime icon by default');
assert.strictEqual(LibrarySource.defaultIcon({ sectionType: 'movie', sectionTitle: 'Documentari' }), 'documentary', 'documentary-like libraries receive a documentary icon');
assert.strictEqual(LibrarySource.defaultIcon({ sectionType: 'show', sectionTitle: 'Serie TV' }), 'tv', 'show libraries receive the TV icon by default');
assert.strictEqual(LibrarySource.defaultIcon({ sectionType: 'movie', sectionTitle: 'Film' }), 'movie', 'movie libraries receive the movie icon by default');
assert.strictEqual(LibrarySource.mediaIdentity('server-b', '123'), 'server-b|rating:123', 'media identity must include the server identity');

console.log('Library source checks passed');
