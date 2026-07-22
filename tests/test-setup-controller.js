'use strict';

var assert = require('assert');
var SetupController = require('../app/setup-controller');

function abortable() {
  return { aborted: false, abort: function () { this.aborted = true; } };
}

var renders = [];
var scans = [];
var probes = [];
var accountLoads = [];
var profileLoads = [];
var profileSwitches = [];
var selectedConnections = [];
var selectedLanguages = [];
var logins = [];
var offline = [];
var finished = [];
var cancelled = [];
var disconnected = 0;
var serverSession = { cancelled: 0, cancel: function () { this.cancelled += 1; } };
var authSession = { cancelled: 0, cancel: function () { this.cancelled += 1; } };
var controller = SetupController.create({
  render: function (snapshot) { renders.push(snapshot); },
  serverSession: serverSession,
  authSession: authSession,
  scan: function (snapshot, callback) {
    var request = abortable();
    scans.push({ snapshot: snapshot, callback: callback, request: request });
    return request;
  },
  normalizeManualAddress: function (value) {
    return value === 'plex.example.test' ? 'https://plex.example.test' : '';
  },
  probeManualAddress: function (uri, callback) {
    var request = abortable();
    probes.push({ uri: uri, callback: callback, request: request });
    return request;
  },
  shouldOfferConnection: function (localUri, enteredUri) {
    return localUri === 'http://192.168.1.20:32400' && enteredUri === 'https://plex.example.test';
  },
  selectServerConnection: function (server, uri) { selectedConnections.push({ server: server, uri: uri }); },
  selectLanguage: function (language) { selectedLanguages.push(language); },
  beginLogin: function (purpose, callback) {
    var request = abortable();
    logins.push({ purpose: purpose, callback: callback, request: request });
    return request;
  },
  loadAccountServers: function (token, callback) {
    var request = abortable();
    accountLoads.push({ token: token, callback: callback, request: request });
    return request;
  },
  loadProfiles: function (token, callback) {
    var request = abortable();
    profileLoads.push({ token: token, callback: callback, request: request });
    return request;
  },
  switchProfile: function (profile, pin, callback) {
    var request = abortable();
    profileSwitches.push({ profile: profile, pin: pin, callback: callback, request: request });
    return request;
  },
  continueOffline: function (snapshot) { offline.push(snapshot); },
  disconnect: function () { disconnected += 1; },
  finish: function (snapshot) { finished.push(snapshot); },
  cancel: function (snapshot) { cancelled.push(snapshot); }
});

var localServer = {
  name: 'Local Plex',
  uri: 'http://192.168.1.20:32400',
  machineIdentifier: 'machine-local'
};
var protectedProfile = { id: 'profile-1', title: 'Protected', protected: true };
var openSnapshot;

openSnapshot = controller.open({ firstRun: true, servers: [localServer] });
assert.strictEqual(openSnapshot.stage, 'language', 'first-run setup must start with language selection');
assert.strictEqual(openSnapshot.focusIndex, 0, 'first-run language selection must focus its first option');
assert.strictEqual(scans.length, 0, 'first-run language selection must not scan before a language is chosen');

controller.activate('language', 'en');
assert.deepStrictEqual(selectedLanguages, ['en'], 'language selection must be persisted through the injected adapter');
assert.strictEqual(controller.snapshot().stage, 'servers', 'choosing a language must advance to server discovery');
assert.strictEqual(scans.length, 1, 'choosing a language must start discovery');
controller.setFocus(8, 3);
assert.strictEqual(controller.snapshot().focusIndex, 2, 'setup pointer focus must clamp inside the controller-owned button range');
controller.moveFocus(-1, 3);
assert.strictEqual(controller.snapshot().focusIndex, 1, 'setup remote movement must continue from the controller-owned focus');
scans[0].callback(null, [localServer]);
assert.strictEqual(controller.snapshot().servers.length, 1, 'completed discovery must retain discovered servers');

controller.open({ stage: 'manual', scan: false, languageExplicit: true, servers: [localServer] });
assert.strictEqual(controller.snapshot().stage, 'manual', 'settings may open setup directly on manual server entry');
assert.strictEqual(scans.length, 1, 'direct setup stages must not start an unrelated discovery scan');
controller.open({ stage: 'profiles', scan: false, languageExplicit: true, profiles: [{ id: 'a' }, { id: 'b' }], servers: [localServer], focusIndex: 1 });
assert.strictEqual(controller.snapshot().focusIndex, 1, 'setup open must preserve the coordinator-selected active language or profile focus');
controller.activate('servers');
assert.strictEqual(controller.snapshot().stage, 'servers', 'explicit server navigation must return to the server stage');

