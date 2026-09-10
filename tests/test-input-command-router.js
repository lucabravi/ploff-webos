'use strict';

var assert = require('assert');
var Router = require('../app/coordinator/input-command-router');

function player(values) {
  return Router.playerQueue(values || {});
}

function settings(values) {
  return Router.settings(values || {});
}

assert.strictEqual(player({ view: 'library', keyCode: 461, directPlayPending: true }), 'pending-cancel', 'Back cancels a pending direct container start');
assert.strictEqual(player({ view: 'library', keyCode: 40, directPlayPending: true }), 'pending-consume', 'pending direct container start consumes non-Back input');
assert.strictEqual(player({ view: 'player', keyCode: 38, drawerOpen: true }), 'drawer-up', 'drawer Up moves to the previous occurrence');
assert.strictEqual(player({ view: 'player', keyCode: 40, drawerOpen: true }), 'drawer-down', 'drawer Down moves to the next occurrence');
assert.strictEqual(player({ view: 'player', keyCode: 13, drawerOpen: true }), 'drawer-activate', 'drawer OK activates the focused occurrence');
assert.strictEqual(player({ view: 'player', keyCode: 461, drawerOpen: true }), 'drawer-close', 'drawer Back closes the drawer');
assert.strictEqual(player({ view: 'player', keyCode: 37, drawerOpen: true }), 'drawer-close', 'drawer Left closes the drawer');
assert.strictEqual(player({ view: 'player', keyCode: 415, drawerOpen: true }), 'drawer-consume', 'drawer consumes other remote keys without leaking to player controls');
assert.strictEqual(player({ view: 'player', keyCode: 13, queueButtonFocused: true }), 'drawer-open', 'OK on the queue control opens the drawer');
assert.strictEqual(player({ view: 'library', keyCode: 415, libraryZone: 'grid', focusedContainerPlayable: true }), 'library-start-container', 'physical Play starts a focused playlist/collection container');
assert.strictEqual(player({ view: 'library', keyCode: 13, libraryZone: 'grid', playlistContainerActive: true, focusedPlaylistPlayable: true }), 'library-open-detail', 'OK opens a playable item from a playlist container');
assert.strictEqual(player({ view: 'library', keyCode: 415, libraryZone: 'grid', playlistContainerActive: true, focusedPlaylistPlayable: true }), 'library-open-play', 'physical Play opens and immediately plays a playlist item');
assert.strictEqual(player({ view: 'library', keyCode: 13, libraryZone: 'grid' }), 'clear-pass', 'external library selection clears playlist queue state then falls through');
assert.strictEqual(player({ view: 'detail', keyCode: 13, playlistQueue: true, detailPresent: true, detailZone: 'episodes' }), 'clear-pass', 'episode selection exits playlist context before normal detail handling');
assert.strictEqual(player({ view: 'detail', keyCode: 415, playlistQueue: true, detailPresent: true, detailZone: 'play' }), 'detail-activate', 'physical Play activates playlist playback from detail');
assert.strictEqual(player({ view: 'detail', keyCode: 13, playlistQueue: true, detailPresent: true, detailZone: 'play', detailActionIndex: 0 }), 'detail-activate', 'OK on the primary play action activates playlist playback');
assert.strictEqual(player({ view: 'home', keyCode: 13, navigationFocused: true }), 'clear-pass', 'navigation selection clears stale playlist context');
assert.strictEqual(player({ view: 'search', keyCode: 415 }), 'clear-pass', 'Play in browsing views clears stale playlist context');
assert.strictEqual(player({ view: 'player', keyCode: 40 }), 'pass', 'unowned player keys remain available to downstream controls');

