'use strict';

var assert = require('assert');
var SetupView;

try {
  SetupView = require('../app/setup-view');
} catch (error) {
  SetupView = null;
}

assert.ok(SetupView && typeof SetupView.create === 'function', 'setup view module must expose create');

function node(tagName, className, text) {
  var value = {
    tagName: tagName || '', className: className || '', textContent: text || '', children: [], attributes: {},
    style: {}, value: '', type: '', maxLength: 0, placeholder: '', src: '', alt: '', focused: false,
    appendChild: function (child) { this.children.push(child); this.textContent += child.textContent || ''; return child; },
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    focus: function () { this.focused = true; }
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () { this.children = []; }
  });
  return value;
}

var nodes = {};
[
  'setup-step', 'setup-title', 'setup-message', 'setup-server-list', 'setup-profile-list',
  'setup-login', 'setup-code', 'setup-login-status', 'setup-manual', 'setup-address', 'setup-actions'
].forEach(function (id) { nodes[id] = node('div'); });

var focusCalls = [];
var scanCalls = [];
var translations = {};
var languages = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' }
];
var presentation = {
  activeLanguage: 'it',
  activeProfileId: 'profile-2',
  ownerToken: 'owner-token',
  serverDiscoveryActive: false,
  manualAddress: 'https://configured.example.test',
  loginPin: { code: 'AB12' },
  returnView: '',
  statusKey: ''
};

function translate(key) {
  return translations[key] || key;
}

function element(tagName, className, text) {
  return node(tagName, className, text);
}

var view = SetupView.create({
  document: {
    getElementById: function (id) { return nodes[id]; }
  },
  element: element,
  setText: function (id, value) { nodes[id].textContent = value; },
  t: translate,
  languages: languages,
  presentation: function () { return presentation; },
  focus: function (index, count) { focusCalls.push({ index: index, count: count }); },
  scanIndicator: {
    start: function () { scanCalls.push('start'); },
    stop: function () { scanCalls.push('stop'); }
  }
});

function actions() {
  return nodes['setup-actions'].children.map(function (button) {
    return { label: button.textContent, action: button.attributes['data-setup-action'], primary: /is-primary/.test(button.className) };
  });
}

function listText(id) {
  return nodes[id].children.map(function (item) { return item.textContent; });
}

view.render({ stage: 'language', focusIndex: 1, selectedLanguage: '', profiles: [], servers: [] });
assert.strictEqual(nodes['setup-title'].textContent, 'setup.chooseLanguageTitle', 'language stage must render its title');
assert.strictEqual(nodes['setup-server-list'].className, 'setup-list setup-language-list', 'language stage must use the language list');
assert.deepStrictEqual(listText('setup-server-list'), ['English', 'Italiano✓'], 'language options must render labels and active markers');
assert.strictEqual(nodes['setup-server-list'].children[1].className, 'setup-option is-active', 'injected active language must be marked');
assert.deepStrictEqual(focusCalls[0], { index: 1, count: 2 }, 'language stage must delegate the controller focus index');

view.render({
  stage: 'servers', focusIndex: 0, servers: [{ name: 'Local Plex', uri: 'http://plex.local:32400', version: '1.2' }],
  profiles: [], statusKey: '', returnView: 'settings'
});
assert.deepStrictEqual(listText('setup-server-list'), ['Local Plexplex.local:32400 - 1.2'], 'servers stage must render server identity and metadata');
assert.deepStrictEqual(actions(), [
  { label: 'setup.scanAgain', action: 'scan', primary: true },
  { label: 'setup.manualAddress', action: 'manual', primary: false },
  { label: 'setup.cancel', action: 'cancel', primary: false }
], 'servers stage must expose scan, manual, and return actions');

presentation.serverDiscoveryActive = true;
presentation.ownerToken = '';
view.render({ stage: 'servers', focusIndex: 0, servers: [], profiles: [], returnView: '' });
assert.strictEqual(scanCalls[scanCalls.length - 1], 'start', 'empty active discovery must start the scan indicator');
assert.strictEqual(actions()[2].label, 'setup.findAccountServers', 'empty discovery must describe the account-server fallback even before login');
assert.strictEqual(actions()[2].action, 'login-servers', 'anonymous account-server fallback must start Plex login');
presentation.serverDiscoveryActive = false;
presentation.ownerToken = 'owner-token';
view.render({ stage: 'servers', focusIndex: 0, servers: [{ name: 'Plex', uri: 'https://plex.test' }], profiles: [] });
assert.strictEqual(scanCalls[scanCalls.length - 1], 'stop', 'servers with results must stop the scan indicator');

