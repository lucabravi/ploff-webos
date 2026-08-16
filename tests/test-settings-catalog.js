'use strict';

var assert = require('assert');
var SettingsCatalog = require('../app/settings-catalog');
var SettingsSchema = require('../app/settings-schema');
var settings = {
  highContrast: false, strongFocus: false, safeAreaTop: 0, safeAreaRight: 0, safeAreaBottom: 0, safeAreaLeft: 0, subtitleBackground: 'off', subtitlePosition: 7, subtitleEdge: 'shadow',
  uiLanguage: 'en', visualTheme: 'classic', wheelBehavior: 'items', cardScale: 100, artworkQuality: 90, backdropQuality: 60, accentColor: 'cyan', searchT9Input: false,
  showWatchlist: true, showPlaylists: false, backgroundMusic: false, backgroundVolume: 20, backgroundDelay: 500,
  lanVideoQuality: 'original', remoteVideoQuality: '8000', playbackMode: 'auto',
  videoVersionPriorities: ['resolution', 'hdr', 'quality', 'directPlay'], autoplayDelay: 5, upNextLayout: 'compact',
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
  visualThemeLabel: function (value) { return 'T:' + value; },
  supportedUiLanguages: function () { return ['en', 'it']; },
  accentValues: { cyan: '#13b8ad', purple: '#a66cff', white: '#ffffff' },
  subtitleBackgrounds: ['off','low','medium','high','opaque'], subtitleEdges: ['shadow','outline','both'], subtitlePositions: [5,7,10,13,16],
  appVersion: '1.0.6',
  updateStatusLabel: function () { return 'updates.status.available'; }
});
var rows = catalog.rows(settings);
var catalogSnapshot = catalog.snapshot(settings);
var categories = catalogSnapshot.categories;

assert.strictEqual(catalogSnapshot.allRows.length, rows.length, 'catalog snapshots must retain the complete flat row list');
assert.strictEqual(catalogSnapshot.byKey.diagnostics.key, 'diagnostics', 'catalog snapshots must expose an indexed row map');
assert.strictEqual(catalogSnapshot.versionRow.key, 'appVersion', 'catalog snapshots must expose the version row separately');
assert.strictEqual(catalogSnapshot.categories, categories, 'catalog categories must be reused from the single snapshot');

