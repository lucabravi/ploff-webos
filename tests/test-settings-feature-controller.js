'use strict';

var assert = require('assert');
var SettingsFeatureController = require('../app/coordinator/settings-feature-controller');

function createFixture() {
  var calls = [];
  var captured = null;
  var settings = { uiLanguage: 'en', accentColor: 'cyan' };
  var rows = [{ key: 'settingsBackup' }, { key: 'diagnostics' }, { key: 'privacy' }, { key: 'deleteLocalData' }];
  var languages = ['en', 'it', 'fr'];
  var state = {
    open: false,
    zone: 'list',
    index: 0,
    languageKind: '',
    languageIndex: 0,
    privacyOpen: false,
    upNext: { open: false, selected: 'compact', focus: 0 },
    settings: settings
  };
  var node = { className: 'app-settings-view is-hidden' };
  var controller = {
    enter: function (options) {
      state.open = true;
      state.zone = options && options.keepNavigationFocus ? 'nav' : 'list';
      captured.shell.enterSettings();
      calls.push('enter:' + !!(options && options.keepNavigationFocus));
      return state;
    },
    leave: function () {
      state.open = false;
      captured.shell.leaveSettings();
      calls.push('leave');
      return state;
    },
    handleKey: function (event, direction) { if (event && event.keyCode === 13) { controller.openSettingChoice(state.index); } calls.push('key:' + direction); return { handled: true }; },
    handlePrivacyKey: function () { calls.push('privacy-key'); return { handled: true }; },
    handleUpNextKey: function () { calls.push('up-next-key'); return { handled: true }; },
    snapshot: function () { return state; },
    rows: function () { return rows; },
    orderedLanguages: function () { return languages; },
    focusNavigation: function () { state.zone = 'nav'; calls.push('focus-nav'); },
    focusList: function (index) { state.zone = 'list'; state.index = index; calls.push('focus-setting:' + index); },
    focusLanguage: function (index, count, updateOnly) { state.languageIndex = index; calls.push('focus-language:' + index + ':' + count + ':' + (updateOnly === true)); },
    render: function () { calls.push('render'); },
    focus: function () { calls.push('focus'); },
    renderLanguages: function () { calls.push('render-languages'); },
    openSettingChoice: function (index) { calls.push('activate-setting:' + index); },
    closePrivacy: function () { state.privacyOpen = false; calls.push('close-privacy'); },
    selectAccentColor: function (color) { calls.push('accent:' + color); },
    toggleLanguage: function () { calls.push('toggle-language'); },
    chooseUpNext: function (value) { state.upNext.selected = value; calls.push('choose-up-next:' + value); },
    closeUpNext: function (apply) { state.upNext.open = false; calls.push('close-up-next:' + apply); },
    renderUpNext: function () { calls.push('render-up-next'); },
    refresh: function () { calls.push('refresh'); return state; },
    save: function () {
      captured.shell.setSettings(settings);
      calls.push('save');
      return settings;
    },
    promptSettingsLoad: function (status, options, callback) { calls.push('prompt-settings-load:' + status.profiles.length + ':' + (options.confirmFirst === true)); if (callback) { callback(null, null, true); } return true; },
    setSetupLanguage: function (language, explicit) {
      settings.uiLanguage = language;
      if (explicit === true) { settings.uiLanguageExplicit = true; }
      captured.shell.setSettings(settings);
      calls.push('setup-language:' + language + ':' + (explicit === true));
      return settings;
    },
    activeVideoQuality: function () { return 'original'; },
    connectionRouteLabel: function (route) { return 'route:' + (route || 'active'); },
    networkStatusLabel: function (snapshot) { return 'network:' + snapshot.status; },
    networkStatusClass: function (snapshot) { return 'is-network-' + snapshot.status; },
    playbackPreferenceLabel: function (value) { return 'mode:' + value; },
    videoQualityLabel: function (value) { return 'quality:' + value; },
    applyAccentColor: function () { calls.push('apply-accent'); },
    applyVisualTheme: function () { calls.push('apply-theme'); },
    applyAccessibilityPreferences: function () { calls.push('apply-accessibility'); },
    applyAnimationPreference: function () { calls.push('apply-animation'); },
    interfaceAnimationDuration: function (milliseconds) { return milliseconds / 2; },
    keepFocusVisible: function () { calls.push('keep-visible'); },
    destroy: function () { calls.push('destroy'); }
  };
  var options = {
    platform: {
      root: { localStorage: {} },
      document: {
        getElementById: function (id) { return id === 'app-settings-view' ? node : null; }
      },
      credentialStorage: {}
    },
    modules: {
      SettingsController: {
        create: function (received) { captured = received; return controller; }
      },
      Settings: {}, SettingsCatalog: {}, SettingsView: {}, I18n: {}, CardLayout: {},
      VersionSelection: {}, ServerStore: {}, ServerDiscovery: {}, UpNextLayoutDialog: {}
    },
    state: {
      getSettings: function () { return settings; },
      setSettings: function (next) { settings = next; calls.push('state-settings'); },
      publishSettings: function (next) { calls.push('session-settings:' + next.uiLanguage); }
    },
    presentation: {
      clearFocus: function () { calls.push('clear-focus'); }
    },
    shell: {
      renderNavigation: function () { calls.push('navigation'); }
    },
    server: {}, account: {}, dialogs: {}, environment: {},
    transitions: {
      enter: function () { calls.push('surface-enter'); },
      leave: function () { calls.push('surface-leave'); }
    }
  };
  return {
    feature: SettingsFeatureController.create(options),
    calls: calls,
    captured: function () { return captured; },
    controller: controller,
    node: node,
    state: state,
    settings: function () { return settings; }
  };
}