controller.activate('manual');
assert.strictEqual(controller.snapshot().stage, 'manual', 'manual server entry must have its own stage');
controller.activate('connect-manual', { address: 'plex.example.test' });
assert.strictEqual(probes.length, 1, 'a normalized manual address must be probed once');
controller.back();
probes[0].callback(null, { uri: 'https://plex.example.test', machineIdentifier: 'machine-local' });
assert.strictEqual(controller.snapshot().stage, 'servers', 'a stale manual probe must not reopen setup after Back');

controller.activate('manual');
controller.activate('connect-manual', { address: 'plex.example.test' });
probes[1].callback(null, { uri: 'https://plex.example.test', machineIdentifier: 'machine-local' });
assert.strictEqual(controller.snapshot().stage, 'connection-choice', 'a remote address matching a local server must offer a connection choice');
assert.strictEqual(controller.snapshot().selectedServer.uri, localServer.uri, 'connection choice must retain the matching local server');
controller.activate('use-entered-connection');
assert.strictEqual(controller.snapshot().stage, 'access', 'choosing a route must advance to access selection');
assert.strictEqual(controller.snapshot().preferredConnectionUri, 'https://plex.example.test', 'entered connection must become preferred when selected');
assert.strictEqual(selectedConnections.length, 1, 'connection selection must be delegated to the injected adapter');

controller.activate('offline');
assert.strictEqual(offline.length, 1, 'offline setup must delegate persistence to its adapter');
assert.strictEqual(finished.length, 1, 'offline setup must finish exactly once');

controller.open({ languageExplicit: true, servers: [localServer] });
controller.activate('select-server', localServer);
controller.activate('login-servers');
assert.strictEqual(controller.snapshot().stage, 'login', 'server discovery login must show the login stage');
assert.strictEqual(controller.snapshot().loginPurpose, 'servers', 'server discovery login must retain its routing purpose');
logins[0].callback(null, { token: 'owner-token' });
assert.strictEqual(accountLoads.length, 1, 'server discovery login must load account servers after authentication');
accountLoads[0].callback(null, [{ name: 'Remote Plex', uri: 'https://remote.example.test' }]);
assert.strictEqual(controller.snapshot().stage, 'servers', 'account server results must return to server selection');
assert.strictEqual(controller.snapshot().servers.length, 2, 'account servers must merge with local servers');

controller.activate('select-server', localServer);
controller.activate('login');
assert.strictEqual(controller.snapshot().loginPurpose, 'profiles', 'normal login must route authentication to profiles');
logins[1].callback(null, { token: 'owner-profile-token' });
assert.strictEqual(profileLoads.length, 1, 'profile login must load Plex Home profiles after authentication');
profileLoads[0].callback(null, [protectedProfile]);
assert.strictEqual(controller.snapshot().stage, 'profiles', 'loaded Plex Home profiles must be selectable');
controller.activate('select-profile', protectedProfile);
assert.strictEqual(controller.snapshot().stage, 'profile-pin', 'a protected profile must require its PIN before switching');
assert.strictEqual(profileSwitches.length, 0, 'a protected profile must not switch without an explicit PIN');
assert.strictEqual(controller.inputDigit(49), true, 'profile PIN input must accept top-row numeric key codes');
assert.strictEqual(controller.inputDigit(98), true, 'profile PIN input must accept numeric keypad key codes');
assert.strictEqual(controller.snapshot().profilePinLength, 2, 'numeric input must remain inside controller-owned profile PIN state');
assert.strictEqual(Object.prototype.hasOwnProperty.call(controller.snapshot(), 'profilePin'), false, 'render snapshots must not expose the protected profile PIN');
assert.strictEqual(controller.backspace(), true, 'profile PIN input must expose explicit backspace support');
assert.strictEqual(controller.snapshot().profilePinLength, 1, 'backspace must remove only the most recent PIN digit');
controller.inputDigit('2');
controller.inputDigit(51);
controller.inputDigit(100);
assert.strictEqual(controller.snapshot().profilePinLength, 4, 'profile PIN input must support mixed explicit and remote key sources');
controller.activate('unlock-profile');
assert.strictEqual(controller.snapshot().profileBusy, true, 'profile switching must publish a busy state');
assert.strictEqual(profileSwitches.length, 1, 'unlocking a protected profile must delegate the PIN switch');
assert.strictEqual(profileSwitches[0].pin, '1234', 'unlocking must use the controller-owned PIN rather than native text input');
profileSwitches[0].callback(null, { id: 'profile-1', token: 'profile-token' });
assert.strictEqual(finished.length, 2, 'a successful profile switch must finish setup');

