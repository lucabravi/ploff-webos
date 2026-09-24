'use strict';

var assert = require('assert');
var Auth = require('../app/plex-auth');
var Xhr = require('./helpers/controlled-xhr');

var supportedSurface = [
  'accountServersFromJson', 'clientIdentifier', 'createPin',
  'findReachableConnection', 'homeUsersFromXml', 'loadAccountServers', 'loadHomeUsers',
  'loadServerAccess', 'pinFromXml', 'pollPin', 'profileTokenFromXml',
  'serverAccessFromJson', 'switchHomeUser'
];
assert.deepStrictEqual(Object.keys(Auth).sort(), supportedSurface.sort(),
  'Auth must not publish the obsolete local-token fallback; supported routes require Plex resource access');

var transport = Xhr.create();
var completions = 0;
var operation = Auth.findReachableConnection(transport.root, 'fixture-server-token', [
  'https://first.plex.example', 'https://second.plex.example'
], 'trusted-server', {}, function () { completions += 1; });
assert.strictEqual(transport.requests[0].headers['X-Plex-Token'], undefined,
  'identity probes must not expose a credential');
transport.respond(0, '<MediaContainer machineIdentifier="foreign-server"/>');
assert.strictEqual(completions, 0, 'a responding but mismatched server must not complete access');
assert.strictEqual(transport.requests.length, 2, 'a mismatched identity must advance to the next approved candidate');
var lateReady = transport.requests[1].onreadystatechange;
var lateError = transport.requests[1].onerror;
operation.abort();
operation.abort();
assert.strictEqual(transport.requests[1].abortCount, 1, 'cancellation must reach the current candidate exactly once');
transport.requests[1].status = 200;
transport.requests[1].readyState = 4;
transport.requests[1].responseText = '<MediaContainer machineIdentifier="trusted-server"/>';
lateReady();
lateError();
assert.strictEqual(completions, 0, 'cancelled authenticated-route selection must ignore retained callbacks');
assert.strictEqual(transport.requests[1].onreadystatechange, null);
assert.strictEqual(transport.requests[1].onerror, null);
assert.strictEqual(transport.requests[1].headers['X-Plex-Token'], undefined);

console.log('Plex Auth public surface and approved-route cancellation checks passed');
