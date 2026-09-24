'use strict';

var assert = require('assert');
var SetupFeatureController = require('../app/coordinator/setup-feature-controller');
var SetupController = require('../app/setup-controller');

var buttons = [];
var renders = [];
var states = [];
var selects = [];
var setupLanguageWrites = [];
var localeEnsures = [];
var localeReady = [];
var setupSettings = { uiLanguage: 'en', uiLanguageExplicit: false };
var detectedLanguageCallback = null;
var setupViewNode = { id: 'setup-view', className: 'setup-view is-hidden' };
var localServer = { name: 'Local Plex', uri: 'http://192.168.1.10:32400', machineIdentifier: 'machine-1' };
var documentRef = {
  activeElement: null,
  querySelectorAll: function () { return buttons; },
  getElementById: function (id) {
    if (id === 'setup-view') { return setupViewNode; }
    return { id: id, textContent: '', className: '', innerHTML: '', children: [] };
  }
};

function button(attributes) {
  return {
    attributes: attributes || {},
    className: '',
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    getAttribute: function (name) { return this.attributes[name]; },
    focus: function () { documentRef.activeElement = this; }
  };
}

function key(code) {
  return { keyCode: code, prevented: false, preventDefault: function () { this.prevented = true; } };
}

var feature = SetupFeatureController.create({
  platform: {
    root: {
      setInterval: function () { return 1; },
      clearInterval: function () {},
      setTimeout: function () { return 1; },
      clearTimeout: function () {}
    },
    document: documentRef
  },
  modules: {
    SetupController: { create: function (options) { return SetupController.create(options); } },
    SetupScanIndicator: { create: function () { return { start: function () {}, stop: function () {} }; } },
    SetupFocus: { create: function () { return { apply: function (index) { return index; } }; } },
    SetupView: {
      create: function (options) {
        return {
          render: function (snapshot) { renders.push({ snapshot: snapshot, presentation: options.presentation(snapshot) }); },
          destroy: function () {}
        };
      }
    },
    SetupAuthSession: {
      create: function () {
        return { begin: function () {}, cancel: function () {} };
      }
    },
    LocaleBootstrap: {
      ensure: function (_root, _document, language, callback) {
        localeEnsures.push({ language: language, callback: callback });
        return true;
      }
    }
  },
  presentation: {
    t: function (value) { return value; },
    setText: function () {},
    element: function () { return {}; },
    pointerActive: function () { return false; },
    snapshot: function () { return { activeLanguage: 'it', activeProfileId: '', ownerToken: 'owner-token', manualAddress: '' }; }
  },
  state: {
    isActive: function () { return true; },
    ownerToken: function () { return 'owner-token'; }
  },
  settings: {
    get: function () { return setupSettings; },
    setSetupLanguage: function (language, explicit) {
      setupSettings = { uiLanguage: language, uiLanguageExplicit: explicit === true };
      setupLanguageWrites.push({ language: language, explicit: explicit === true });
      return setupSettings;
    }
  },
  language: {
    available: [{ code: 'en' }, { code: 'it' }],
    detect: function (supported, callback) { detectedLanguageCallback = callback; },
    select: function (language) {
      selects.push(language);
      setupSettings = { uiLanguage: language, uiLanguageExplicit: true };
      return setupSettings;
    }
  },
  server: {
    servers: function () { return [localServer]; },
    active: function () { return localServer; },
    apiBaseUrl: function () { return localServer.uri; },
    scan: function (_snapshot, _callback) { return { abort: function () {} }; },
    normalizeManualAddress: function (address) { return address ? 'http://' + address : ''; },
    probeManualAddress: function (_uri, _callback) { return { abort: function () {} }; },
    shouldOfferConnection: function () { return false; },
    selectConnection: function () {}
  },
  account: {
    authSnapshot: function () { return { setupComplete: false, activeProfileId: '', ownerToken: 'owner-token' }; },
    profiles: function () { return []; },
    ownerToken: function () { return 'owner-token'; },
    createPin: function () {},
    pollPin: function () {},
    loadAccountServers: function () {},
    loadProfiles: function (_token, _callback) { return { abort: function () {} }; },
    switchProfile: function (_profile, _pin, _callback) { return { abort: function () {} }; },
    continueOffline: function () {},
    disconnect: function () {}
  },
  transitions: {
    activate: function () {},
    completeStartup: function () {},
    localeReady: function (language) { localeReady.push(language); },
    show: function () {},
    onState: function (snapshot) { states.push(snapshot); },
    finish: function () {},
    cancel: function () {}
  }
});

feature.openFirstRun();
assert.strictEqual(typeof detectedLanguageCallback, 'function', 'first-run entry must detect a supported language');
assert.strictEqual(localeEnsures.length, 0, 'locale ensure must wait for the detected language');
detectedLanguageCallback('it');
assert.deepStrictEqual(setupLanguageWrites[0], { language: 'it', explicit: false }, 'detected language must persist without an explicit choice');
assert.strictEqual(feature.snapshot().stage, 'language', 'first-run entry must preserve the language-first stage');
assert.strictEqual(localeEnsures.length, 1, 'detected languages must ensure the lazy locale dictionary');
assert.strictEqual(localeEnsures[0].language, 'it', 'locale ensure must target the detected language');

var rendersBeforeLocale = renders.length;
var statesBeforeLocale = states.length;
localeEnsures[0].callback(true);
assert.deepStrictEqual(localeReady, ['it'], 'loaded setup locales must notify the application so global static UI can be retranslated');
assert.strictEqual(renders.length, rendersBeforeLocale + 1, 'loaded locales must re-render the setup surface');
assert.strictEqual(states.length, statesBeforeLocale + 1, 'loaded locales must republish the setup snapshot');
assert.strictEqual(renders[renders.length - 1].snapshot.stage, 'language', 'locale refresh must preserve the current setup stage');
assert.strictEqual(renders[renders.length - 1].snapshot.focusIndex, feature.snapshot().focusIndex, 'locale refresh must preserve onboarding focus while retranslating the current stage');

var target = button({ 'data-setup-language': '0' });
buttons = [target];
documentRef.activeElement = target;
assert.strictEqual(feature.focusButton(target), true);
assert.strictEqual(feature.handleKey(key(13)).handled, true);
assert.deepStrictEqual(selects, ['en'], 'language selection must route through the explicit language port');
assert.strictEqual(localeEnsures.length, 2, 'explicit language choices must ensure the lazy locale dictionary');
assert.strictEqual(localeEnsures[1].language, 'en', 'locale ensure must target the explicitly selected language');

rendersBeforeLocale = renders.length;
localeEnsures[0].callback(true);
assert.strictEqual(renders.length, rendersBeforeLocale, 'stale locale arrivals must not re-render superseded languages');
localeEnsures[1].callback(true);
assert.strictEqual(renders.length, rendersBeforeLocale + 1, 'the selected locale must re-render the setup surface once loaded');

rendersBeforeLocale = renders.length;
feature.destroy();
localeEnsures[1].callback(true);
assert.strictEqual(renders.length, rendersBeforeLocale, 'locale arrivals after destroy must stay inert');

console.log('Setup feature locale refresh checks passed');
