'use strict';

var assert = require('assert');
var SetupAuthSession = require('../app/setup-auth-session');

function Clock() {
  this.time = 1000;
  this.nextId = 1;
  this.timers = [];
}

Clock.prototype.now = function () { return this.time; };

Clock.prototype.setTimeout = function (callback, delay) {
  var timer = { id: this.nextId, callback: callback, delay: delay, due: this.time + delay, cleared: false };
  this.nextId += 1;
  this.timers.push(timer);
  return timer;
};

Clock.prototype.clearTimeout = function (timer) {
  if (timer) { timer.cleared = true; }
};

Clock.prototype.next = function () {
  var candidate = null;
  var index;
  for (index = 0; index < this.timers.length; index += 1) {
    if (!this.timers[index].cleared && (!candidate || this.timers[index].due < candidate.due)) {
      candidate = this.timers[index];
    }
  }
  return candidate;
};

Clock.prototype.advance = function (delay) {
  var timer;
  this.time += delay;
  while ((timer = this.next()) && timer.due <= this.time) {
    timer.cleared = true;
    timer.callback();
  }
};

var clock = new Clock();
var createCallbacks = [];
var pollCallbacks = [];
var states = [];
var authenticated = [];
var errors = [];
var requests = [];
var session = SetupAuthSession.create({
  root: clock,
  now: function () { return clock.now(); },
  createPin: function (purpose, callback) {
    createCallbacks.push({ purpose: purpose, callback: callback });
    var request = { aborted: false, abort: function () { this.aborted = true; } };
    requests.push(request);
    return request;
  },
  pollPin: function (pinId, callback) {
    pollCallbacks.push({ pinId: pinId, callback: callback });
    var request = { aborted: false, abort: function () { this.aborted = true; } };
    requests.push(request);
    return request;
  },
  onState: function (snapshot) { states.push(snapshot); },
  onAuthenticated: function (result, snapshot) { authenticated.push({ result: result, snapshot: snapshot }); },
  onError: function (error, snapshot) { errors.push({ error: error, snapshot: snapshot }); }
});

assert.strictEqual(session.isActive(), false, 'a fresh auth session must be inactive');
assert.deepStrictEqual(session.snapshot(), {
  active: false,
  phase: 'idle',
  purpose: '',
  generation: 0,
  pin: null,
  deadline: 0,
  error: ''
}, 'a fresh auth session must expose a safe idle snapshot');

assert.strictEqual(session.begin('profiles'), true, 'begin must start a new PIN session');
assert.strictEqual(session.isActive(), true, 'creating a PIN must make the session active');
assert.strictEqual(createCallbacks[0].purpose, 'profiles', 'begin must pass its purpose to the PIN adapter');
assert.strictEqual(session.snapshot().phase, 'creating', 'the session must publish its creation phase');

createCallbacks[0].callback(null, { id: 'pin-1', code: 'ABCD', expiresIn: 10, token: '' });
assert.strictEqual(session.snapshot().phase, 'waiting', 'a created PIN must enter the waiting phase');
assert.strictEqual(session.snapshot().deadline, 61000, 'the deadline must be at least sixty seconds');
assert.strictEqual(clock.next().delay, 1500, 'the first PIN poll must retain the 1500 ms delay');

clock.advance(1500);
assert.strictEqual(pollCallbacks.length, 1, 'the initial poll must call the polling adapter');
assert.strictEqual(pollCallbacks[0].pinId, 'pin-1', 'polling must use the created PIN id');
pollCallbacks[0].callback(null, { id: 'pin-1', code: 'ABCD', expiresIn: 10, token: '' });
assert.strictEqual(clock.next().delay, 2000, 'a pending PIN must poll again after two seconds');

clock.advance(2000);
pollCallbacks[1].callback(new Error('temporary network failure'));
assert.strictEqual(errors.length, 1, 'transient polling errors must be observable');
assert.strictEqual(session.isActive(), true, 'transient polling errors must keep the session active');
assert.strictEqual(clock.next().delay, 5000, 'transient polling errors must retry after five seconds');

clock.advance(5000);
pollCallbacks[2].callback(null, { id: 'pin-1', code: 'ABCD', expiresIn: 10, token: 'profile-token' });
assert.strictEqual(session.isActive(), false, 'an authenticated PIN must end the session');
assert.strictEqual(session.snapshot().phase, 'authenticated', 'authentication must publish a terminal phase');
assert.strictEqual(authenticated.length, 1, 'authentication must be delivered exactly once');
assert.strictEqual(authenticated[0].result.token, 'profile-token', 'the authenticated result must retain the token for its owner');
assert.strictEqual(authenticated[0].snapshot.pin.token, undefined, 'state snapshots must never expose the PIN auth token');

assert.strictEqual(session.begin('servers'), true, 'a completed session may be started again');
var staleCreate = createCallbacks[1].callback;
requests[4].abort = function () {
  this.aborted = true;
  staleCreate(null, { id: 'synchronously-stale', code: 'XXXX', expiresIn: 900, token: '' });
};
assert.strictEqual(session.begin('profiles'), true, 'begin must replace an active generation');
assert.strictEqual(requests[4].aborted, true, 'replacing a generation must abort its stale PIN request');
staleCreate(null, { id: 'stale', code: 'XXXX', expiresIn: 900, token: '' });
assert.strictEqual(createCallbacks.length, 3, 'the replacement generation must own a fresh PIN request');
assert.strictEqual(session.snapshot().pin, null, 'a stale PIN callback must not mutate the replacement generation');

createCallbacks[2].callback(null, { id: 'pin-2', code: 'EFGH', expiresIn: 900, token: '' });
clock.advance(1500);
assert.strictEqual(pollCallbacks.length, 4, 'the replacement generation must begin polling independently');
var stalePoll = pollCallbacks[3].callback;
session.cancel();
assert.strictEqual(session.isActive(), false, 'cancel must make the session inactive');
assert.strictEqual(session.snapshot().phase, 'idle', 'cancel must restore the idle phase');
assert.strictEqual(requests[6].aborted, true, 'cancel must abort an in-flight polling request');
stalePoll(null, { id: 'pin-2', code: 'EFGH', expiresIn: 900, token: 'stale-token' });
assert.strictEqual(authenticated.length, 1, 'cancelled polling callbacks must not authenticate');
assert.strictEqual(clock.timers.filter(function (timer) { return !timer.cleared; }).length, 0, 'cancel must clear all owned timers');

assert.strictEqual(session.begin('expiry'), true, 'expiry behavior must be testable in a fresh generation');
createCallbacks[3].callback(null, { id: 'pin-3', code: 'IJKL', expiresIn: 1, token: '' });
clock.time = session.snapshot().deadline;
clock.advance(0);
assert.strictEqual(session.isActive(), false, 'a PIN at its deadline must expire before polling');
assert.strictEqual(session.snapshot().phase, 'expired', 'expired PINs must publish an expired phase');
assert.strictEqual(session.snapshot().pin, null, 'an expired PIN must be cleared so the UI can offer a retry');
assert.strictEqual(errors[errors.length - 1].error.message, 'Plex PIN expired', 'expiry must report a stable error');

assert.ok(states.length >= 10, 'state transitions must be observable without exposing auth secrets');
console.log('Setup auth session checks passed');
