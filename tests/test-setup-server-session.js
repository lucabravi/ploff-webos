'use strict';

var assert = require('assert');
var SetupServerSession = require('../app/setup-server-session');

var callbacks = [];
var changes = [];
var session = SetupServerSession.create({
  discover: function (callback) { callbacks.push(callback); },
  merge: function (current, discovered) { return current.concat(discovered); },
  onChange: function (snapshot) { changes.push(snapshot); }
});

session.start([{ uri: 'http://saved' }]);
assert.strictEqual(session.snapshot().active, true, 'starting discovery must publish an active session');
assert.strictEqual(callbacks.length, 1, 'starting discovery must call the adapter once');

session.start([{ uri: 'http://newer' }]);
assert.strictEqual(callbacks.length, 1, 'an active discovery must not be started twice');

callbacks[0]([{ uri: 'http://local' }]);
assert.deepStrictEqual(session.snapshot(), {
  active: false,
  servers: [{ uri: 'http://saved' }, { uri: 'http://local' }],
  found: true
}, 'the current discovery result must merge and publish once');

session.start(session.snapshot().servers);
assert.strictEqual(callbacks.length, 2, 'a completed discovery may be restarted');
session.cancel();
callbacks[1]([{ uri: 'http://stale' }]);
assert.deepStrictEqual(session.snapshot().servers, [{ uri: 'http://saved' }, { uri: 'http://local' }], 'cancelled callbacks must not mutate the latest server list');
assert.strictEqual(session.snapshot().active, false, 'cancelling must leave the session inactive');

assert.ok(changes.length >= 4, 'lifecycle changes must be observable by the view controller');
console.log('Setup server session checks passed');
