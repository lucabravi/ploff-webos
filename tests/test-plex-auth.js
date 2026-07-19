'use strict';

var assert = require('assert');
var PlexAuth = require('../shell/plex-auth');

var pin = PlexAuth.pinFromXml('<pin id="123" code="ABCD" expiresIn="900" authToken="" />');
assert.deepStrictEqual(pin, { id: '123', code: 'ABCD', expiresIn: 900, token: '' }, 'PIN creation responses must be portable XML');
assert.strictEqual(PlexAuth.pinFromXml('<pin id="123" code="ABCD" authToken="profile-token" />').token, 'profile-token', 'polling must expose the completed token');

var users = PlexAuth.homeUsersFromXml([
  '<MediaContainer>',
  '<User id="1" uuid="owner" title="Owner" username="owner" protected="0" thumb="https://example/owner" />',
  '<User id="2" uuid="child" title="Child" protected="1" thumb="https://example/child" />',
  '</MediaContainer>'
].join(''));
assert.strictEqual(users.length, 2, 'all Plex Home users must be parsed');
assert.deepStrictEqual(users[1], { id: '2', uuid: 'child', title: 'Child', protected: true, thumb: 'https://example/child', token: '' }, 'profile metadata must remain tokenless until switched');
assert.strictEqual(PlexAuth.profileTokenFromXml('<user authenticationToken="switched-token" />'), 'switched-token', 'home-user switching must parse its dedicated token');
assert.deepStrictEqual(PlexAuth.serverAccessFromJson(JSON.stringify([
  { clientIdentifier: 'other', accessToken: 'wrong' },
  { clientIdentifier: 'server-id', accessToken: 'server-token', connections: [{ uri: 'https://plex.example' }] }
]), 'server-id'), { token: 'server-token', connections: ['https://plex.example'] }, 'managed profile tokens must be exchanged for server-specific access');

var accountServers = PlexAuth.accountServersFromJson(JSON.stringify([
  { name: 'Player', provides: 'client', clientIdentifier: 'client-id', connections: [{ uri: 'https://player.example' }] },
  {
    name: 'Remote Plex', product: 'Plex Media Server', provides: 'server', clientIdentifier: 'server-id',
    version: '1.41.0', owned: false, accessToken: 'resource-token', connections: [
      { uri: 'https://relay.plex.tv', relay: true, local: false },
      { uri: 'https://plex.example', relay: false, local: false },
      { uri: 'http://192.0.2.10:32400', relay: false, local: true }
    ]
  }
]));
assert.deepStrictEqual(accountServers, [{
  name: 'Remote Plex',
  uri: 'http://192.0.2.10:32400',
  machineIdentifier: 'server-id',
  version: '1.41.0',
  source: 'plex',
  owned: false,
  connections: ['http://192.0.2.10:32400', 'https://plex.example', 'https://relay.plex.tv']
}], 'account discovery must keep only Plex servers and prefer local, direct remote, then Relay connections');

var requests = [];
function FakeXHR() { requests.push(this); this.headers = {}; }
FakeXHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
FakeXHR.prototype.setRequestHeader = function (name, value) { this.headers[name] = value; };
FakeXHR.prototype.send = function () {};
FakeXHR.prototype.abort = function () { this.aborted = true; };

var root = { XMLHttpRequest: FakeXHR };
var callbackError = null;
PlexAuth.createPin(root, { clientIdentifier: 'client-id', timeout: 2500 }, function (error) { callbackError = error; });
assert.strictEqual(requests[0].method, 'POST', 'PIN login must begin with a POST');
assert.ok(/\/api\/v2\/pins$/.test(requests[0].url), 'PIN login must use the Plex v2 endpoint');
assert.strictEqual(requests[0].timeout, 2500, 'all internet requests must have a bounded timeout');
assert.strictEqual(requests[0].headers['X-Plex-Client-Identifier'], 'client-id', 'PIN requests must keep a stable device identifier');
requests[0].ontimeout();
assert.ok(callbackError instanceof Error, 'internet timeout must return an error instead of throwing');

requests = [];
var cancelledAuthCallbacks = 0;
var cancelledAuth = PlexAuth.createPin(root, { clientIdentifier: 'client-id', timeout: 2500 }, function () { cancelledAuthCallbacks += 1; });
requests[0].abort = function () {
  this.aborted = true;
  this.status = 0;
  this.readyState = 4;
  if (this.onreadystatechange) { this.onreadystatechange(); }
};
cancelledAuth.abort();
assert.strictEqual(requests[0].aborted, true, 'authentication requests must remain abortable');
assert.strictEqual(cancelledAuthCallbacks, 0, 'intentionally cancelled authentication must not publish a stale failure');

var deferredAuthFailure = null;
var immediateAuthCallbacks = 0;
var failingRoot = {
  setTimeout: function (callback) { deferredAuthFailure = callback; return 1; },
  XMLHttpRequest: function () {
    this.open = function () { throw new Error('invalid endpoint'); };
    this.abort = function () {};
  }
};
PlexAuth.createPin(failingRoot, { clientIdentifier: 'client-id' }, function () { immediateAuthCallbacks += 1; });
assert.strictEqual(immediateAuthCallbacks, 0, 'synchronous authentication failures must not race setup state');
deferredAuthFailure();
assert.strictEqual(immediateAuthCallbacks, 1, 'synchronous authentication failures must complete asynchronously');