assert.deepStrictEqual(categories.map(function (category) { return category.id; }), [
  'plex', 'navigation', 'appearance', 'accessibility', 'playback', 'languages', 'data'
], 'settings root must expose the approved seven TV-first categories');
assert.deepStrictEqual(categories.map(function (category) {
  return category.rows.map(function (row) { return row.key; });
}), [
  ['plexServer', 'plexProfile', 'networkStatus', 'disconnectPlex'],
  ['uiLanguage', 'wheelBehavior', 'searchT9Input', 'showWatchlist', 'showPlaylists'],
  ['visualTheme', 'accentColor', 'cardScale', 'artworkQuality', 'backdropQuality', 'interfaceAnimations', 'backgroundMusic', 'backgroundVolume', 'backgroundDelay'],
  ['highContrast', 'strongFocus', 'safeAreaCalibration'],
  ['lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'videoVersionPriorities', 'playbackCompatibility', 'autoplayDelay', 'upNextLayout', 'skipPromptDuration'],
  ['audioLanguages', 'subtitleLanguages', 'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleSourcePreference', 'subtitleAppearance'],
  ['settingsBackup', 'diagnostics', 'privacy', 'deleteLocalData']
], 'every setting must belong to exactly one approved category');
assert.strictEqual(catalog.versionRow(settings).key, 'appVersion', 'application version must remain outside all categories');
assert.strictEqual(categories.some(function (category) {
  return category.rows.some(function (row) { return row.key === 'appVersion'; });
}), false, 'application version must not be nested in a category');

var categoryKeys = {};
var categoryKeyCount = 0;
categories.forEach(function (category) {
  category.rows.forEach(function (row) {
    assert.strictEqual(catalogSnapshot.byKey[row.key], row, 'category rows must reuse the indexed flat row object');
    assert.strictEqual(categoryKeys[row.key], undefined, 'a setting must not appear in more than one category');
    categoryKeys[row.key] = true;
    categoryKeyCount += 1;
  });
});
rows.filter(function (row) { return row.key !== 'appVersion'; }).forEach(function (row) {
  assert.strictEqual(categoryKeys[row.key], true, row.key + ' must be assigned to a visible category');
});
assert.strictEqual(categoryKeyCount, rows.length - 1, 'categories must cover every non-version setting exactly once');

assert.strictEqual(rows[0].key, 'plexServer', 'Plex server must remain the first setting');
assert.strictEqual(rows[1].key, 'plexProfile', 'Plex profile must remain next to the server picker');
assert.deepStrictEqual(
  { key: rows[2].key, value: rows[2].value, readOnly: rows[2].readOnly },
  { key: 'networkStatus', value: 'Local network only', readOnly: true },
  'Plex settings must expose the live network state as a read-only row'
);
assert.deepStrictEqual(rows.slice(-5).map(function (row) { return row.key; }), ['diagnostics', 'privacy', 'disconnectPlex', 'deleteLocalData', 'appVersion'], 'support actions must end with diagnostics, privacy, account controls, and application version');
assert.ok(rows.slice(-5).every(function (row) { return row.action; }), 'support controls must remain actions instead of mutable settings');
assert.strictEqual(rows.filter(function (row) { return row.key === 'updates'; }).length, 0, 'updates must not remain as a separate settings row');
assert.deepStrictEqual(
  { label: rows[rows.length - 1].label, value: rows[rows.length - 1].value, versionRow: rows[rows.length - 1].versionRow },
  { label: 'Ploff 1.0.6', value: 'updates.status.available', versionRow: true },
  'the final settings row must expose the installed version and update availability'
);
assert.strictEqual(rows.filter(function (row) { return row.key === 'disconnectPlex'; })[0].value, 'settings.connected', 'the account action must expose its current connection state');
assert.strictEqual(rows.filter(function (row) { return row.section === 'plex'; }).length, 3, 'Plex settings must keep server, profile and network state grouped together');
assert.strictEqual(rows.filter(function (row) { return row.palette; })[0].key, 'accentColor', 'Accent color must retain its palette treatment');
assert.strictEqual(rows.filter(function (row) { return row.key === 'searchT9Input'; })[0].value, 'settings.disabled', 'T9 input must be exposed as an opt-in interface setting');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleSourcePreference'; })[0].value, 'settings.preferExternalSubtitles', 'subtitle source preference must be visible in the language settings');
assert.strictEqual(rows.filter(function (row) { return row.key === 'videoVersionPriorities'; })[0].priorityEditor, true, 'automatic video version criteria must use an orderable priority editor');
assert.strictEqual(catalog.sectionLabel('playback'), 'settings.sectionPlayback', 'section labels must remain localized through the catalog');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].choices, [{ value: 'en', label: 'native:en', languageCode: 'en' }, { value: 'it', label: 'native:it', languageCode: 'it' }], 'interface language choices must identify every language using its native name and flag code');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].languageCode, 'en', 'the interface language setting must expose its current flag');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].value, 'native:en', 'the active interface language must also use its native name');
assert.strictEqual(rows.filter(function (row) { return row.key === 'showMediaInfo'; }).length, 0, 'the redundant compact media information setting must not be exposed');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'cardScale'; })[0].choices.map(function (choice) { return choice.value; }), SettingsSchema.allowed('cardScale'), 'card scale modal choices must come from the persisted schema');
var artworkQuality = rows.filter(function (row) { return row.key === 'artworkQuality'; })[0];
var backdropQuality = rows.filter(function (row) { return row.key === 'backdropQuality'; })[0];
assert.strictEqual(artworkQuality.value, '90%', 'artwork quality must display its current percentage');
assert.strictEqual(backdropQuality.value, '60%', 'backdrop quality must display its independent percentage');
assert.deepStrictEqual(artworkQuality.choices.map(function (choice) { return choice.value; }), [70, 80, 85, 90, 100], 'artwork quality must use the approved high-resolution scale');
assert.deepStrictEqual(backdropQuality.choices.map(function (choice) { return choice.value; }), [50, 60, 70, 85, 100], 'backdrop quality must use its independent wider scale');
assert.ok(artworkQuality.stepper && backdropQuality.stepper, 'both image quality settings must render as stepped bars');
assert.strictEqual(artworkQuality.choiceVariant, 'artwork-quality', 'artwork quality must open the shared image preview');
assert.strictEqual(backdropQuality.choiceVariant, 'backdrop-quality', 'backdrop quality must open the shared backdrop preview');
assert.strictEqual(rows.filter(function (row) { return row.key === 'safeAreaCalibration'; })[0].action, true, 'safe-area calibration must be a single action instead of four inline steppers');
assert.strictEqual(rows.filter(function (row) { return row.key === 'safeAreaCalibration'; })[0].value, 'settings.safeAreaDefault', 'safe-area calibration must expose a compact default-state label');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleAppearance'; })[0].subtitleStyleEditor, true, 'subtitle appearance must open one dedicated preview editor');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleBackground' || row.key === 'subtitlePosition' || row.key === 'subtitleEdge' || row.key === 'subtitleStylePreview'; }).length, 0, 'subtitle appearance controls must not remain duplicated in the flat settings list');
assert.strictEqual(rows.filter(function (row) { return row.key === 'cardScale'; })[0].choiceVariant, 'card-scale', 'poster size must request the visual card preview variant');
assert.deepStrictEqual(
  rows.filter(function (row) { return row.stepper; }).map(function (row) { return row.key; }),
  ['cardScale', 'artworkQuality', 'backdropQuality', 'lanVideoQuality', 'remoteVideoQuality', 'autoplayDelay', 'skipPromptDuration', 'backgroundVolume', 'backgroundDelay'],
  'all ordered settings scales must use stepped bars in category order'
);
assert.deepStrictEqual(
  rows.reduce(function (sections, row) {
    if (sections[sections.length - 1] !== row.section) { sections.push(row.section); }
    return sections;
  }, []),
  ['plex', 'interface', 'accessibility', 'playback', 'languages', 'audioAppearance', 'support'],
  'settings categories must follow the TV-first information hierarchy'
);
assert.deepStrictEqual(
  rows.filter(function (row) { return row.section === 'interface'; }).map(function (row) { return row.key; }),
  ['uiLanguage', 'visualTheme', 'accentColor', 'cardScale', 'artworkQuality', 'backdropQuality', 'interfaceAnimations', 'wheelBehavior', 'searchT9Input', 'showWatchlist', 'showPlaylists'],
  'interface settings must keep visual controls before navigation and optional surfaces'
);
var lanVideoQuality = rows.filter(function (row) { return row.key === 'lanVideoQuality'; })[0];
var remoteVideoQuality = rows.filter(function (row) { return row.key === 'remoteVideoQuality'; })[0];
assert.deepStrictEqual(lanVideoQuality.choices.map(function (choice) { return choice.value; }), ['4000', '8000', '12000', 'original'], 'video quality must increase from the lowest bitrate to Original');
assert.strictEqual(lanVideoQuality.currentValue, 'original', 'LAN quality must expose Original as the selected maximum step');
assert.strictEqual(remoteVideoQuality.currentValue, '8000', 'remote quality must expose its selected bitrate step');
assert.ok(lanVideoQuality.stepper && remoteVideoQuality.stepper, 'both video quality settings must render as stepped bars');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'upNextLayout'; })[0].choices.map(function (choice) { return choice.value; }), ['compact', 'bottom-panel'], 'Up Next layouts must be available to the settings selector');
assert.strictEqual(rows.filter(function (row) { return row.key === 'upNextLayout'; })[0].choices[1].label, 'settings.upNextLayout.bottomPanel', 'the bottom-panel choice must use the existing localized key');
settings.upNextLayout = 'bottom-panel';
rows = catalog.rows(settings);
assert.strictEqual(rows.filter(function (row) { return row.key === 'upNextLayout'; })[0].value, 'settings.upNextLayout.bottomPanel', 'the saved bottom-panel layout must render its localized value');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'accentColor'; })[0].choices.filter(function (choice) { return choice.value === 'purple'; })[0], { value: 'purple', label: 'C:purple', color: '#a66cff' }, 'accent choices must use schema-owned values while retaining localized labels and UI color swatches');
settings.visualTheme = 'immersive';
rows = catalog.rows(settings);
assert.strictEqual(rows.filter(function (row) { return row.key === 'accentColor'; }).length, 1, 'Immersive must expose accent color customization');
assert.strictEqual(rows.filter(function (row) { return row.section === 'interface'; })[2].key, 'accentColor', 'accent color must sit immediately below visual theme');
['premiere', 'nova', 'atelier'].forEach(function (themeId) {
  settings.visualTheme = themeId;
  rows = catalog.rows(settings);
  assert.strictEqual(rows.filter(function (row) { return row.key === 'accentColor'; }).length, 0, themeId + ' must hide accent color because the theme owns its palette');
});
settings.visualTheme = 'classic';
rows = catalog.rows(settings);
assert.ok(rows.filter(function (row) { return !row.readOnly && !row.action && !row.editor && !row.priorityEditor && !row.serverEditor && !row.profileEditor; }).every(function (row) { return row.choices && row.choices.length; }), 'every directly mutable setting must expose reusable modal choices');