view.render({ stage: 'manual', focusIndex: 0, profiles: [], servers: [], returnView: 'settings' });
assert.strictEqual(nodes['setup-manual'].className, 'setup-manual', 'manual stage must reveal the address editor');
assert.strictEqual(nodes['setup-address'].value, presentation.manualAddress, 'manual stage must use injected presentation state');
assert.strictEqual(nodes['setup-address'].type, 'url', 'manual stage must configure a URL input');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['connect-manual', 'cancel'], 'manual stage must expose connect and cancel');

view.render({
  stage: 'connection-choice', focusIndex: 0, profiles: [], servers: [],
  selectedServer: { uri: 'http://local:32400' }, enteredConnectionUri: 'https://remote.test'
});
assert.deepStrictEqual(listText('setup-server-list'), ['setup.useLocalConnectionhttp://local:32400', 'setup.useEnteredConnectionhttps://remote.test'], 'connection choice must render both routes');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['manual'], 'connection choice must return to manual entry');

view.render({ stage: 'access', focusIndex: 0, profiles: [], servers: [], returnView: 'settings' });
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['offline', 'load-profiles', 'disconnect', 'cancel'], 'authenticated access must expose offline, profiles, disconnect, and cancel');

presentation.ownerToken = '';
view.render({ stage: 'access', focusIndex: 0, profiles: [], servers: [] });
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['offline', 'login', 'servers'], 'anonymous access must expose login and server navigation');

presentation.ownerToken = 'owner-token';
view.render({ stage: 'login', focusIndex: 1, profiles: [], servers: [], loginPurpose: 'servers', returnView: 'settings' });
assert.strictEqual(nodes['setup-code'].textContent, 'AB12', 'login stage must render the injected link code');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['offline', 'cancel'], 'active login must expose offline and cancel');
presentation.loginPin = null;
presentation.statusKey = 'setup.loginExpired';
view.render({ stage: 'login', focusIndex: 0, profiles: [], servers: [], loginPurpose: 'profiles' });
assert.strictEqual(nodes['setup-login-status'].textContent, 'setup.loginExpired', 'live authentication status must override the last controller snapshot');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['login', 'offline', 'access'], 'login retry must route according to login purpose');
presentation.statusKey = '';

presentation.loginPin = null;
view.render({
  stage: 'profiles', focusIndex: 1, profiles: [
    { id: 'profile-1', title: 'Alice', thumb: 'alice.jpg', protected: false },
    { id: 'profile-2', title: 'Bob', protected: true }
  ], servers: [], returnView: 'settings'
});
assert.strictEqual(nodes['setup-profile-list'].children[0].children[0].children[0].tagName, 'img', 'profiles must render avatar images when supplied');
assert.strictEqual(nodes['setup-profile-list'].children[1].children[0].children[0].textContent, 'B', 'profiles must render an initial when no avatar exists');
assert.strictEqual(nodes['setup-profile-list'].children[1].className, 'setup-option is-active', 'injected active profile must be marked');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['disconnect', 'offline', 'cancel'], 'profiles must expose account actions');

view.render({ stage: 'access', focusIndex: 0, profiles: [], servers: [] });
assert.strictEqual(nodes['setup-profile-list'].children.length, 0, 'changing setup stages must remove hidden profile buttons from the focus model');
assert.deepStrictEqual(focusCalls[focusCalls.length - 1], { index: 0, count: 4 }, 'stage focus counts must include only currently visible choices');

view.render({
  stage: 'profile-pin', focusIndex: 0, selectedProfile: { id: 'profile-2', title: 'Bob', protected: true },
  profilePinLength: 3, profiles: [], servers: []
});
assert.strictEqual(nodes['setup-address'].type, 'password', 'profile PIN must use a password input');
assert.strictEqual(nodes['setup-address'].value, '\u2022\u2022\u2022', 'profile PIN must mask only the controller snapshot length');
assert.strictEqual(nodes['setup-address'].maxLength, 4, 'profile PIN must retain the controller maximum');
assert.deepStrictEqual(actions().map(function (item) { return item.action; }), ['unlock-profile', 'offline', 'profiles'], 'profile PIN must expose unlock, offline, and back');
assert.strictEqual(focusCalls[focusCalls.length - 1].index, 0, 'profile PIN must delegate its focus index');

console.log('Setup view checks passed');