controller.open({ stage: 'profiles', scan: false, languageExplicit: true, profiles: [protectedProfile], servers: [localServer] });
controller.activate('disconnect');
assert.strictEqual(disconnected, 1, 'disconnect must delegate credential removal exactly once');
assert.strictEqual(finished.length, 3, 'disconnect must leave setup through the same completion path as offline access');

controller.open({ languageExplicit: true, servers: [localServer] });
controller.activate('select-server', localServer);
controller.activate('login');
assert.strictEqual(controller.back().stage, 'access', 'Back from login must return to access selection');
assert.strictEqual(logins[2].request.aborted, true, 'Back from login must abort the active login request');
controller.activate('load-profiles', { token: 'owner-token' });
assert.strictEqual(controller.snapshot().stage, 'profiles', 'loading profiles directly must enter profile selection');
assert.strictEqual(controller.back().stage, 'access', 'Back from profiles must return to access selection');
controller.activate('manual');
assert.strictEqual(controller.back().stage, 'servers', 'Back from manual entry must return to server selection');

controller.open({ languageExplicit: true, servers: [localServer] });
controller.activate('select-server', localServer);
controller.activate('login-servers');
logins[3].callback(null, { token: 'stale-account-token' });
controller.back();
accountLoads[1].callback(null, [{ name: 'Stale account server', uri: 'https://stale.example.test' }]);
assert.strictEqual(controller.snapshot().servers.length, 1, 'stale account-server callbacks must not mutate setup after Back');

controller.open({ languageExplicit: true, servers: [localServer] });
controller.activate('select-server', localServer);
controller.activate('load-profiles', { token: 'stale-profile-token' });
controller.back();
profileLoads[2].callback(null, [{ id: 'stale-profile', title: 'Stale' }]);
assert.strictEqual(controller.snapshot().stage, 'access', 'stale profile callbacks must not reopen profile selection after Back');

controller.open({
  stage: 'profiles', scan: false, languageExplicit: true, servers: [localServer], focusIndex: 4,
  profiles: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
});
controller.activate('load-profiles', { token: 'failing-profile-token' });
profileLoads[profileLoads.length - 1].callback(new Error('offline'));
assert.strictEqual(controller.snapshot().profiles.length, 0, 'failed profile refreshes must clear unavailable cloud results');
assert.strictEqual(controller.snapshot().focusIndex, 0, 'failed profile refreshes must clamp stale focus to the remaining setup actions');

controller.open({
  stage: 'profiles', scan: false, languageExplicit: true, servers: [localServer], focusIndex: 6,
  profiles: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
});
controller.activate('load-profiles', { token: 'shrinking-profile-token' });
profileLoads[profileLoads.length - 1].callback(null, [{ id: 'a' }, { id: 'b' }]);
assert.strictEqual(controller.snapshot().focusIndex, 3, 'profile refreshes must preserve the selected account action when the profile list changes');

controller.activate('manual');
controller.activate('connect-manual', { address: 'plex.example.test' });
controller.destroy();
assert.strictEqual(probes[2].request.aborted, true, 'destroy must abort an in-flight manual probe');
assert.strictEqual(serverSession.cancelled > 0, true, 'destroy must cancel the server session');
assert.strictEqual(authSession.cancelled > 0, true, 'destroy must cancel the authentication session');
probes[2].callback(null, { uri: 'https://plex.example.test' });
assert.strictEqual(controller.snapshot().destroyed, true, 'destroyed controllers must remain inert after stale callbacks');
assert.ok(renders.length > 10, 'each state transition must publish a renderer snapshot');

console.log('Setup controller checks passed');
