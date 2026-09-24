'use strict';

var assert = require('assert');
var InputCommandRouter = require('../app/coordinator/input-command-router');
var SettingsController = require('../app/coordinator/settings-controller');
var settingsRouteCalls = [];
var viewState = { open: false, zone: 'list', index: 0, languageKind: '', languageIndex: 0 };
var rows = [
  { key: 'cardScale', label: 'Card size', choices: [{ value: 'small' }, { value: 'large' }] },
  { key: 'artworkQuality', label: 'Artwork quality', choices: [{ value: 70 }, { value: 90 }] },
  { key: 'backdropQuality', label: 'Backdrop quality', choices: [{ value: 50 }, { value: 85 }], choiceVariant: 'backdrop-quality' },
  { key: 'diagnostics', label: 'Diagnostics', action: true },
  { key: 'audioLanguages', label: 'Audio', editor: true },
  { key: 'appVersion', label: 'Ploff 1.0.5', action: true, versionRow: true },
  { key: 'playbackCompatibility', label: 'Playback compatibility', action: true, compatibilityEditor: true },
  { key: 'settingsBackup', label: 'Settings save', action: true },
  { key: 'visualTheme', label: 'Visual theme', choices: [{ value: 'classic' }, { value: 'immersive' }, { value: 'neon' }] },
  { key: 'libraryDisplayMode', label: 'Navigation bar style', action: true, libraryDisplayMode: true },
  { key: 'homeRows', label: 'Home item order', value: 'Manage', homeRowsEditor: true },
  { key: 'libraryTabs', label: 'Servers and libraries', action: true, libraryTabsEditor: true },
  { key: 'uiLanguage', label: 'Interface language', choices: [{ value: 'en' }, { value: 'it' }] },
  { key: 'aggregateHomeLibraries', label: 'Merge Home libraries', choices: [{ value: false }, { value: true }] }
];
var calls = [];
var lastLanguageRenderState = null;
var lastChoiceArguments = null;
var textInputOptions = null;
var textInputOpen = false;
var libraryTabsOpen = false;
var libraryTabsFocus = 0;
var libraryTabsOptions = null;
var homeOrderCalls = [];
var homeTabUpdates = [];
var localeEnsures = [];
var backupCalls = [];
var backupSaveError = null;
var deferBackupStatus = false;
var pendingBackupStatusCallback = null;
var deferBackdropPreview = false;
var pendingBackdropPreviewCallback = null;
var nextLoadedTheme = 'immersive';
var currentModel = 'OLED42';
var backupStatus = {
  exists: true,
  settingsMatch: true,
  currentProfile: { id: 'bedroom-id', name: 'Bedroom' },
  profiles: [
    { id: 'bedroom-id', name: 'Bedroom', model: 'OLED42', createdAt: 2000 },
    { id: 'living-id', name: 'Living room', model: 'OLED55', createdAt: 1000 }
  ]
};
var settings = {
  uiLanguage: 'en',
  cardScale: 'small',
  artworkQuality: 70,
  backdropQuality: 50,
  accentColor: 'cyan',
  interfaceAnimations: true,
  showWatchlist: true,
  showPlaylists: true,
  homeRows: ['continue', 'recommended', 'recent'],
  audioLanguages: ['en'],
  videoVersionPriorities: [],
  upNextLayout: 'compact',
  lanVideoQuality: 'original',
  remoteVideoQuality: 8000,
  adaptivePlaybackMemory: true,
  settingsBackupMode: 'off',
  visualTheme: 'neon',
  aggregateHomeLibraries: false
};
var nodes = {};
var rootStyleProperties = {};

function node(id) {
  if (!nodes[id]) {
    nodes[id] = {
      id: id,
      className: '',
      innerHTML: '',
      textContent: '',
      scrollTop: 0,
      style: { setProperty: function () {} },
      appendChild: function () {},
      focus: function () { calls.push('focus:' + id); },
      attributes: {},
      getAttribute: function (name) { return this.attributes[name] || ''; },
      setAttribute: function (name, value) { this.attributes[name] = String(value); },
      removeAttribute: function (name) { delete this.attributes[name]; }
    };
  }
  return nodes[id];
}

var document = {
  body: { className: '' },
  documentElement: { lang: 'en', style: { setProperty: function (name, value) { rootStyleProperties[name] = value; } } },
  getElementById: node,
  querySelectorAll: function (selector) {
    if (selector === '[data-update-index]') {
      node('update-check').attributes['data-update-index'] = '0';
      node('update-close').attributes['data-update-index'] = '1';
      return [node('update-check'), node('update-close')];
    }
    if (selector === '[data-playback-compatibility-index]') {
      node('playback-compatibility-enabled').attributes['data-playback-compatibility-index'] = '0';
      node('playback-compatibility-formats').attributes['data-playback-compatibility-index'] = '1';
      node('playback-compatibility-files').attributes['data-playback-compatibility-index'] = '2';
      node('playback-compatibility-reset').attributes['data-playback-compatibility-index'] = '3';
      node('playback-compatibility-close').attributes['data-playback-compatibility-index'] = '4';
      return [node('playback-compatibility-enabled'), node('playback-compatibility-formats'), node('playback-compatibility-files'), node('playback-compatibility-reset'), node('playback-compatibility-close')];
    }
    return [];
  }
};