(function composesControllerAndPublishesSettings() {
  var fixture = createFixture();
  var feature = fixture.feature;
  var captured = fixture.captured();
  var next = { uiLanguage: 'it', accentColor: 'white' };

  assert.strictEqual(captured.modules.Settings, fixture.captured().modules.Settings, 'feature must pass Settings dependencies explicitly');
  captured.shell.setSettings(next);
  assert.strictEqual(fixture.settings(), next, 'saved settings must update the root settings holder');
  assert.ok(fixture.calls.indexOf('session-settings:it') !== -1, 'saved settings must publish to ApplicationSession');

  feature.enter({ keepNavigationFocus: true });
  assert.strictEqual(fixture.node.className, 'app-settings-view', 'enter must reveal the Settings-owned surface');
  assert.ok(fixture.calls.indexOf('surface-enter') !== -1, 'enter must use the explicit root transition port');

  feature.suspend();
  assert.strictEqual(fixture.node.className, 'app-settings-view is-hidden', 'suspend must hide Settings without resetting controller state');
  assert.strictEqual(fixture.state.open, true, 'suspend must preserve Settings state');

  feature.resume({ focusLast: true });
  assert.strictEqual(fixture.node.className, 'app-settings-view', 'resume must reveal Settings');
  assert.ok(fixture.calls.indexOf('focus-setting:3') !== -1, 'legacy focusLast behavior must remain available to generic callers');
  feature.resume({ focusKey: 'diagnostics' });
  assert.ok(fixture.calls.indexOf('focus-setting:1') !== -1, 'resume from diagnostics must restore the diagnostics row instead of the destructive last row');
  assert.ok(fixture.calls.indexOf('navigation') !== -1 && fixture.calls.indexOf('render') !== -1, 'resume must restore navigation and Settings presentation');

  feature.leave();
  assert.strictEqual(fixture.node.className, 'app-settings-view is-hidden', 'leave must hide the owned surface');
  assert.ok(fixture.calls.indexOf('surface-leave') !== -1, 'leave must use the explicit root transition port');
}());