assert.strictEqual(settings({ destroyed: true, keyCode: 13 }), 'ignore', 'destroyed settings reject input');
assert.strictEqual(settings({ safeAreaOpen: true, subtitleStyleOpen: true, playbackCompatibilityOpen: true, updateOpen: true }), 'safe-area', 'safe-area dialog has highest settings input priority');
assert.strictEqual(settings({ subtitleStyleOpen: true, playbackCompatibilityOpen: true, updateOpen: true }), 'subtitle-style', 'subtitle style dialog precedes compatibility and update dialogs');
assert.strictEqual(settings({ playbackCompatibilityOpen: true, updateOpen: true }), 'playback-compatibility', 'playback compatibility precedes update dialog');
assert.strictEqual(settings({ updateOpen: true }), 'update', 'update dialog captures settings input while open');
assert.strictEqual(settings({ keyCode: 461, editorOpen: true, state: { zone: 'list' } }), 'back-server-editor', 'Back closes the server editor first');
assert.strictEqual(settings({ keyCode: 461, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'back-language', 'Back closes the language editor before settings navigation');
assert.strictEqual(settings({ keyCode: 461, state: { zone: 'list', level: 'category' } }), 'back-category', 'Back leaves a settings category before navigation');
assert.strictEqual(settings({ keyCode: 461, state: { zone: 'list' } }), 'back-navigation', 'Back from the list returns focus to navigation');
assert.strictEqual(settings({ keyCode: 461, state: { zone: 'nav' } }), 'back-close', 'Back from navigation closes settings');
assert.strictEqual(settings({ direction: 'left', state: { zone: 'nav' } }), 'nav-left', 'navigation Left moves to the previous app destination');
assert.strictEqual(settings({ direction: 'right', state: { zone: 'nav' } }), 'nav-right', 'navigation Right moves to the next app destination');
assert.strictEqual(settings({ direction: 'down', state: { zone: 'nav' } }), 'nav-down', 'navigation Down enters the settings list');
assert.strictEqual(settings({ keyCode: 13, state: { zone: 'nav' } }), 'nav-activate', 'navigation OK activates the selected destination');
assert.strictEqual(settings({ keyCode: 38, editorOpen: true, editorIndex: 0, state: { zone: 'list' } }), 'editor-close', 'Up at the first server-editor row closes it');
assert.strictEqual(settings({ keyCode: 38, editorOpen: true, editorIndex: 2, state: { zone: 'list' } }), 'editor-up', 'server editor Up moves focus');
assert.strictEqual(settings({ keyCode: 40, editorOpen: true, editorIndex: 2, state: { zone: 'list' } }), 'editor-down', 'server editor Down moves focus');
assert.strictEqual(settings({ keyCode: 13, editorOpen: true, editorIndex: 2, state: { zone: 'list' } }), 'editor-activate', 'server editor OK activates the row');
assert.strictEqual(settings({ keyCode: 38, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'language-up', 'language editor Up moves focus');
assert.strictEqual(settings({ keyCode: 40, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'language-down', 'language editor Down moves focus');
assert.strictEqual(settings({ keyCode: 37, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'language-left', 'language editor Left reorders the preference');
assert.strictEqual(settings({ keyCode: 39, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'language-right', 'language editor Right reorders the preference');
assert.strictEqual(settings({ keyCode: 13, state: { zone: 'list', languageKind: 'audioLanguages' } }), 'language-activate', 'language editor OK toggles the focused value');
assert.strictEqual(settings({ keyCode: 38, state: { zone: 'list', index: 0 } }), 'list-navigation', 'Up from the first row returns focus to navigation');
assert.strictEqual(settings({ keyCode: 38, state: { zone: 'list', index: 2 } }), 'list-up', 'list Up moves to the previous setting');
assert.strictEqual(settings({ keyCode: 40, state: { zone: 'list', index: 2 } }), 'list-down', 'list Down moves to the next setting');
assert.strictEqual(settings({ keyCode: 37, state: { zone: 'list', index: 2 } }), 'list-left', 'list Left cycles a setting backward');
assert.strictEqual(settings({ keyCode: 39, state: { zone: 'list', index: 2 } }), 'list-right', 'list Right cycles a setting forward');
assert.strictEqual(settings({ keyCode: 13, state: { zone: 'list', index: 2 } }), 'list-activate', 'list OK invokes the focused setting');
assert.strictEqual(settings({ keyCode: 415, state: { zone: 'list', index: 2 } }), 'list-noop', 'unowned keys remain consumed by settings without side effects');

console.log('Input command router checks passed');