var fakeView = {
  open: function (keepNavigationFocus) {
    viewState.open = true;
    viewState.zone = keepNavigationFocus ? 'nav' : 'list';
  },
  close: function () { viewState.open = false; viewState.languageKind = ''; },
  snapshot: function () {
    return {
      open: viewState.open,
      zone: viewState.zone,
      index: viewState.index,
      level: viewState.level || 'categories',
      categoryId: viewState.categoryId || '',
      categoryIndex: viewState.categoryIndex || 0,
      languageKind: viewState.languageKind,
      languageIndex: viewState.languageIndex
    };
  },
  openCategory: function (categoryId, categoryIndex) {
    viewState.level = 'category'; viewState.categoryId = categoryId; viewState.categoryIndex = categoryIndex; viewState.index = 0;
  },
  closeCategory: function () { viewState.level = 'categories'; viewState.categoryId = ''; viewState.index = viewState.categoryIndex || 0; },
  render: function () { calls.push('render'); },
  focus: function () { calls.push('focus'); },
  focusNavigation: function () { viewState.zone = 'nav'; },
  focusList: function (index) { viewState.zone = 'list'; viewState.index = Math.max(0, Math.min(rows.length - 1, Number(index) || 0)); },
  openLanguages: function (kind) { viewState.languageKind = kind; viewState.languageIndex = 0; },
  closeLanguages: function () { viewState.languageKind = ''; },
  focusLanguage: function (index, count) { viewState.languageIndex = Math.max(0, Math.min(count - 1, index)); },
  renderLanguages: function (state) { lastLanguageRenderState = state; calls.push('renderLanguages'); },
  updateLanguageFocus: function () { calls.push('updateLanguageFocus'); }
};