(function exposesSemanticFocusAndPreferenceMethods() {
  var fixture = createFixture();
  var feature = fixture.feature;
  var button = { className: 'privacy-dialog-close' };

  feature.focusNavigation();
  var rendersBeforeSettingFocus = fixture.calls.filter(function (entry) { return entry === 'render'; }).length;
  var focusesBeforeSettingFocus = fixture.calls.filter(function (entry) { return entry === 'focus'; }).length;
  feature.focusSetting(1);
  feature.handleKey({ keyCode: 13 }, '');
  var rendersAfterSettingFocus = fixture.calls.filter(function (entry) { return entry === 'render'; }).length;
  var focusesAfterSettingFocus = fixture.calls.filter(function (entry) { return entry === 'focus'; }).length;
  feature.focusLanguage(2);
  feature.focusPrivacy(button);
  feature.selectAccentColor('white');
  feature.handleUpNextLayoutClick({ target: { getAttribute: function (name) { return name === 'data-up-next-layout' ? 'bottom-panel' : ''; }, parentNode: null } });
  feature.handleUpNextLayoutClick({ target: { getAttribute: function (name) { return name === 'data-up-next-layout' ? 'compact' : ''; }, parentNode: null } });
  feature.cancelUpNext();
  feature.applyUpNext();
  feature.handlePrivacyKey({ keyCode: 13 });
  feature.handleUpNextKey({ keyCode: 13 });

  assert.ok(fixture.calls.indexOf('focus-nav') !== -1, 'navigation focus must remain semantic');
  assert.ok(fixture.calls.indexOf('focus-setting:1') !== -1 && focusesAfterSettingFocus === focusesBeforeSettingFocus + 1, 'setting pointer focus must update the existing row in place');
  assert.strictEqual(rendersAfterSettingFocus, rendersBeforeSettingFocus, 'setting pointer focus must preserve the DOM node until the browser dispatches click');
  assert.ok(fixture.calls.indexOf('focus-language:2:4:true') !== -1, 'language pointer focus must use the feature-owned catalog length and preserve existing DOM rows');
  assert.strictEqual(fixture.calls.indexOf('render-languages'), -1, 'language pointer focus must not rebuild the row before click dispatch');
  assert.strictEqual(button.className, 'privacy-dialog-close is-focused', 'privacy pointer focus must remain Settings-owned');
  assert.ok(fixture.calls.indexOf('activate-setting:1') !== -1, 'setting pointer activation must preserve the clicked row index');
  assert.ok(fixture.calls.indexOf('choose-up-next:bottom-panel') !== -1 && fixture.calls.indexOf('render-up-next') !== -1, 'Up Next pointer selection must rerender through the feature');
  assert.ok(fixture.calls.indexOf('choose-up-next:compact') !== -1, 'Up Next option clicks must be interpreted by Settings');
  assert.ok(fixture.calls.indexOf('close-up-next:false') !== -1 && fixture.calls.indexOf('close-up-next:true') !== -1, 'Settings owns cancel and apply clicks for the Up Next layout dialog');
  assert.strictEqual(feature.activeVideoQuality(), 'original');
  assert.strictEqual(feature.connectionRouteLabel('lan'), 'route:lan');
  assert.strictEqual(feature.networkStatusLabel({ status: 'offline' }), 'network:offline');
  assert.strictEqual(feature.networkStatusClass({ status: 'offline' }), 'is-network-offline');
  assert.strictEqual(feature.playbackPreferenceLabel('direct'), 'mode:direct');
  assert.strictEqual(feature.videoQualityLabel('8000'), 'quality:8000');
  assert.strictEqual(feature.animationDuration(400), 200);
  assert.strictEqual(typeof feature.promptSettingsLoad, 'function', 'SettingsFeature must expose the reusable settings-load flow');
  feature.promptSettingsLoad({ profiles: [{ id: 'one' }] }, { confirmFirst: true }, function () {});
  assert.ok(fixture.calls.indexOf('prompt-settings-load:1:true') !== -1, 'onboarding must be able to reuse the Settings-owned load flow');
  assert.strictEqual(typeof feature.setSetupLanguage, 'function', 'SettingsFeature must expose setup-language persistence');
  feature.setSetupLanguage('it', true);
  assert.ok(fixture.calls.indexOf('setup-language:it:true') !== -1, 'setup language changes must use the Settings-owned save path');
  assert.strictEqual(fixture.settings().uiLanguage, 'it');
  assert.strictEqual(fixture.settings().uiLanguageExplicit, true);
}());

(function destroyIsIdempotentAndInert() {
  var fixture = createFixture();
  fixture.feature.enter({});
  fixture.feature.destroy();
  fixture.feature.destroy();
  assert.strictEqual(fixture.calls.filter(function (entry) { return entry === 'destroy'; }).length, 1, 'destroy must dispose the composed controller once');
  assert.strictEqual(fixture.node.className, 'app-settings-view is-hidden', 'destroy must hide the Settings surface');
  assert.strictEqual(fixture.feature.handleKey({ keyCode: 13 }, ''), false, 'destroyed feature must reject input');
}());

console.log('Settings feature controller checks passed');