(function persistedChoiceRowsComeFromSettingsSchema() {
  var schemaCatalog = SettingsCatalog.create({
    t: function (key) { return key; },
    languageName: function (language, code) { return language + ':' + code; },
    nativeLanguageName: function (code) { return 'native:' + code; },
    activeServerLabel: function () { return 'Plex'; },
    activeProfileTitle: function () { return 'Offline profile'; },
    networkStatusLabel: function () { return 'online'; },
    plexConnected: function () { return false; },
    videoQualityLabel: function (value) { return String(value); },
    playbackPreferenceLabel: function (value) { return String(value); },
    accentColorLabel: function (value) { return String(value); },
    visualThemeLabel: function (value) { return String(value); },
    supportedUiLanguages: function () { return SettingsSchema.allowed('uiLanguage'); },
    accentColors: SettingsSchema.allowed('accentColor'),
    accentValues: {},
    appVersion: '1.0.6'
  });
  var schemaRows = schemaCatalog.rows(settings);
  var keys = [
    'visualTheme', 'cardScale', 'artworkQuality', 'backdropQuality',
    'lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'autoplayDelay',
    'upNextLayout', 'skipPromptDuration', 'subtitleMode', 'subtitleSourcePreference',
    'backgroundVolume', 'backgroundDelay', 'wheelBehavior'
  ];

  keys.forEach(function (key) {
    var row = schemaRows.filter(function (candidate) { return candidate.key === key; })[0];
    assert.ok(row, key + ' must remain present in the UI catalog');
    assert.deepStrictEqual(
      row.choices.map(function (choice) { return choice.value; }),
      SettingsSchema.allowed(key),
      key + ' choices must come from the persisted Settings schema rather than a duplicated UI list'
    );
  });
}());

console.log('Settings catalog checks passed');