var upNextState = { open: false, selected: 'compact', focus: 0 };
var controller = SettingsController.create({
  platform: { root: { localStorage: {} }, document: document },
  modules: {
    InputCommandRouter: {
      playerQueue: InputCommandRouter.playerQueue,
      settings: function (context) { settingsRouteCalls.push(context); return InputCommandRouter.settings(context); }
    },
    Settings: {
      ACCENT_COLORS: ['cyan', 'red'],
      VISUAL_THEMES: ['classic', 'immersive', 'neon'],
      visualThemeDefinition: function (value) {
        var definitions = {
          classic: { id: 'classic', className: 'visual-theme-classic', labelKey: 'settings.themeClassic' },
          immersive: { id: 'immersive', className: 'visual-theme-immersive', labelKey: 'settings.themeImmersive' },
          neon: { id: 'neon', className: 'visual-theme-neon', labelKey: 'settings.themeNeon' }
        };
        return definitions[value] || definitions.immersive;
      },
      visualThemeClassNames: function () { return ['visual-theme-classic', 'visual-theme-immersive', 'visual-theme-neon']; },
      ARTWORK_QUALITIES: [70, 80, 85, 90, 100],
      BACKDROP_QUALITIES: [50, 60, 70, 85, 100],
      HOME_ROWS: ['continue', 'recommended', 'recent'],
      supportedUiLanguages: ['en', 'it'],
      seedFromPlex: function (value, account) {
        return Object.assign({}, value, {
          uiLanguage: account && account.locale ? account.locale : value.uiLanguage,
          audioLanguages: account && account.profile && account.profile.defaultAudioLanguage ? [account.profile.defaultAudioLanguage] : value.audioLanguages
        });
      },
      save: function (storage, value) { calls.push('save'); return value; }
    },
    SettingsCatalog: {
      create: function () { return { rows: function () { return rows; }, sectionLabel: function (value) { return value; } }; }
    },
    SettingsView: { create: function () { return fakeView; } },
    UpNextLayoutDialog: {
      create: function () {
        return {
          open: function (value) { upNextState.open = true; upNextState.selected = value; upNextState.focus = 0; },
          close: function () { upNextState.open = false; },
          snapshot: function () { return { open: upNextState.open, selected: upNextState.selected, focus: upNextState.focus }; },
          moveHorizontal: function (direction) { upNextState.focus = direction < 0 ? 2 : 3; },
          moveVertical: function (direction) { upNextState.focus = direction < 0 ? 0 : 2; },
          choose: function (value) { upNextState.selected = value; },
          confirm: function () { return upNextState.selected; }
        };
      }
    },
    SafeAreaDialog: {
      create: function () {
        return {
          open: function () {},
          render: function () {},
          snapshot: function () { return { open: false, focus: 0, values: {} }; },
          handleKey: function () { return true; },
          focusAction: function () { return true; },
          dismiss: function () {},
          destroy: function () {}
        };
      }
    },
    SubtitleStyleDialog: {
      create: function () {
        return {
          open: function () {}, close: function () {}, render: function () {},
          snapshot: function () { return { open: false, focus: 0, values: {} }; },
          handleKey: function () { return true; }, focusAction: function () { return true; }, destroy: function () {}
        };
      }
    },
    TextInputDialog: {
      create: function () {
        return {
          open: function (options) { textInputOptions = options; textInputOpen = true; return true; },
          snapshot: function () { return { open: textInputOpen }; },
          handleKey: function () { return true; }, focus: function () { return true; },
          destroy: function () { textInputOpen = false; }
        };
      }
    },
    LibraryTabsEditor: {
      create: function (options) {
        libraryTabsOptions = options;
        return {
          open: function () { libraryTabsOpen = true; calls.push('library-tabs-open'); return { open: true, index: libraryTabsFocus }; },
          openCustomize: function () { libraryTabsOpen = true; calls.push('library-tabs-customize'); return { open: true, index: libraryTabsFocus, mode: 'customize' }; },
          openRecent: function () { libraryTabsOpen = true; calls.push('library-tabs-recent'); return { open: true, index: libraryTabsFocus, mode: 'recent' }; },
          close: function () { libraryTabsOpen = false; calls.push('library-tabs-close'); return { open: false, index: libraryTabsFocus }; },
          snapshot: function () { return { open: libraryTabsOpen, index: libraryTabsFocus }; },
          focus: function (index) { libraryTabsFocus = index; calls.push('library-tabs-focus:' + index); return { open: libraryTabsOpen, index: libraryTabsFocus }; },
          render: function () { calls.push('library-tabs-render'); },
          handleKey: function (event) { calls.push('library-tabs-key:' + event.keyCode); if (event.keyCode === 461) { libraryTabsOpen = false; } return true; },
          destroy: function () { libraryTabsOpen = false; calls.push('library-tabs-destroy'); }
        };
      }
    },
    I18n: { languageName: function (language, code) { return code; }, nativeLanguageName: function (code) { return code; } },
    LocaleBootstrap: {
      ensure: function (_root, _document, language, callback) {
        localeEnsures.push({ language: language, callback: callback });
        return true;
      }
    },
    ServerStore: { normalizeUri: function (value) { return String(value || ''); } },
    ServerDiscovery: { isLocalCandidate: function () { return true; } },
    VersionSelection: { isPrioritySupported: function () { return true; } }
  },
  presentation: {
    t: function (key) { return key; },
    element: function () { return { appendChild: function () {} }; },
    pointerActive: function () { return false; }
  },
  librarySources: {
    preferenceState: function () { return {
      displayMode: 'text', home: { icon: 'home' }, serverAliases: [], serverStates: [], homeOrder: [],
      items: [
        { sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', enabled: true, homeRecentEnabled: true, alias: '', order: 0 },
        { sourceId: 'server-b|9', serverMachineIdentifier: 'server-b', enabled: true, homeRecentEnabled: true, alias: '', order: 1 }
      ]
    }; },
    sources: function () { return [
      { id: 'server-a|1', serverMachineIdentifier: 'server-a', sectionTitle: 'Film', primary: true },
      { id: 'server-b|9', serverMachineIdentifier: 'server-b', sectionTitle: 'Anime', primary: false }
    ]; },
    displayTitle: function (sourceId) { return sourceId === 'server-b|9' ? 'Anime \u00b7 Marco' : 'Film'; },
    homeOrder: function () { return ['kind:continue', 'kind:recommended', 'source:server-a|1', 'source:server-b|9']; },
    reorderHome: function (order) { homeOrderCalls.push(order.slice()); },
    updateTab: function (sourceId, changes) { homeTabUpdates.push({ sourceId: sourceId, changes: Object.assign({}, changes) }); },
    updateDisplayMode: function (mode) { calls.push('library-display:' + mode); }
  },
  shell: {
    getSettings: function () { return settings; },
    setSettings: function (value) { settings = value; calls.push('setSettings'); },
    enterSettings: function () { calls.push('enter'); },
    leaveSettings: function () { calls.push('leave'); },
    transitionHome: function () { calls.push('home'); },
    renderNavigation: function () { calls.push('navigation'); },
    applyCardScale: function () { calls.push('applyCardScale'); },
    translateStaticUi: function () { calls.push('translateStaticUi'); },
    refreshCardsForCurrentView: function () { calls.push('refreshCards'); },
    navigationIndex: function () { return 0; },
    markHomeDirty: function () { calls.push('homeDirty'); },
    recomposeHome: function () { calls.push('recomposeHome'); },
    loadBackdropPreview: function (callback) {
      calls.push('loadBackdropPreview');
      if (deferBackdropPreview) { pendingBackdropPreviewCallback = callback; return; }
      callback(null, 'https://example.test/sample-art');
    },
    clearBackdrop: function () { calls.push('clearBackdrop'); },
    showMessage: function (message) { calls.push('message:' + message); }
  },
  server: {
    config: function () { return { apiBaseUrl: 'http://127.0.0.1:32400' }; },
    active: function () { return { name: 'Server', connectionRoutes: [{ uri: 'http://127.0.0.1:32400', local: true }] }; },
    editorSnapshot: function () { return { open: false }; },
    closeEditor: function () { calls.push('closeServer'); }
  },
  account: { connected: function () { return true; } },
  dialogs: {
    openDiagnostics: function () { calls.push('diagnostics'); },
    openChoice: function (label) { lastChoiceArguments = Array.prototype.slice.call(arguments); calls.push('choice:' + label); }
  },
  environment: {
    accentColorValues: { cyan: '#0ff', red: '#f00' }, languageCatalog: ['en', 'it'], appVersion: '1.0.5',
    releaseStatusSnapshot: function () { return { status: 'available', installedVersion: '1.0.5', latestVersion: '1.0.6', checkedAt: 1000 }; },
    checkForUpdates: function (force) { calls.push('updateCheck:' + force); },
    playbackCompatibility: function () { return { formatRuleCount: 2, fileExceptionCount: 3, fileExceptionTtlDays: 30 }; },
    clearPlaybackCompatibilityFormats: function () { calls.push('clearCompatibilityFormats'); },
    clearPlaybackCompatibilityFiles: function () { calls.push('clearCompatibilityFiles'); },
    clearPlaybackCompatibility: function () { calls.push('clearCompatibility'); },
    playbackCapabilities: function () { return { modelName: currentModel }; },
    settingsBackup: {
      status: function (callback) {
        if (deferBackupStatus) { pendingBackupStatusCallback = callback; return; }
        callback(null, backupStatus);
      },
      save: function (callback) { backupCalls.push({ method: 'save' }); callback(backupSaveError, backupStatus); },
      registerDevice: function (name, callback) { backupCalls.push({ method: 'registerDevice', name: name }); callback(null, backupStatus); },
      restore: function (id, callback) {
        backupCalls.push({ method: 'restore', id: id });
        callback(null, backupStatus, { settings: Object.assign({}, settings, { uiLanguage: 'it' }) });
      },
      load: function (id, options, callback) {
        backupCalls.push({ method: 'load', id: id, options: options });
        callback(null, backupStatus, { settings: Object.assign({}, settings, { uiLanguage: 'it', visualTheme: nextLoadedTheme }), compatibilityApplied: currentModel.toLowerCase() === 'oled55' });
      },
      remove: function (callback) { backupCalls.push({ method: 'remove' }); callback(null, backupStatus); },
      scheduleAutoSave: function () { backupCalls.push({ method: 'scheduleAutoSave' }); return true; }
    }
  }
});

assert.strictEqual(typeof controller.persist, 'function', 'SettingsController must expose persistence without presentation reapplication');
assert.strictEqual(controller.save, undefined, 'SettingsController must keep presentation save internal; external callers use persist/owned feature ports');
assert.ok(libraryTabsOptions && typeof libraryTabsOptions.onRecentChange === 'function', 'library tabs editor must receive the Home presentation change callback');
var editorRecomposeCount = calls.filter(function (call) { return call === 'recomposeHome'; }).length;
libraryTabsOptions.onRecentChange();
assert.strictEqual(calls.filter(function (call) { return call === 'recomposeHome'; }).length, editorRecomposeCount + 1, 'library presentation changes must immediately recompose retained Home data');
assert.ok(calls.indexOf('homeDirty') >= 0, 'library presentation changes must still invalidate Home presentation');

if (typeof controller.persist === 'function') {
  var persistCallStart = calls.length;
  document.body.className = 'shell persist-sentinel';
  document.documentElement.lang = 'persist-sentinel';
  controller.persist();
  var persistCalls = calls.slice(persistCallStart);
  assert.ok(persistCalls.indexOf('save') !== -1 && persistCalls.indexOf('setSettings') !== -1,
    'pure Settings persistence must validate/save and publish the canonical settings object');
  assert.strictEqual(persistCalls.indexOf('applyCardScale'), -1,
    'pure Settings persistence must not reapply card-scale presentation');
  assert.strictEqual(persistCalls.indexOf('translateStaticUi'), -1,
    'pure Settings persistence must not retranslate static UI');
  assert.strictEqual(document.body.className, 'shell persist-sentinel',
    'pure Settings persistence must not reapply visual theme presentation');
  assert.strictEqual(document.documentElement.lang, 'persist-sentinel',
    'pure Settings persistence must not mutate document presentation state');
}


document.body.className = 'shell visual-theme-classic animations-disabled';
controller.applyVisualTheme();
assert.strictEqual(document.body.className.indexOf('visual-theme-classic'), -1, 'applying a theme removes the previous registered theme class');
assert.ok(document.body.className.indexOf('visual-theme-neon') >= 0, 'controller applies arbitrary registered theme classes without new branching');
settings.uiTextScale = 115;
controller.applyAccessibilityPreferences();
assert.strictEqual(rootStyleProperties['--ui-text-scale'], '18.4px', 'accessibility preferences must apply the persisted UI text scale to the root CSS variable');

controller.enter({ keepNavigationFocus: false });
controller.focusList(8, rows);
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.visualTheme, 'classic', 'changing the visual theme cycles through the registry-backed setting');
assert.ok(document.body.className.indexOf('visual-theme-classic') >= 0, 'changing theme applies the new body class immediately');
assert.strictEqual(document.body.className.indexOf('visual-theme-neon'), -1, 'changing theme removes the previously active theme class');
controller.leave();

