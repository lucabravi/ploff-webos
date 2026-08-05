'use strict';

var assert = require('assert');
var SetupFeatureController = require('../app/coordinator/setup-feature-controller');
var SetupController = require('../app/setup-controller');
var buttons = [];
var activeElement = null;
var scans = [];
var probes = [];
var profileLoads = [];
var profileSwitches = [];
var renders = [];
var finishes = [];
var cancellations = [];
var selectedLanguages = [];
var states = [];
var shows = 0;
var authOptions;
var authCancelled = 0;
var controllerDestroyed = 0;
var viewDestroyed = 0;
var indicator = { active: false, starts: 0, stops: 0 };
var setupViewNode = { id: 'setup-view', className: 'setup-view is-hidden' };
var setupSettings = { uiLanguage: 'en', uiLanguageExplicit: false };
var detectedLanguageCallback = null;
var entryActivations = [];
var setupLanguageWrites = [];
var startupCompletions = 0;
var localServer = { name: 'Local Plex', uri: 'http://192.168.1.10:32400', machineIdentifier: 'machine-1' };
var protectedProfile = { id: 'profile-1', title: 'Kid', protected: true };
var documentRef = {
  activeElement: activeElement,
  querySelectorAll: function () { return buttons; },
  getElementById: function (id) {
    if (id === 'setup-view') { return setupViewNode; }
    if (id === 'setup-address') { return activeElement || { id: id, value: '' }; }
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

function activate(target) {
  buttons = [target];
  documentRef.activeElement = target;
  assert.strictEqual(feature.focusButton(target), true);
  assert.strictEqual(feature.handleKey(key(13)).handled, true);
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
    SetupController: {
      create: function (options) {
        var controller = SetupController.create(options);
        var originalDestroy = controller.destroy;
        controller.destroy = function () { controllerDestroyed += 1; originalDestroy(); };
        return controller;
      }
    },
    SetupScanIndicator: {
      create: function () {
        return {
          start: function () { indicator.active = true; indicator.starts += 1; },
          stop: function () { indicator.active = false; indicator.stops += 1; }
        };
      }
    },
    SetupFocus: { create: function () { return { apply: function (index) { return index; } }; } },
    SetupView: {
      create: function (options) {
        return {
          render: function (snapshot) { renders.push({ snapshot: snapshot, presentation: options.presentation(snapshot) }); },
          destroy: function () { viewDestroyed += 1; }
        };
      }
    },
    SetupAuthSession: {
      create: function (options) {
        authOptions = options;
        return {
          begin: function () { if (options.onState) { options.onState({ phase: 'waiting', pin: { code: 'ABCD' } }); } },
          cancel: function () { authCancelled += 1; if (options.onState) { options.onState({ phase: 'idle', pin: null }); } }
        };
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
    detect: function (supported, callback) { detectedLanguageCallback = callback; assert.deepStrictEqual(supported, ['en', 'it']); },
    select: function (language) { selectedLanguages.push(language); }
  },
  server: {
    servers: function () { return [localServer]; },
    active: function () { return localServer; },
    apiBaseUrl: function () { return localServer.uri; },
    scan: function (snapshot, callback) { scans.push({ snapshot: snapshot, callback: callback }); return { abort: function () {} }; },
    normalizeManualAddress: function (address) { return address ? 'http://' + address : ''; },
    probeManualAddress: function (uri, callback) { probes.push({ uri: uri, callback: callback }); return { abort: function () {} }; },
    shouldOfferConnection: function () { return false; },
    selectConnection: function () {}
  },
  account: {
    authSnapshot: function () { return { setupComplete: false, activeProfileId: protectedProfile.id, ownerToken: 'owner-token' }; },
    profiles: function () { return [protectedProfile]; },
    ownerToken: function () { return 'owner-token'; },
    createPin: function () {},
    pollPin: function () {},
    loadAccountServers: function () {},
    loadProfiles: function (token, callback) { profileLoads.push({ token: token, callback: callback }); return { abort: function () {} }; },
    switchProfile: function (profile, pin, callback) { profileSwitches.push({ profile: profile, pin: pin, callback: callback }); return { abort: function () {} }; },
    continueOffline: function () {},
    disconnect: function () {}
  },
  transitions: {
    activate: function () { entryActivations.push('setup'); },
    completeStartup: function () { startupCompletions += 1; },
    show: function () { shows += 1; },
    onState: function (snapshot) { states.push(snapshot); },
    finish: function (snapshot) { finishes.push(snapshot); },
    cancel: function (snapshot) { cancellations.push(snapshot); }
  }
});

assert.strictEqual(typeof feature.openFirstRun, 'function', 'SetupFeature must expose semantic first-run entry');
assert.strictEqual(typeof feature.openProfiles, 'function', 'SetupFeature must expose semantic profile-manager entry');
assert.strictEqual(typeof feature.openManual, 'function', 'SetupFeature must expose semantic manual-server entry');
feature.openFirstRun();
assert.strictEqual(typeof detectedLanguageCallback, 'function', 'first-run entry must ask the locale port to detect a supported language');
detectedLanguageCallback('it');
assert.deepStrictEqual(setupLanguageWrites[0], { language: 'it', explicit: false }, 'detected language must be persisted without marking it as an explicit user choice');
assert.strictEqual(entryActivations.length, 1, 'semantic setup entry must activate the Setup application view');
assert.strictEqual(startupCompletions, 1, 'first-run setup entry must complete the startup veil after opening');
assert.strictEqual(feature.snapshot().stage, 'language', 'first-run entry must preserve the language-first stage');
feature.openProfiles('settings');
assert.strictEqual(feature.snapshot().stage, 'profiles', 'profile-manager entry must render cached profiles immediately');
assert.strictEqual(feature.snapshot().returnView, 'settings', 'profile-manager entry must retain its semantic return view');
assert.strictEqual(feature.snapshot().focusIndex, 0, 'profile-manager entry must focus the active cached profile');
assert.strictEqual(profileLoads.length, 1, 'profile-manager entry must refresh cached profiles in the background');
feature.openManual('settings');
assert.strictEqual(feature.snapshot().stage, 'manual', 'manual entry must open the manual endpoint stage directly');
assert.strictEqual(feature.snapshot().returnView, 'settings', 'manual entry must retain its semantic return view');

shows = 0;
scans.length = 0;
profileLoads.length = 0;
selectedLanguages.length = 0;
setupSettings = { uiLanguage: 'it', uiLanguageExplicit: false };
feature.openFirstRun();
detectedLanguageCallback('it');
assert.strictEqual(shows, 1, 'enter must announce the owned Setup surface exactly once');
assert.strictEqual(setupViewNode.className, 'setup-view', 'enter must show the Setup-owned DOM surface without root mutation');
assert.strictEqual(feature.snapshot().stage, 'language', 'first-run onboarding must begin with language selection');
assert.strictEqual(scans.length, 1, 'language-first onboarding may keep discovery running in the background');
scans[0].callback(null, [localServer]);
assert.strictEqual(feature.snapshot().stage, 'language', 'a background scan must not skip language selection');
assert.strictEqual(feature.snapshot().servers.length, 1, 'background discovery results must persist until server selection');
activate(button({ 'data-setup-language': '1' }));
assert.strictEqual(selectedLanguages[0], 'it', 'language selection must route through the explicit language port');
assert.strictEqual(feature.snapshot().stage, 'servers', 'language selection must advance to discovered servers');

activate(button({ 'data-setup-action': 'manual' }));
activeElement = { id: 'setup-address', value: 'plex.local' };
documentRef.activeElement = activeElement;
var manualEnter = key(13);
assert.strictEqual(feature.handleKey(manualEnter).handled, true, 'Enter in manual server input must be handled');
assert.strictEqual(probes.length, 1, 'manual server entry must delegate one normalized probe');
probes[0].callback(null, localServer);
assert.strictEqual(feature.snapshot().stage, 'access', 'a reachable manual server must advance to access selection');

activate(button({ 'data-setup-action': 'login' }));
assert.strictEqual(feature.snapshot().stage, 'login', 'online access fallback must enter the login stage');
authOptions.onAuthenticated({ token: 'owner-token' });
assert.strictEqual(profileLoads.length, 1, 'successful online login must continue by loading profiles');
profileLoads[0].callback(null, [protectedProfile]);
assert.strictEqual(feature.snapshot().stage, 'profiles', 'loaded profiles must replace the login presentation');
activate(button({ 'data-setup-profile': '0' }));
assert.strictEqual(feature.snapshot().stage, 'profile-pin', 'protected profiles must enter numeric PIN input');
[49, 50, 51, 52].forEach(function (code) { assert.strictEqual(feature.handleKey(key(code)).handled, true); });
assert.strictEqual(feature.snapshot().profilePinLength, 4, 'remote numeric input must remain inside setup state');
assert.strictEqual(Object.prototype.hasOwnProperty.call(feature.snapshot(), 'profilePin'), false, 'feature snapshots must never expose the profile PIN value');
activate(button({ 'data-setup-action': 'unlock-profile' }));
assert.strictEqual(profileSwitches[0].pin, '1234', 'profile unlock must pass the controller-owned numeric PIN to the account port');
profileSwitches[0].callback(null, { id: 'profile-1', token: 'profile-token' });
assert.strictEqual(finishes.length, 1, 'successful profile loading must complete setup once');
assert.strictEqual(setupViewNode.className, 'setup-view is-hidden', 'successful setup completion must hide the owned surface before returning');

feature.openProfiles('');
activate(button({ 'data-setup-profile': '0' }));
feature.handleKey(key(461));
assert.strictEqual(feature.snapshot().stage, 'profiles', 'Back from profile PIN must return to profile selection');
var cancellationsBeforeFirstRun = cancellations.length;
setupSettings = { uiLanguage: 'it', uiLanguageExplicit: false };
feature.openFirstRun();
detectedLanguageCallback('it');
activate(button({ 'data-setup-language': '1' }));
activate(button({ 'data-setup-server': '0' }));
assert.strictEqual(feature.snapshot().stage, 'access', 'semantic first-run navigation must reach access selection');
activate(button({ 'data-setup-action': 'cancel' }));
assert.strictEqual(feature.snapshot().stage, 'servers', 'Cancel during first-run setup must return to server selection');
assert.strictEqual(cancellations.length, cancellationsBeforeFirstRun, 'first-run Cancel must stay inside Setup instead of invoking an external return transition');
assert.strictEqual(setupViewNode.className, 'setup-view', 'first-run Cancel must keep the Setup surface visible');
feature.openProfiles('settings');
activate(button({ 'data-setup-action': 'cancel' }));
assert.strictEqual(cancellations.length, cancellationsBeforeFirstRun + 1, 'cancel with a return view must route through the explicit transition port');
assert.strictEqual(setupViewNode.className, 'setup-view is-hidden', 'return-view cancellation must hide the owned Setup surface');
assert.ok(authCancelled > 0, 'Back, cancellation, and re-entry must cancel authentication sessions');

feature.openProfiles('settings');
buttons = [
  button({ 'data-setup-profile': '0' }),
  button({ 'data-setup-action': 'disconnect' }),
  button({ 'data-setup-action': 'offline' }),
  button({ 'data-setup-action': 'cancel' })
];
documentRef.activeElement = buttons[3];
var rendersBeforePointerFocus = renders.length;
assert.strictEqual(feature.focusButton(buttons[3]), true, 'pointer focus must address Profile actions inside the feature');
assert.strictEqual(renders.length, rendersBeforePointerFocus, 'pointer focus must not rebuild Profile actions before the browser click completes');
assert.strictEqual(feature.handleKey(key(13)).handled, true, 'semantic OK must activate the focused Profile action');
assert.strictEqual(cancellations.length, cancellationsBeforeFirstRun + 2, 'clicked Profile Cancel must use the same cancellation lifecycle as remote OK');

feature.destroy();
feature.destroy();
var rendersAfterDestroy = renders.length;
var profilesAfterDestroy = profileLoads.length;
authOptions.onState({ phase: 'waiting', pin: { code: 'LATE' } });
authOptions.onAuthenticated({ token: 'late-token' });
assert.strictEqual(feature.handleKey(key(13)).handled, false, 'destroyed Setup must not consume remote input');
feature.openManual('');
assert.strictEqual(renders.length, rendersAfterDestroy, 'destroyed Setup must not reopen or publish late presentation state');
assert.strictEqual(profileLoads.length, profilesAfterDestroy, 'late authentication must not start account requests after destroy');
assert.strictEqual(feature.snapshot().destroyed, true, 'destroy must be idempotent and leave the Setup controller inert');
assert.strictEqual(controllerDestroyed, 1, 'destroy must tear down the Setup controller exactly once');
assert.strictEqual(viewDestroyed, 1, 'destroy must tear down Setup-view timers exactly once');
assert.ok(indicator.stops > 0, 'destroy must stop the Setup scan presentation');
assert.ok(renders.length > 5 && states.length > 5, 'Setup orchestration must publish presentation snapshots for each stage');

console.log('Setup feature controller checks passed');