requests = [];
var switchedToken = '';
PlexAuth.switchHomeUser(root, 'owner-token', { id: '2' }, '1234', { clientIdentifier: 'client-id', timeout: 3000 }, function (error, token) {
  assert.ifError(error);
  switchedToken = token;
});
assert.strictEqual(requests[0].method, 'POST', 'profile switching must use POST');
assert.ok(/\/api\/home\/users\/2\/switch\?pin=1234$/.test(requests[0].url), 'protected profile PINs must be URL encoded');
requests[0].status = 200;
requests[0].responseText = '<user authenticationToken="cached-profile-token" />';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(switchedToken, 'cached-profile-token', 'successful switching must return a cacheable profile token');

requests = [];
var serverAccess = null;
PlexAuth.loadServerAccess(root, 'account-token', 'server-id', { clientIdentifier: 'client-id', timeout: 3000 }, function (error, access) {
  assert.ifError(error);
  serverAccess = access;
});
assert.ok(/\/api\/v2\/resources\?includeHttps=1&includeRelay=1$/.test(requests[0].url), 'profile switching must resolve the selected server through Plex resources');
assert.strictEqual(requests[0].headers.Accept, 'application/json', 'server access resources must explicitly request JSON from Plex');
requests[0].status = 200;
requests[0].responseText = '[{"clientIdentifier":"server-id","accessToken":"server-token","connections":[]}]';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(serverAccess.token, 'server-token', 'resource exchange must return the server-specific token');

requests = [];
var loadedAccountServers = null;
PlexAuth.loadAccountServers(root, 'account-token', { clientIdentifier: 'client-id', timeout: 3000 }, function (error, servers) {
  assert.ifError(error);
  loadedAccountServers = servers;
});
assert.ok(/\/api\/v2\/resources\?includeHttps=1&includeRelay=1$/.test(requests[0].url), 'account server discovery must use the Plex resources endpoint');
assert.strictEqual(requests[0].headers.Accept, 'application/json', 'account server discovery must explicitly request JSON from Plex');
requests[0].status = 200;
requests[0].responseText = '[{"name":"Cloud Plex","provides":"server","clientIdentifier":"cloud-id","connections":[{"uri":"https://plex.example"}]}]';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(loadedAccountServers[0].machineIdentifier, 'cloud-id', 'account discovery must expose selectable remote server identities');

requests = [];
var reachableConnection = '';
PlexAuth.findReachableConnection(root, 'server-token', [
  'https://unreachable.example',
  'https://plex.example.com'
], 'server-id', { clientIdentifier: 'client-id', timeout: 3000 }, function (error, uri) {
  assert.ifError(error);
  reachableConnection = uri;
});
assert.strictEqual(requests[0].url, 'https://unreachable.example/identity', 'connection probing must start with the preferred server endpoint');
assert.strictEqual(requests[0].headers['X-Plex-Token'], undefined, 'identity probes must never disclose a token');
requests[0].status = 503;
requests[0].responseText = '';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(requests[1].url, 'https://plex.example.com/identity', 'connection probing must continue after a failed endpoint');
assert.strictEqual(requests[1].headers['X-Plex-Token'], undefined, 'reachable identity probes must remain unauthenticated');
requests[1].status = 200;
requests[1].responseText = '<MediaContainer machineIdentifier="server-id" />';
requests[1].readyState = 4;
requests[1].onreadystatechange();
assert.strictEqual(reachableConnection, 'https://plex.example.com', 'the first reachable account connection must be returned for caching');

requests = [];
var spoofingError = null;
PlexAuth.findReachableConnection(root, 'server-token', ['http://192.0.2.44:32400'], 'trusted-server', { clientIdentifier: 'client-id' }, function (error) {
  spoofingError = error;
});
requests[0].status = 200;
requests[0].responseText = '<MediaContainer machineIdentifier="spoofed-server" />';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.ok(spoofingError instanceof Error, 'a reachable endpoint claiming another server identity must be rejected');
assert.strictEqual(requests[0].headers['X-Plex-Token'], undefined, 'a spoofed LAN identity must never receive the server token');

requests = [];
var localServerAccess = null;
PlexAuth.loadLocalServerAccess(root, 'profile-token', {
  uri: 'http://192.168.50.10:32400/',
  machineIdentifier: 'server-id'
}, { clientIdentifier: 'client-id', timeout: 3000 }, function (error, access) {
  assert.ifError(error);
  localServerAccess = access;
});
assert.strictEqual(requests[0].method, 'GET', 'local profile access must begin with a non-mutating identity check');
assert.strictEqual(requests[0].url, 'http://192.168.50.10:32400/identity', 'local profile access must verify the selected endpoint first');
assert.strictEqual(requests[0].headers['X-Plex-Token'], undefined, 'identity verification must not disclose the profile token');
requests[0].status = 200;
requests[0].responseText = '<MediaContainer machineIdentifier="server-id" />';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(requests[1].url, 'http://192.168.50.10:32400/library/sections', 'credentials may be sent only after identity verification');
assert.strictEqual(requests[1].headers['X-Plex-Token'], 'profile-token', 'the verified server may receive the switched profile token');
requests[1].status = 200;
requests[1].responseText = '<MediaContainer><Directory key="1" title="Film" /></MediaContainer>';
requests[1].readyState = 4;
requests[1].onreadystatechange();
assert.deepStrictEqual(localServerAccess, {
  token: 'profile-token',
  machineIdentifier: 'server-id',
  connectionUri: 'http://192.168.50.10:32400'
}, 'a reachable local server must retain the switched profile token and selected server identity');

console.log('Plex auth checks passed');