controller.enter({ keepNavigationFocus: false });
controller.focusList(13, rows);
var aggregateRecomposeCount = calls.filter(function (call) { return call === 'recomposeHome'; }).length;
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.aggregateHomeLibraries, true, 'Home library aggregation setting must update normally');
assert.strictEqual(calls.filter(function (call) { return call === 'recomposeHome'; }).length, aggregateRecomposeCount + 1, 'changing Home library aggregation must immediately recompose retained Home data');
controller.leave();

assert.strictEqual(controller.snapshot().open, false, 'settings starts closed');
assert.strictEqual(typeof controller.handleSafeAreaKey, 'function', 'settings controller must expose safe-area input to the application overlay');
controller.setSetupLanguage('it', false);
assert.strictEqual(settings.uiLanguage, 'it', 'detected setup language updates the shared settings object');
assert.strictEqual(settings.uiLanguageExplicit, false, 'detected setup language remains non-explicit');
assert.strictEqual(document.documentElement.lang, 'it', 'setup language updates the document language through the normal save path');
assert.ok(calls.indexOf('homeDirty') >= 0, 'setup language invalidates Home translation state');
controller.setSetupLanguage('en', true);
assert.strictEqual(settings.uiLanguage, 'en', 'explicit setup language replaces the detected language');
assert.strictEqual(settings.uiLanguageExplicit, true, 'explicit setup language is persisted as an explicit choice');
var settingsBeforePlexSeed = settings;
var localeEnsuresBeforePlexSeed = localeEnsures.length;
assert.strictEqual(typeof controller.seedAccount, 'function', 'SettingsController must own Plex account seeding');
if (typeof controller.seedAccount === 'function') {
  controller.seedAccount({ locale: 'it', profile: {} });
  assert.notStrictEqual(settings, settingsBeforePlexSeed, 'Plex seeding must adopt the new Settings object identity returned by seedFromPlex');
  assert.strictEqual(settings.uiLanguage, 'it', 'Plex locale seeding must survive Settings persistence');
  assert.strictEqual(localeEnsures.length, localeEnsuresBeforePlexSeed + 1, 'Plex locale changes must ensure the lazy locale dictionary');
  assert.strictEqual(localeEnsures[localeEnsures.length - 1].language, 'it', 'Plex locale ensure must target the seeded interface language');
  settings.uiLanguage = settingsBeforePlexSeed.uiLanguage;
  document.documentElement.lang = settingsBeforePlexSeed.uiLanguage;
}
controller.enter({ keepNavigationFocus: false });
assert.strictEqual(controller.snapshot().open, true, 'enter opens settings');
controller.focusList(0, rows);
var settingsRenderCountBeforeMove = calls.filter(function (call) { return call === 'render'; }).length;
var settingsFocusCountBeforeMove = calls.filter(function (call) { return call === 'focus'; }).length;
controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(controller.snapshot().index, 1, 'Down must still move Settings focus to the next row');
assert.strictEqual(calls.filter(function (call) { return call === 'render'; }).length, settingsRenderCountBeforeMove, 'Settings vertical focus movement must not rebuild the list DOM');
assert.strictEqual(calls.filter(function (call) { return call === 'focus'; }).length, settingsFocusCountBeforeMove + 1, 'Settings vertical focus movement must update focus on the existing DOM');
rows.push({ key: 'plexCategory', label: 'Plex', category: true, categoryId: 'plex' });
controller.focusList(rows.length - 1, rows);
controller.handleKey({ keyCode: 37, preventDefault: function () {} }, 'left');
assert.strictEqual(controller.snapshot().level, 'categories', 'Left on a Settings category must keep the category list open');
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(controller.snapshot().level, 'category', 'Right on a Settings category must open it exactly like OK');
assert.strictEqual(controller.snapshot().categoryId, 'plex', 'Right must open the focused Settings category rather than changing an unrelated value');
fakeView.closeCategory();
rows.pop();
controller.focusList(0, rows);
assert.ok(calls.indexOf('enter') >= 0, 'enter routes through the shell');

controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.cardScale, 'large', 'Right cycles the focused setting');
assert.ok(calls.indexOf('save') >= 0, 'setting changes are persisted');
assert.ok(calls.indexOf('refreshCards') >= 0, 'card scale changes refresh cards');

var refreshCount = calls.filter(function (call) { return call === 'refreshCards'; }).length;
var dirtyCount = calls.filter(function (call) { return call === 'homeDirty'; }).length;
controller.focusList(1, rows);
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.artworkQuality, 90, 'artwork quality cycles through its numeric steps');
assert.strictEqual(calls.filter(function (call) { return call === 'refreshCards'; }).length, refreshCount + 1, 'artwork quality refreshes visible cards');
assert.strictEqual(calls.filter(function (call) { return call === 'homeDirty'; }).length, dirtyCount + 1, 'artwork quality invalidates cached Home presentation');
controller.focusList(2, rows);
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.backdropQuality, 85, 'backdrop quality cycles independently');
assert.ok(calls.indexOf('clearBackdrop') >= 0, 'backdrop quality clears the active backdrop so it is requested again');
controller.focusList(0, rows);
controller.openSettingChoice(1);
assert.deepStrictEqual(lastChoiceArguments[6], { cardScale: 'large' }, 'visual artwork preview must receive the currently configured card size');
controller.openSettingChoice(2);
assert.ok(calls.indexOf('choice:Backdrop quality') >= 0, 'pointer activation opens the explicitly clicked row even when rendered focus still points elsewhere');
assert.strictEqual(lastChoiceArguments[6].backdropUrl, 'https://example.test/sample-art', 'backdrop quality waits for and forwards a Plex server sample when needed');

