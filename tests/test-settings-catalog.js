'use strict';

var assert = require('assert');
var SettingsCatalog = require('../app/settings-catalog');
var settings = {
  uiLanguage: 'en', wheelBehavior: 'items', cardScale: 100, accentColor: 'cyan', searchT9Input: false, showMediaInfo: false,
  showWatchlist: true, showPlaylists: false, backgroundMusic: false, backgroundVolume: 20, backgroundDelay: 500,
  lanVideoQuality: 'original', remoteVideoQuality: '8000', playbackMode: 'auto',
  videoVersionPriorities: ['resolution', 'hdr', 'quality', 'directPlay'], autoplayDelay: 5,
  skipPromptDuration: 5, audioLanguages: ['eng'], subtitleLanguages: ['ita'], subtitleSuppressedForAudio: [], subtitleMode: 'always', subtitleSourcePreference: 'external'
};
var catalog = SettingsCatalog.create({
  t: function (key) { return key; },
  languageName: function (language, code) { return language + ':' + code; },
  nativeLanguageName: function (code) { return 'native:' + code; },
  activeServerLabel: function () { return 'Plex'; },
  activeProfileTitle: function () { return 'Offline profile'; },
  networkStatusLabel: function () { return 'Local network only'; },
  plexConnected: function () { return true; },
  videoQualityLabel: function (value) { return 'Q:' + value; },
  playbackPreferenceLabel: function (value) { return 'P:' + value; },
  accentColorLabel: function (value) { return 'C:' + value; },
  supportedUiLanguages: function () { return ['en', 'it']; },
  cardScales: [70, 100, 130],
  accentColors: ['cyan', 'purple', 'white'],
  accentValues: { cyan: '#13b8ad', purple: '#a66cff', white: '#ffffff' }
});
var rows = catalog.rows(settings);

assert.strictEqual(rows[0].key, 'plexServer', 'Plex server must remain the first setting');
assert.strictEqual(rows[1].key, 'plexProfile', 'Plex profile must remain next to the server picker');
assert.deepStrictEqual(
  { key: rows[2].key, value: rows[2].value, readOnly: rows[2].readOnly },
  { key: 'networkStatus', value: 'Local network only', readOnly: true },
  'Plex settings must expose the live network state as a read-only row'
);
assert.deepStrictEqual(rows.slice(-4).map(function (row) { return row.key; }), ['diagnostics', 'privacy', 'disconnectPlex', 'deleteLocalData'], 'support actions must expose diagnostics, privacy, account disconnect, and local-data deletion');
assert.ok(rows.slice(-4).every(function (row) { return row.action; }), 'support controls must remain actions instead of mutable settings');
assert.strictEqual(rows.filter(function (row) { return row.key === 'disconnectPlex'; })[0].value, 'settings.connected', 'the account action must expose its current connection state');
assert.strictEqual(rows.filter(function (row) { return row.section === 'plex'; }).length, 3, 'Plex settings must keep server, profile and network state grouped together');
assert.strictEqual(rows.filter(function (row) { return row.palette; })[0].key, 'accentColor', 'Accent color must retain its palette treatment');
assert.strictEqual(rows.filter(function (row) { return row.key === 'searchT9Input'; })[0].value, 'settings.disabled', 'T9 input must be exposed as an opt-in interface setting');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleSourcePreference'; })[0].value, 'settings.preferExternalSubtitles', 'subtitle source preference must be visible in the language settings');
assert.strictEqual(rows.filter(function (row) { return row.key === 'videoVersionPriorities'; })[0].priorityEditor, true, 'automatic video version criteria must use an orderable priority editor');
assert.strictEqual(catalog.sectionLabel('playback'), 'settings.sectionPlayback', 'section labels must remain localized through the catalog');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].choices, [{ value: 'en', label: 'native:en' }, { value: 'it', label: 'native:it' }], 'interface language choices must identify every language using its native name');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].value, 'native:en', 'the active interface language must also use its native name');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'showMediaInfo'; })[0].choices.map(function (choice) { return choice.value; }), [true, false], 'boolean settings must expose explicit enabled and disabled choices');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'cardScale'; })[0].choices.map(function (choice) { return choice.value; }), [70, 100, 130], 'card scale must use the same values for cycling and modal selection');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'accentColor'; })[0].choices[1], { value: 'purple', label: 'C:purple', color: '#a66cff' }, 'accent choices must include their localized label and color swatch');
assert.ok(rows.filter(function (row) { return !row.readOnly && !row.action && !row.editor && !row.priorityEditor && !row.serverEditor && !row.profileEditor; }).every(function (row) { return row.choices && row.choices.length; }), 'every directly mutable setting must expose reusable modal choices');

console.log('Settings catalog checks passed');
