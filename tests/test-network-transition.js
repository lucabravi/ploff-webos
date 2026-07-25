'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '../app/network-transition.js');

assert.ok(fs.existsSync(modulePath), 'network transition controller must exist');
var NetworkTransition = require(modulePath);

var resumedServers = [];
var activeServer = { machineIdentifier: 'server-a' };
var transition = NetworkTransition.create({ internetAvailable: false, lanAvailable: true }, function (server) {
  resumedServers.push(server.machineIdentifier);
});

var recovery = transition.update({ internetAvailable: null, lanAvailable: true }, activeServer);
assert.strictEqual(recovery.cloudRecovered, true, 'an explicit Internet loss must recover when availability becomes unknown');
assert.strictEqual(recovery.localWasAvailable, true, 'transition state must retain the previous local availability for shell recovery');
assert.deepStrictEqual(resumedServers, ['server-a'], 'Internet recovery must resume remote verification for the active server once');

recovery = transition.update({ internetAvailable: true, lanAvailable: true }, activeServer);
assert.strictEqual(recovery.cloudRecovered, false, 'unknown-to-available updates must not repeat the same recovery');
transition.update({ internetAvailable: null, lanAvailable: true }, activeServer);
transition.update({ internetAvailable: null, lanAvailable: true }, activeServer);
assert.deepStrictEqual(resumedServers, ['server-a'], 'repeated recovered and unknown snapshots must not duplicate remote verification resume');

console.log('Network transition checks passed');