controller.focusList(3, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.ok(calls.indexOf('diagnostics') >= 0, 'action rows route to explicit callbacks');

controller.focusList(5, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().updateOpen, true, 'the application version row opens the update dialog');
assert.strictEqual(node('update-dialog').getAttribute('aria-hidden'), 'false', 'the update dialog is exposed while open');
assert.strictEqual(node('update-installed-value').textContent, '1.0.5', 'the update dialog shows the installed version');
assert.strictEqual(node('update-latest-value').textContent, '1.0.6', 'the update dialog shows the latest known version');
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.ok(calls.indexOf('updateCheck:true') >= 0, 'the primary update action forces a manual check');
controller.focusUpdate(1);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().updateOpen, false, 'the update dialog closes through semantic OK');

controller.focusList(4, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().languageKind, 'audioLanguages', 'editor rows open transactionally');
assert.strictEqual(node('language-editor').getAttribute('aria-hidden'), 'false', 'opening the language editor exposes its dialog semantics');
controller.focusLanguage(2, 3, true);
assert.ok(calls.indexOf('updateLanguageFocus') !== -1, 'pointer language focus must update existing rows without rerendering');
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().languageKind, '', 'the visible Back action closes the language editor');
assert.strictEqual(node('language-editor').getAttribute('aria-hidden'), 'true', 'closing the language editor hides it from assistive technology');
assert.strictEqual(controller.snapshot().open, true, 'closing an editor keeps settings open');
controller.focusList(4, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
controller.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().languageKind, '', 'remote Back uses the same language-editor exit semantics');



controller.openSettingChoice(11);
assert.strictEqual(controller.snapshot().libraryTabsOpen, true, 'Server and libraries must open the dedicated customizer');
assert.ok(calls.indexOf('library-tabs-customize') >= 0, 'library customization must use the simplified customizer mode');
controller.focusLibraryTabs(1);
assert.ok(calls.indexOf('library-tabs-focus:1') >= 0, 'pointer focus must delegate to the library tabs editor');
controller.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().libraryTabsOpen, false, 'Back inside library customization must close the editor without leaving Settings');

controller.openSettingChoice(9);
assert.strictEqual(lastChoiceArguments[0], 'Navigation bar style', 'Navigation bar style must open one global appearance choice dialog');
assert.deepStrictEqual(lastChoiceArguments[1].map(function (item) { return item.value; }), ['text', 'icon', 'icon-text'], 'global navigation appearance must expose exactly the three approved modes');
lastChoiceArguments[3]({ value: 'icon-text' });
assert.ok(calls.indexOf('library-display:icon-text') >= 0, 'global navigation appearance must update the library source preference store');

controller.focusList(10, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().languageKind, 'homeRows', 'Home item order must open in the unified ordered editor');
assert.deepStrictEqual(lastLanguageRenderState.languages.map(function (item) { return item.code; }), [
  'kind:continue', 'kind:recommended', 'source:server-a|1', 'source:server-b|9'
], 'Home item order must replace the generic Recently Added entry with concrete library rows');
assert.deepStrictEqual(lastLanguageRenderState.languages.slice(2).map(function (item) { return item.label; }), [
  'settings.homeRow.recent \u00b7 Film', 'settings.homeRow.recent \u00b7 Anime \u00b7 Marco'
], 'specific Recently Added rows must identify their library in the unified Home editor');
controller.focusLanguage(2, 4);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.deepStrictEqual(homeTabUpdates.pop(), { sourceId: 'server-a|1', changes: { homeRecentEnabled: false } }, 'OK on a concrete Recently Added row must toggle only that library Home row');
assert.ok(calls.indexOf('homeDirty') >= 0, 'changing Home row visibility must invalidate Home presentation');
controller.focusLanguage(0, 4);
controller.moveLanguage(1);
assert.deepStrictEqual(homeOrderCalls.pop(), ['kind:recommended', 'kind:continue', 'source:server-a|1', 'source:server-b|9'], 'horizontal reorder must move generic and source-specific Home rows through one persistent order');
assert.deepStrictEqual(lastLanguageRenderState.motion, { movedCode: 'kind:continue', displacedCode: 'kind:recommended', direction: 1 }, 'Home reordering must describe the moved and displaced rows so the view can animate the swap');
controller.closeLanguages();

