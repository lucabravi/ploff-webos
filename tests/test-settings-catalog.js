'use strict';

var assert = require('assert');
var SettingsCatalog = require('../app/settings-catalog');
var settings = {
  uiLanguage: 'en', wheelBehavior: 'items', cardScale: 100, accentColor: 'cyan', searchT9Input: false, showMediaInfo: false,
  showWatchlist: true, showPlaylists: false, backgroundMusic: false, backgroundVolume: 20, backgroundDelay: 500,
  lanVideoQuality: 'original', remoteVideoQuality: '8000', playbackMode: 'auto', autoplayDelay: 5,
  skipPromptDuration: 5, audioLanguages: ['eng'], subtitleLanguages: ['ita'], subtitleSuppressedForAudio: [], subtitleMode: 'always', subtitleSourcePreference: 'external'
};
var catalog = SettingsCatalog.create({
  t: function (key) { return key; },
  languageName: function (language, code) { return language + ':' + code; },
  nativeLanguageName: function (code) { return 'native:' + code; },
  activeServerLabel: function () { return 'Plex'; },
  activeProfileTitle: function () { return 'Offline profile'; },
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
assert.strictEqual(rows[rows.length - 1].key, 'diagnostics', 'Diagnostics must remain the last support setting');
assert.strictEqual(rows[rows.length - 1].action, true, 'Diagnostics must remain an action instead of a mutable setting');
assert.strictEqual(rows.filter(function (row) { return row.section === 'plex'; }).length, 2, 'Plex settings must stay grouped together');
assert.strictEqual(rows.filter(function (row) { return row.palette; })[0].key, 'accentColor', 'Accent color must retain its palette treatment');
assert.strictEqual(rows.filter(function (row) { return row.key === 'searchT9Input'; })[0].value, 'settings.disabled', 'T9 input must be exposed as an opt-in interface setting');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleSourcePreference'; })[0].value, 'settings.preferExternalSubtitles', 'subtitle source preference must be visible in the language settings');
assert.strictEqual(catalog.sectionLabel('playback'), 'settings.sectionPlayback', 'section labels must remain localized through the catalog');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].choices, [{ value: 'en', label: 'native:en' }, { value: 'it', label: 'native:it' }], 'interface language choices must identify every language using its native name');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].value, 'native:en', 'the active interface language must also use its native name');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'showMediaInfo'; })[0].choices.map(function (choice) { return choice.value; }), [true, false], 'boolean settings must expose explicit enabled and disabled choices');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'cardScale'; })[0].choices.map(function (choice) { return choice.value; }), [70, 100, 130], 'card scale must use the same values for cycling and modal selection');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'accentColor'; })[0].choices[1], { value: 'purple', label: 'C:purple', color: '#a66cff' }, 'accent choices must include their localized label and color swatch');
assert.ok(rows.filter(function (row) { return !row.action && !row.editor && !row.serverEditor && !row.profileEditor; }).every(function (row) { return row.choices && row.choices.length; }), 'every directly mutable setting must expose reusable modal choices');

console.log('Settings catalog checks passed');
