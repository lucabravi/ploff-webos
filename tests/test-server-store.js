'use strict';

var assert = require('assert');
var ServerStore = require('../app/server-store');

var configured = ServerStore.fromConfig({ apiBaseUrl: 'http://192.168.50.10:32400/', serverName: 'Living Room' });
assert.deepStrictEqual(configured, {
  name: 'Living Room',
  uri: 'http://192.168.50.10:32400',
  machineIdentifier: '',
  version: '',
  source: 'config'
}, 'configured servers must normalize their URL without storing credentials');

var merged = ServerStore.merge([
  configured,
  { name: 'Duplicate', uri: 'http://192.168.50.10:32400', machineIdentifier: 'machine-a', source: 'gdm' }
], [
  {
    name: 'Bedroom', uri: 'http://192.168.0.8:32400', machineIdentifier: 'machine-b', version: '1.0', source: 'plex',
    owned: false, connections: ['http://192.168.0.8:32400', 'https://bedroom.example']
  }
]);
assert.strictEqual(merged.length, 2, 'servers must deduplicate by machine identifier or normalized URI');
assert.strictEqual(merged[0].machineIdentifier, 'machine-a', 'discovery metadata must enrich configured servers');
assert.strictEqual(merged[1].name, 'Bedroom', 'newly discovered servers must be retained');
assert.deepStrictEqual(merged[1].connections, ['http://192.168.0.8:32400', 'https://bedroom.example'], 'account server connections must survive normalization and persistence');
assert.strictEqual(merged[1].owned, false, 'shared account servers must remain identifiable');

var alternateConnection = ServerStore.merge([
  { name: 'Home Plex', uri: 'http://192.0.2.10:32400', machineIdentifier: 'same-server', source: 'gdm' }
], [
  { name: 'Home Plex', uri: 'https://plex.example', machineIdentifier: 'same-server', source: 'manual' }
]);
assert.strictEqual(alternateConnection.length, 2, 'an untrusted GDM identity must not merge its URL into a manually trusted server');

var accountConnections = ServerStore.merge([
  { name: 'Home Plex', uri: 'https://plex.example', machineIdentifier: 'same-server', source: 'plex', connections: ['https://plex.example'] }
], [
  { name: 'Home Plex', uri: 'https://relay.plex.tv', machineIdentifier: 'same-server', source: 'plex', connections: ['https://relay.plex.tv'] }
]);
assert.strictEqual(accountConnections.length, 1, 'connections returned by Plex may merge by server identity');
assert.deepStrictEqual(accountConnections[0].connections, ['https://plex.example', 'https://relay.plex.tv'], 'trusted Plex resource routes must remain available for failover');
assert.deepStrictEqual(ServerStore.connectionUris({
  uri: 'http://192.0.2.10:32400',
  connections: ['http://192.0.2.10:32400/', 'https://plex.example', 'https://plex.example/']
}), [
  'http://192.0.2.10:32400',
  'https://plex.example'
], 'server connection URLs must be normalized and deduplicated for display');
var promoted = ServerStore.preferConnection(accountConnections[0], 'https://relay.plex.tv/');
assert.strictEqual(promoted.uri, 'https://relay.plex.tv', 'a verified failover endpoint must become the preferred server URL');
assert.deepStrictEqual(promoted.connections, [
  'https://relay.plex.tv',
  'https://plex.example'
], 'promoting an endpoint must retain every alternate route without duplicates');
var backgroundLinked = ServerStore.withRemoteConnections({
  name: 'Home Plex',
  uri: 'http://192.168.50.10:32400',
  machineIdentifier: 'machine-a',
  source: 'gdm'
}, ['https://plex.example', 'https://relay.plex.tv'], 'linked', 1234);
assert.strictEqual(backgroundLinked.uri, 'http://192.168.50.10:32400', 'background account linking must keep the LAN route primary');
assert.deepStrictEqual(backgroundLinked.connections, [
  'http://192.168.50.10:32400',
  'https://plex.example',
  'https://relay.plex.tv'
], 'background account linking must persist every trusted Plex route');
assert.strictEqual(backgroundLinked.remoteLinkStatus, 'linked', 'background account linking must persist its result');
assert.strictEqual(backgroundLinked.remoteLinkCheckedAt, 1234, 'background account linking must persist its last check time');

var storageValue = null;
var storage = {
  getItem: function () { return storageValue; },
  setItem: function (key, value) { storageValue = value; }
};
var saved = ServerStore.save(storage, merged, 'http://192.168.0.8:32400/');
assert.strictEqual(saved.activeUri, 'http://192.168.0.8:32400', 'active server URLs must normalize before persistence');
assert.deepStrictEqual(ServerStore.load(storage), saved, 'server state must round-trip through localStorage');
storageValue = '{broken';
assert.deepStrictEqual(ServerStore.load(storage), { version: 1, activeUri: '', servers: [] }, 'invalid server state must fail closed');

console.log('Server store checks passed');
