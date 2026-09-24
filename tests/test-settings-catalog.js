'use strict';

var assert = require('assert');
var SettingsCatalog = require('../app/settings-catalog');
var SettingsSchema = require('../app/settings-schema');
var settings = {
  highContrast: false, strongFocus: false, safeAreaTop: 0, safeAreaRight: 0, safeAreaBottom: 0, safeAreaLeft: 0, subtitleBackground: 'off', subtitlePosition: 7, subtitleEdge: 'shadow',
  uiLanguage: 'en', visualTheme: 'classic', wheelBehavior: 'items', cardScale: 100, uiTextScale: 115, artworkQuality: 80, backdropQuality: 60, artworkDataSaver: true, accentColor: 'cyan', searchT9Input: false,
  showWatchlist: true, showPlaylists: false, homeRows: ['recent', 'continue'], aggregateHomeLibraries: false, aggregateLibraries: false, backgroundMusic: false, backgroundVolume: 20, backgroundDelay: 500,
  lanVideoQuality: 'original', remoteVideoQuality: '8000', playbackMode: 'auto',
  videoVersionPriorities: ['resolution', 'hdr', 'quality', 'directPlay'], autoplayDelay: 5, upNextLayout: 'compact',
  skipPromptDuration: 5, audioLanguages: ['eng'], subtitleLanguages: ['ita'], subtitleSuppressedForAudio: [], subtitleMode: 'always', subtitleSourcePreference: 'external', subtitleRenderingSrt: false, subtitleRenderingAss: false
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
  subtitleBackgrounds: ['off','low','medium','high','opaque'], subtitleEdges: ['shadow','outline','both','double-outline-shadow'], subtitlePositions: [5,7,10,13,16],
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
  'plex', 'homeLibraries', 'navigation', 'appearance', 'accessibility', 'playback', 'languages', 'data'
], 'settings root must expose Plex followed by the dedicated Home & libraries category');
assert.deepStrictEqual(categories.map(function (category) {
  return category.rows.map(function (row) { return row.key; });
}), [
  ['plexServer', 'plexProfile', 'networkStatus', 'plexAccountAction'],
  ['libraryDisplayMode', 'homeRows', 'libraryTabs', 'aggregateLibraries', 'aggregateHomeLibraries'],
  ['uiLanguage', 'wheelBehavior', 'searchT9Input', 'showWatchlist', 'showPlaylists'],
  ['visualTheme', 'accentColor', 'cardScale', 'artworkDataSaver', 'artworkQuality', 'backdropQuality', 'interfaceAnimations', 'backgroundMusic', 'backgroundVolume', 'backgroundDelay'],
  ['uiTextScale', 'highContrast', 'strongFocus', 'safeAreaCalibration'],
  ['lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'videoVersionPriorities', 'playbackCompatibility', 'autoplayDelay', 'upNextLayout', 'skipPromptDuration'],
  ['audioLanguages', 'subtitleLanguages', 'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleSourcePreference', 'subtitleRenderingSrt', 'subtitleRenderingAss', 'subtitleAppearance'],
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

assert.strictEqual(categories[0].id, 'plex', 'Plex must remain the first Settings category');
assert.strictEqual(categories[1].id, 'homeLibraries', 'Home & libraries must sit immediately below Plex');
assert.strictEqual(categories[1].rows[0].label, 'settings.libraryDisplayMode', 'Navigation bar must be the first Home & libraries setting');
assert.strictEqual(categories[1].rows[1].label, 'settings.homeRowsAction', 'Home item ordering must use an explicit action label');
assert.strictEqual(categories[1].rows[2].label, 'settings.libraryTabs.manage', 'Server and library management must use an explicit action label');
assert.deepStrictEqual(categories[1].rows.map(function (row) { return row.key; }), ['libraryDisplayMode', 'homeRows', 'libraryTabs', 'aggregateLibraries', 'aggregateHomeLibraries'], 'Home & libraries must include the two Multi-Server merge controls after the regular Home and library settings');
assert.strictEqual(categories.some(function (category) { return category.id === 'multiServer'; }), false, 'Multi-Server must be a subsection instead of a root Settings category');
assert.strictEqual(categories[1].rows[3].subsectionTitle, 'settings.sectionMultiServer', 'the first cross-server setting must introduce the Multi-Server subsection');
assert.strictEqual(categories[1].rows[3].subsectionSpacer, true, 'the Multi-Server subsection must be visually separated by one blank row');
assert.strictEqual(categories[1].rows[3].description, 'settings.aggregateLibrariesDescription', 'library merge must explain its visible tab behavior');
assert.strictEqual(categories[1].rows[4].description, 'settings.aggregateHomeLibrariesDescription', 'Home merge must explain its cross-server Home library behavior');
assert.strictEqual(catalogSnapshot.byKey.libraryTabs.libraryTabsEditor, true, 'Libraries must open its dedicated editor');
assert.strictEqual(catalogSnapshot.byKey.homeRecentLibraries, undefined, 'Recently Added must be absorbed by Home item ordering instead of remaining a root setting');
assert.strictEqual(catalogSnapshot.byKey.aggregateLibraries.value, 'settings.disabled', 'library aggregation must default to disabled');
assert.strictEqual(catalogSnapshot.byKey.aggregateHomeLibraries.value, 'settings.disabled', 'Home aggregation must default to disabled');
assert.strictEqual(catalogSnapshot.byKey.libraryOrder, undefined, 'library ordering must live inside Libraries instead of remaining a root setting');
assert.strictEqual(catalogSnapshot.byKey.homeRows.homeRowsEditor, true, 'Home item order must open the unified source-aware Home editor');
assert.strictEqual(catalogSnapshot.byKey.homeRows.value, '', 'Home item ordering must not repeat a redundant Manage value on the right');
assert.strictEqual(catalogSnapshot.byKey.libraryTabs.value, '', 'Server and library management must not repeat a redundant Manage value on the right');
assert.strictEqual(catalogSnapshot.byKey.subtitleAppearance.value, '', 'editor-style Settings rows must not repeat a generic Manage value on the right');
assert.strictEqual(catalogSnapshot.byKey.playbackCompatibility.value, '', 'editor-style Settings rows must not repeat a generic Manage value on the right');
assert.strictEqual(catalogSnapshot.byKey.deleteLocalData.spacerBefore, true, 'local-data deletion must be separated from the preceding support controls by one blank row');
assert.strictEqual(categories[0].rows.some(function (row) { return row.key === 'libraryTabs' || row.key === 'homeRows'; }), false, 'Plex must not contain Home or library navigation management');
var networkStatusRow = rows.filter(function (row) { return row.key === 'networkStatus'; })[0];
assert.deepStrictEqual(
  { key: networkStatusRow.key, value: networkStatusRow.value, readOnly: networkStatusRow.readOnly },
  { key: 'networkStatus', value: 'Local network only', readOnly: true },
  'Plex settings must expose the live network state as a read-only row'
);
assert.deepStrictEqual(rows.slice(-5).map(function (row) { return row.key; }), ['diagnostics', 'privacy', 'plexAccountAction', 'deleteLocalData', 'appVersion'], 'support actions must end with diagnostics, privacy, account controls, and application version');
assert.ok(rows.slice(-5).every(function (row) { return row.action; }), 'support controls must remain actions instead of mutable settings');
assert.strictEqual(rows.filter(function (row) { return row.key === 'updates'; }).length, 0, 'updates must not remain as a separate settings row');
assert.deepStrictEqual(
  { label: rows[rows.length - 1].label, value: rows[rows.length - 1].value, versionRow: rows[rows.length - 1].versionRow },
  { label: 'Ploff 1.0.6', value: 'updates.status.available', versionRow: true },
  'the final settings row must expose the installed version and update availability'
);
assert.strictEqual(rows.filter(function (row) { return row.key === 'plexAccountAction'; })[0].label, 'setup.disconnectPlex', 'a connected account must expose only the disconnect command');
assert.strictEqual(rows.filter(function (row) { return row.key === 'plexAccountAction'; })[0].value, '', 'the account command must not mix action and connection state');
assert.deepStrictEqual(categories[0].rows.map(function (row) { return row.key; }), ['plexServer', 'plexProfile', 'networkStatus', 'plexAccountAction'], 'Plex settings must contain only Plex account/server controls');
assert.strictEqual(rows.filter(function (row) { return row.palette; })[0].key, 'accentColor', 'Accent color must retain its palette treatment');
assert.strictEqual(rows.filter(function (row) { return row.key === 'searchT9Input'; })[0].value, 'settings.disabled', 'T9 input must be exposed as an opt-in interface setting');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'visualTheme'; })[0].choices.map(function (choice) { return choice.value; }), ['immersive', 'premiere', 'aurora', 'mahogany', 'atelier', 'nova', 'classic'], 'visual themes must use the curated user-facing order');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleSourcePreference'; })[0].value, 'settings.preferExternalSubtitles', 'subtitle source preference must be visible in the language settings');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingSrt'; })[0].choices.map(function (choice) { return choice.value; }), [true, false], 'SRT rendering must expose the shared boolean choices');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingSrt'; })[0].value, 'settings.disabled', 'SRT rendering must be disabled by default');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingAss'; })[0].choices.map(function (choice) { return choice.value; }), [true, false], 'ASS rendering must expose the shared boolean choices');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingAss'; })[0].readOnly, undefined, 'ASS rendering must be selectable when the local renderer is available');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingAss'; })[0].disabled, undefined, 'ASS rendering must not remain disabled after adding the local renderer');
assert.strictEqual(rows.filter(function (row) { return row.key === 'subtitleRenderingAss'; })[0].value, 'settings.disabled', 'ASS rendering must remain opt-in by default');
assert.strictEqual(rows.filter(function (row) { return row.key === 'videoVersionPriorities'; })[0].priorityEditor, true, 'automatic video version criteria must use an orderable priority editor');
assert.strictEqual(rows.filter(function (row) { return row.key === 'homeRows'; })[0].orderedEditor, true, 'Home row visibility and order must use the shared ordered editor surface');
assert.strictEqual(rows.filter(function (row) { return row.key === 'homeRows'; })[0].value, '', 'Home ordering must be a simple action entry without redundant right-side copy');

