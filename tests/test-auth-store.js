'use strict';

var assert = require('assert');
var AuthStore = require('../shell/auth-store');

var empty = AuthStore.emptyState();
assert.deepStrictEqual(empty, {
  version: 1,
  setupComplete: false,
  mode: 'offline',
  ownerToken: '',
  activeProfileId: '',
  profiles: []
}, 'fresh installs must remain offline and require onboarding');

var savedValue = '';
var storage = {
  getItem: function () { return savedValue; },
  setItem: function (key, value) { savedValue = value; }
};
var saved = AuthStore.save(storage, {
  setupComplete: true,
  mode: 'plex',
  ownerToken: 'owner-token',
  activeProfileId: '42',
  profiles: [
    { id: '42', title: 'Living Room', token: 'profile-token', protected: true, thumb: 'https://example/avatar' },
    { id: '42', title: 'Duplicate', token: '', protected: false }
  ]
});
assert.strictEqual(saved.profiles.length, 1, 'profiles must deduplicate by Plex user id');
assert.strictEqual(AuthStore.activeToken(saved), 'profile-token', 'the active Plex profile token must be available without internet');
assert.deepStrictEqual(AuthStore.load(storage), saved, 'authenticated profile state must survive a restart');
assert.strictEqual(AuthStore.needsOnboarding({ activeUri: '' }, empty), true, 'a clean install must open onboarding');
assert.strictEqual(AuthStore.needsOnboarding({ activeUri: 'http://plex:32400' }, empty), false, 'existing installations must migrate without being forced through onboarding');
assert.strictEqual(AuthStore.activeToken(AuthStore.validate({ mode: 'plex', activeProfileId: 'missing', profiles: [] })), '', 'missing cached profiles must fail safely');

var cachedProfiles = [
  { id: 'owner', title: 'Owner', token: 'owner-profile-token' },
  { id: 'guest', title: 'Guest', token: 'guest-profile-token' }
];
assert.deepStrictEqual(
  AuthStore.mergeProfiles(cachedProfiles, []),
  AuthStore.validate({ profiles: cachedProfiles }).profiles,
  'an empty cloud refresh must preserve profiles cached for offline switching'
);

var identityMerged = AuthStore.mergeProfiles(
  [{ id: 'owner-uuid', uuid: 'owner-uuid', title: 'Owner', token: 'cached-token' }],
  [{ id: '1', uuid: 'owner-uuid', title: 'Owner', token: '' }]
);
assert.strictEqual(identityMerged.length, 1, 'numeric Plex Home ids and cached UUIDs must identify the same profile');
assert.strictEqual(identityMerged[0].id, '1', 'fresh Plex Home ids must remain usable for profile switching');
assert.strictEqual(identityMerged[0].token, 'cached-token', 'identity reconciliation must retain the cached offline token');
assert.strictEqual(AuthStore.sameProfile(identityMerged[0], { id: 'owner-uuid', uuid: 'owner-uuid' }), true, 'profile identity must match across id and UUID representations');

var serverScoped = AuthStore.validate({
  mode: 'plex', activeProfileId: 'owner',
  profiles: [{ id: 'owner', token: 'server-token', accountToken: 'account-token', serverMachineIdentifier: 'server-a', serverConnectionUri: 'https://plex.example' }]
});
assert.strictEqual(AuthStore.activeToken(serverScoped, 'server-a'), 'server-token', 'cached profile access must work for its resolved server');
assert.strictEqual(AuthStore.activeToken(serverScoped, 'server-b'), '', 'a server-specific profile token must never leak to another server');
assert.strictEqual(AuthStore.activeProfile(serverScoped).serverConnectionUri, 'https://plex.example', 'the authenticated server connection must remain available offline');
var failedOverProfile = AuthStore.setActiveProfileConnection(serverScoped, 'server-a', 'http://192.168.50.10:32400');
assert.strictEqual(AuthStore.activeProfile(failedOverProfile).serverConnectionUri, 'http://192.168.50.10:32400', 'automatic failover must persist the verified endpoint for the active profile');
assert.strictEqual(
  AuthStore.activeProfile(AuthStore.setActiveProfileConnection(serverScoped, 'server-b', 'http://192.168.50.20:32400')).serverConnectionUri,
  'https://plex.example',
  'a failover endpoint must never be written to a profile scoped to another Plex server'
);

var disconnected = AuthStore.disconnect(saved);
assert.strictEqual(disconnected.setupComplete, true, 'disconnecting must keep local setup complete');
assert.strictEqual(disconnected.mode, 'offline', 'disconnecting must return to local access');
assert.strictEqual(disconnected.ownerToken, '', 'disconnecting must remove the Plex owner token');
assert.strictEqual(disconnected.activeProfileId, '', 'disconnecting must clear the active viewing profile');
assert.deepStrictEqual(disconnected.profiles, [], 'disconnecting must remove cached profile credentials');

savedValue = '{broken';
assert.deepStrictEqual(AuthStore.load(storage), empty, 'corrupt auth state must fail to offline onboarding');

console.log('Auth store checks passed');
