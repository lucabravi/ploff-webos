'use strict';

var assert = require('assert');
var LibraryContainers = require('../app/library-containers');

assert.deepStrictEqual(LibraryContainers.views(), ['continue', 'recent', 'catalog', 'collections', 'playlists'], 'container tabs must follow Full Catalog');
assert.deepStrictEqual(LibraryContainers.moveControl('sort', 1, 'right'), { zone: 'filter', index: 0 }, 'Right from Rating must move visually to All');
assert.deepStrictEqual(LibraryContainers.moveControl('filter', 0, 'left'), { zone: 'sort', index: 1 }, 'Left from All must return visually to Rating');
assert.deepStrictEqual(LibraryContainers.moveControl('sort', 0, 'left'), { zone: 'sort', index: 0 }, 'the first visual control must remain bounded');
assert.strictEqual(typeof LibraryContainers.moveControlVertical, 'function', 'library controls must expose vertical movement for their shared visual row');
assert.deepStrictEqual(LibraryContainers.moveControlVertical('sort', 'down'), { zone: 'grid', index: 0 }, 'Down from sorting must enter the media grid instead of filters on the same row');
assert.deepStrictEqual(LibraryContainers.moveControlVertical('filter', 'down'), { zone: 'grid', index: 0 }, 'Down from watched filters must enter the media grid');
assert.deepStrictEqual(LibraryContainers.moveControlVertical('filter', 'up'), { zone: 'tabs', index: 0 }, 'Up from the shared control row must return to library tabs');
assert.strictEqual(LibraryContainers.moveGridDown(8, 15, 7), 14, 'Down into a short final row must select its last available card');
assert.strictEqual(LibraryContainers.moveGridDown(9, 15, 7), 14, 'every missing destination column must fall back to the final card');
assert.strictEqual(LibraryContainers.moveGridDown(14, 15, 7), 14, 'Down from the final row must remain bounded');
assert.strictEqual(LibraryContainers.belongsToLibrary([{ librarySectionID: '4' }], '4'), true, 'a playlist containing library media must belong to that library');
assert.strictEqual(LibraryContainers.belongsToLibrary([{ librarySectionID: '2' }], '4'), false, 'playlist filtering must not leak another library');
assert.strictEqual(LibraryContainers.statusKey('playlists', false, null, 0, false), 'state.playlistsEmpty', 'empty playlists must use a passive inline status');
assert.strictEqual(LibraryContainers.statusKey('collections', false, null, 0, false), 'state.collectionsEmpty', 'empty collections must use a passive inline status');
assert.strictEqual(LibraryContainers.statusKey('catalog', false, new Error('failed'), 0, false), 'status.libraryUnavailable', 'library failures must remain inline');
assert.strictEqual(LibraryContainers.statusKey('catalog', true, null, 0, false), 'library.loading', 'library loading must remain inline');
assert.strictEqual(LibraryContainers.statusKey('catalog', false, null, 2, false), '', 'loaded libraries must clear their inline status');

console.log('Library container checks passed');