var hiddenHomeRowsSettings = Object.assign({}, settings, { homeRows: [] });
var hiddenHomeRows = catalog.rows(hiddenHomeRowsSettings);
assert.strictEqual(hiddenHomeRows.filter(function (row) { return row.key === 'homeRows'; })[0].value, '',
  'Home ordering must remain a stable action entry even when all rows are hidden');
assert.strictEqual(catalog.sectionLabel('playback'), 'settings.sectionPlayback', 'section labels must remain localized through the catalog');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].choices, [{ value: 'en', label: 'native:en', languageCode: 'en' }, { value: 'it', label: 'native:it', languageCode: 'it' }], 'interface language choices must identify every language using its native name and flag code');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].languageCode, 'en', 'the interface language setting must expose its current flag');
assert.strictEqual(rows.filter(function (row) { return row.key === 'uiLanguage'; })[0].value, 'native:en', 'the active interface language must also use its native name');
assert.strictEqual(rows.filter(function (row) { return row.key === 'showMediaInfo'; }).length, 0, 'the redundant compact media information setting must not be exposed');
assert.deepStrictEqual(rows.filter(function (row) { return row.key === 'cardScale'; })[0].choices.map(function (choice) { return choice.value; }), SettingsSchema.allowed('cardScale'), 'card scale modal choices must come from the persisted schema');
var lightweightArtworkRow = rows.filter(function (row) { return row.key === 'artworkQuality'; })[0];
var lightweightBackdropRow = rows.filter(function (row) { return row.key === 'backdropQuality'; })[0];
assert.deepStrictEqual(lightweightArtworkRow.choices.map(function (choice) { return choice.value; }), [70, 80], 'lightweight image loading must visually cap artwork quality at 80%');
assert.deepStrictEqual(lightweightBackdropRow.choices.map(function (choice) { return choice.value; }), [50, 60, 70], 'lightweight image loading must visually cap backdrop quality at 70%');
var unrestrictedSettings = Object.assign({}, settings, { artworkDataSaver: false });
var unrestrictedRows = catalog.rows(unrestrictedSettings);
assert.deepStrictEqual(unrestrictedRows.filter(function (row) { return row.key === 'artworkQuality'; })[0].choices.map(function (choice) { return choice.value; }), SettingsSchema.allowed('artworkQuality'), 'normal image loading must retain the complete artwork quality scale');
assert.deepStrictEqual(unrestrictedRows.filter(function (row) { return row.key === 'backdropQuality'; })[0].choices.map(function (choice) { return choice.value; }), SettingsSchema.allowed('backdropQuality'), 'normal image loading must retain the complete backdrop quality scale');
var artworkQuality = rows.filter(function (row) { return row.key === 'artworkQuality'; })[0];
var backdropQuality = rows.filter(function (row) { return row.key === 'backdropQuality'; })[0];
assert.strictEqual(artworkQuality.value, '80%', 'artwork quality must display its capped current percentage');
assert.strictEqual(backdropQuality.value, '60%', 'backdrop quality must display its independent percentage');
assert.deepStrictEqual(artworkQuality.choices.map(function (choice) { return choice.value; }), [70, 80], 'artwork quality must expose only choices at or below the lightweight-loading cap');
assert.deepStrictEqual(backdropQuality.choices.map(function (choice) { return choice.value; }), [50, 60, 70], 'backdrop quality must expose only choices at or below the lightweight-loading cap');
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
  ['cardScale', 'artworkQuality', 'backdropQuality', 'uiTextScale', 'lanVideoQuality', 'remoteVideoQuality', 'autoplayDelay', 'skipPromptDuration', 'backgroundVolume', 'backgroundDelay'],
  'all ordered settings scales must use stepped bars in category order'
);
assert.deepStrictEqual(
  rows.reduce(function (sections, row) {
    if (sections[sections.length - 1] !== row.section) { sections.push(row.section); }
    return sections;
  }, []),
  ['plex', 'homeLibraries', 'interface', 'accessibility', 'playback', 'languages', 'audioAppearance', 'support'],
  'settings categories must follow the TV-first information hierarchy'
);
assert.deepStrictEqual(
  rows.filter(function (row) { return row.section === 'interface'; }).map(function (row) { return row.key; }),
  ['uiLanguage', 'visualTheme', 'accentColor', 'cardScale', 'artworkDataSaver', 'artworkQuality', 'backdropQuality', 'interfaceAnimations', 'wheelBehavior', 'searchT9Input', 'showWatchlist', 'showPlaylists'],
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
['premiere', 'nova', 'atelier', 'aurora', 'mahogany'].forEach(function (themeId) {
  settings.visualTheme = themeId;
  rows = catalog.rows(settings);
  assert.strictEqual(rows.filter(function (row) { return row.key === 'accentColor'; }).length, 0, themeId + ' must hide accent color because the theme owns its palette');
});
settings.visualTheme = 'classic';
rows = catalog.rows(settings);
assert.ok(rows.filter(function (row) { return !row.readOnly && !row.disabled && !row.action && !row.editor && !row.priorityEditor && !row.orderedEditor && !row.serverEditor && !row.profileEditor; }).every(function (row) { return row.choices && row.choices.length; }), 'every directly mutable setting must expose reusable modal choices');


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
  var schemaRows = schemaCatalog.rows(Object.assign({}, settings, { artworkDataSaver: false }));
  assert.strictEqual(schemaRows.filter(function (row) { return row.key === 'plexAccountAction'; })[0].label, 'setup.connectPlex',
    'a disconnected account must expose the existing Plex connection flow');
  var keys = [
    'visualTheme', 'cardScale', 'artworkQuality', 'backdropQuality', 'uiTextScale',
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