controller.focusList(7, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(lastChoiceArguments[1][0].status, 'matched', 'settings backup must show a matching state when saved settings match');
lastChoiceArguments[3]({ value: 'save' });
assert.ok(calls.indexOf('message:settings.backup.saved') >= 0, 'a successful settings save must show a success toast');
backupStatus.settingsMatch = false;

controller.focusList(7, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(lastChoiceArguments[1][0].status, 'unmatched', 'settings backup must show an out-of-date state when active settings differ');
backupSaveError = new Error('save failed');
lastChoiceArguments[3]({ value: 'save' });
assert.ok(calls.indexOf('message:settings.backup.error') >= 0, 'a failed settings save must show an error toast');
backupSaveError = null;
backupStatus.settingsMatch = true;

deferBackupStatus = true;
pendingBackupStatusCallback = null;
lastChoiceArguments = null;
controller.focusList(7, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(typeof pendingBackupStatusCallback, 'function', 'opening Settings backup must start the asynchronous status lookup');
controller.leave();
pendingBackupStatusCallback(null, backupStatus);
assert.strictEqual(lastChoiceArguments, null, 'a Settings backup status lookup completed after leaving Settings must not open a stale dialog');
deferBackupStatus = false;
pendingBackupStatusCallback = null;
controller.enter({ keepNavigationFocus: false });

deferBackdropPreview = true;
pendingBackdropPreviewCallback = null;
lastChoiceArguments = null;
controller.openSettingChoice(2);
assert.strictEqual(typeof pendingBackdropPreviewCallback, 'function', 'backdrop-quality choice must wait for its asynchronous preview');
controller.suspend();
assert.strictEqual(controller.snapshot().open, true, 'suspending Settings must preserve the retained Settings state');
pendingBackdropPreviewCallback(null, 'https://example.test/late-art');
assert.strictEqual(lastChoiceArguments, null, 'a backdrop preview completed after Settings suspension must not open a stale choice dialog');
deferBackdropPreview = false;
pendingBackdropPreviewCallback = null;
controller.enter({ keepNavigationFocus: false });

controller.openUpNext();
assert.strictEqual(node('up-next-preview-compact-heading').textContent, 'player.next', 'compact Up Next preview heading must be localized');
assert.strictEqual(node('up-next-preview-bottom-heading').textContent, 'player.upNextIn', 'bottom Up Next preview countdown must be localized');
assert.strictEqual(node('up-next-preview-bottom-episode').textContent, 'S1 E5 · player.next', 'bottom Up Next preview episode copy must be localized');
controller.chooseUpNext('bottom-panel');
controller.closeUpNext(false);
assert.strictEqual(settings.upNextLayout, 'compact', 'cancelling the Up Next editor preserves the saved value');
controller.openUpNext();
controller.chooseUpNext('bottom-panel');
controller.closeUpNext(true);
assert.strictEqual(settings.upNextLayout, 'bottom-panel', 'applying the Up Next editor persists the selected value');

controller.focusList(6, rows);
controller.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().compatibilityOpen, true, 'compatibility memory opens in its dedicated panel');
assert.strictEqual(node('playback-compatibility-dialog').getAttribute('aria-hidden'), 'false', 'compatibility panel exposes dialog semantics');
assert.strictEqual(node('playback-compatibility-status').textContent, '2 / 3', 'compatibility panel renders current rule counts');
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(settings.adaptivePlaybackMemory, false, 'horizontal input toggles compatibility memory in its panel');
controller.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().compatibilityOpen, false, 'Back closes the compatibility panel');

assert.strictEqual(typeof controller.promptSettingsLoad, 'function', 'settings controller must expose the reusable settings-load flow');
backupCalls = [];
textInputOptions = null;
textInputOpen = false;
var localeEnsuresBeforeBackupLoad = localeEnsures.length;
controller.promptSettingsLoad(backupStatus, { confirmFirst: false }, function () {});
assert.strictEqual(lastChoiceArguments[0], 'settings.backup.chooseSave', 'loading settings must first choose a saved device when multiple saves exist');
lastChoiceArguments[3]({ value: 'living-id' });
assert.ok(textInputOptions, 'different known TV models must skip the same-device question and ask for the current device name');
textInputOptions.apply('Bedroom renamed');
var differentModelLoad = backupCalls.filter(function (entry) { return entry.method === 'load'; }).pop();
assert.strictEqual(differentModelLoad.id, 'living-id');
assert.strictEqual(differentModelLoad.options.sameDevice, false, 'different models must load as another device');
assert.strictEqual(differentModelLoad.options.deviceName, 'Bedroom renamed');
assert.ok(document.body.className.indexOf('visual-theme-immersive') >= 0, 'loading settings from another TV applies the saved visual theme immediately');
assert.strictEqual(document.body.className.indexOf('visual-theme-classic'), -1, 'loading settings removes the previously active theme class');
assert.strictEqual(localeEnsures.length, localeEnsuresBeforeBackupLoad + 1, 'loading backup settings with another UI language must ensure its lazy locale');
assert.strictEqual(localeEnsures[localeEnsures.length - 1].language, 'it', 'backup locale ensure must target the loaded interface language');

backupCalls = [];
textInputOptions = null;
textInputOpen = false;
currentModel = 'OLED55';
nextLoadedTheme = 'neon';
controller.promptSettingsLoad(backupStatus, { confirmFirst: false }, function () {});
lastChoiceArguments[3]({ value: 'living-id' });
assert.strictEqual(lastChoiceArguments[0], 'settings.backup.sameDeviceTitle', 'matching models must ask whether this is the same physical TV');
lastChoiceArguments[3]({ value: 'same' });
var sameModelLoad = backupCalls.filter(function (entry) { return entry.method === 'load'; }).pop();
assert.strictEqual(sameModelLoad.options.sameDevice, true, 'confirming the same TV must adopt the saved device identity');
assert.ok(document.body.className.indexOf('visual-theme-neon') >= 0, 'recovering the same TV applies the saved visual theme immediately');
assert.strictEqual(document.body.className.indexOf('visual-theme-immersive'), -1, 'same-device recovery removes the previous theme class');
currentModel = 'OLED42';

controller.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(controller.snapshot().zone, 'nav', 'Back from the settings list must focus the current navbar entry');
assert.strictEqual(calls.indexOf('home'), -1, 'the first Back must not leave settings');
controller.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.ok(calls.indexOf('home') >= 0, 'Back from the settings navbar entry routes Home');
controller.leave();
assert.strictEqual(controller.snapshot().open, false, 'leave closes settings');
assert.ok(calls.indexOf('leave') >= 0, 'leave routes through the shell');

controller.enter({ keepNavigationFocus: false });
controller.openLanguages('audioLanguages');
controller.openUpNext();
rows.push({ key: 'privacy', label: 'Privacy', action: true });
controller.openSettingChoice(rows.length - 1);
rows.pop();
controller.focusList(12, rows);
controller.openSettingChoice(12);
var localeBeforeCycle = settings.uiLanguage;
var localeAfterChoice = localeBeforeCycle === 'en' ? 'it' : 'en';
var localeEnsuresBeforeCycle = localeEnsures.length;
lastChoiceArguments[3]({ value: localeAfterChoice });
assert.strictEqual(settings.uiLanguage, localeAfterChoice, 'choosing the interface language applies the new choice immediately');
assert.strictEqual(settings.uiLanguageExplicit, true, 'choosing the interface language marks the choice explicit');
assert.strictEqual(localeEnsures.length, localeEnsuresBeforeCycle + 1, 'interface language changes must ensure the lazy locale dictionary');
assert.strictEqual(localeEnsures[localeEnsures.length - 1].language, localeAfterChoice, 'locale ensure must target the new interface language');
var navigationCountBeforeLocale = calls.filter(function (call) { return call === 'navigation'; }).length;
var renderCountBeforeLocale = calls.filter(function (call) { return call === 'render'; }).length;
var saveCountBeforeLocaleReady = calls.filter(function (call) { return call === 'save'; }).length;
var autoSaveCountBeforeLocaleReady = backupCalls.filter(function (entry) { return entry.method === 'scheduleAutoSave'; }).length;
var translateCountBeforeLocaleReady = calls.filter(function (call) { return call === 'translateStaticUi'; }).length;
localeEnsures[localeEnsures.length - 1].callback(true);
assert.strictEqual(calls.filter(function (call) { return call === 'navigation'; }).length, navigationCountBeforeLocale + 1, 'loaded locales must refresh navigation labels');
assert.strictEqual(calls.filter(function (call) { return call === 'render'; }).length, renderCountBeforeLocale + 1, 'loaded locales must refresh the settings list');
assert.strictEqual(calls.filter(function (call) { return call === 'translateStaticUi'; }).length, translateCountBeforeLocaleReady + 1, 'loaded locales must retranslate global static UI after the dictionary is ready');
assert.strictEqual(calls.filter(function (call) { return call === 'save'; }).length, saveCountBeforeLocaleReady, 'locale readiness must not persist Settings a second time');
assert.strictEqual(backupCalls.filter(function (entry) { return entry.method === 'scheduleAutoSave'; }).length, autoSaveCountBeforeLocaleReady, 'locale readiness must not schedule a second settings backup autosave');
settings.uiLanguage = localeBeforeCycle;
localeEnsures[localeEnsures.length - 1].callback(true);
assert.strictEqual(calls.filter(function (call) { return call === 'navigation'; }).length, navigationCountBeforeLocale + 1, 'stale locale arrivals must not refresh superseded languages');
controller.destroy();
controller.destroy();
assert.strictEqual(node('update-dialog').className, 'update-dialog is-hidden', 'destroy must hide the update overlay');
assert.strictEqual(node('update-dialog').getAttribute('aria-hidden'), 'true', 'destroy must hide update semantics');
assert.strictEqual(node('privacy-dialog').className, 'privacy-dialog is-hidden', 'destroy must hide the privacy overlay');
assert.strictEqual(node('privacy-dialog').getAttribute('aria-hidden'), 'true', 'destroy must hide privacy semantics');
assert.strictEqual(node('language-editor').className, 'language-editor is-hidden', 'destroy must hide the language editor');
assert.strictEqual(node('language-editor').getAttribute('aria-hidden'), 'true', 'destroy must hide language-editor semantics');
assert.strictEqual(node('up-next-layout-dialog').className, 'up-next-layout-dialog is-hidden', 'destroy must hide the Up Next editor');
assert.strictEqual(node('up-next-layout-dialog').getAttribute('aria-hidden'), 'true', 'destroy must hide Up Next semantics');
assert.deepStrictEqual(controller.handleKey({ keyCode: 13 }, ''), { handled: false }, 'destroy makes input handling inert');

console.log('Settings controller checks passed');

assert.ok(settingsRouteCalls.length > 0, 'SettingsController must delegate key command selection to InputCommandRouter');
