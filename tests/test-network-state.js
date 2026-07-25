'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '../app/network-state.js');

assert.ok(fs.existsSync(modulePath), 'network state module must exist');
var NetworkState = require(modulePath);

function serviceRoot(response, createHandle) {
  var requests = [];
  return {
    requests: requests,
    root: {
      webOS: {
        service: {
          request: function (uri, options) {
            var handle = createHandle ? createHandle(requests.length) : null;
            requests.push({ uri: uri, options: options });
            if (response === 'failure') {
              options.onFailure({ errorText: 'Connection Manager unavailable' });
            } else {
              options.onSuccess(response);
            }
            return handle;
          }
        }
      }
    }
  };
}

function browserRoot(online) {
  var listeners = {};
  return {
    root: {
      navigator: typeof online === 'undefined' ? {} : { onLine: online },
      addEventListener: function (name, listener) { listeners[name] = listener; },
      removeEventListener: function (name) { delete listeners[name]; }
    },
    emit: function (name) { listeners[name](); }
  };
}

var wired = serviceRoot({
  wired: { state: 'connected', ipAddress: '192.168.1.20' },
  wifi: { state: 'disconnected' },
  isInternetConnectionAvailable: true,
  connectionType: 'wired'
});
var state = NetworkState.create(wired.root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'online',
  lanAvailable: true,
  internetAvailable: true,
  connectionType: 'wired',
  localAddress: '192.168.1.20'
}, 'wired connectivity must normalize to online');
assert.strictEqual(wired.requests[0].uri, 'luna://com.palm.connectionmanager', 'Connection Manager URI must be used');
assert.deepStrictEqual(wired.requests[0].options.parameters, { subscribe: true }, 'Connection Manager status must be subscribed');
assert.strictEqual(state.allowsLocal(), true, 'online state must allow local operations');
assert.strictEqual(state.allowsCloud(), true, 'online state must allow cloud operations');
state.destroy();

state = NetworkState.create(serviceRoot({
  wifi: { state: 'connected', ipAddress: '10.0.0.8' },
  wired: { state: 'disconnected' },
  isInternetConnectionAvailable: false,
  connectionType: 'wifi'
}).root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'local-only',
  lanAvailable: true,
  internetAvailable: false,
  connectionType: 'wifi',
  localAddress: '10.0.0.8'
}, 'Wi-Fi without Internet must normalize to local-only');
assert.strictEqual(state.allowsLocal(), true, 'local-only state must preserve local operations');
assert.strictEqual(state.allowsCloud(), false, 'local-only state must block cloud operations');
state.destroy();

state = NetworkState.create(serviceRoot({
  wired: { state: 'disconnected' },
  wifi: { state: 'disconnected' },
  isInternetConnectionAvailable: false
}).root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'offline',
  lanAvailable: false,
  internetAvailable: false,
  connectionType: null,
  localAddress: null
}, 'disconnected interfaces must normalize to offline');
assert.strictEqual(state.allowsLocal(), false, 'offline state must block local operations');
assert.strictEqual(state.allowsCloud(), false, 'offline state must block cloud operations');
state.destroy();

state = NetworkState.create(serviceRoot({
  wired: { state: 'connected' }
}).root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: true,
  internetAvailable: null,
  connectionType: 'wired',
  localAddress: null
}, 'partial responses must retain known fields and leave missing fields unknown');
state.destroy();

state = NetworkState.create(serviceRoot({
  wired: { state: 'not-a-state', ipAddress: {} },
  wifi: [],
  isInternetConnectionAvailable: 'maybe'
}).root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: null,
  internetAvailable: null,
  connectionType: null,
  localAddress: null
}, 'malformed service fields must remain unknown without inventing connectivity');
state.destroy();

state = NetworkState.create(serviceRoot('failure').root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: null,
  internetAvailable: null,
  connectionType: null,
  localAddress: null
}, 'Connection Manager failure must become unknown rather than offline');
assert.strictEqual(state.allowsLocal(), true, 'unknown state must preserve local behavior');
assert.strictEqual(state.allowsCloud(), true, 'unknown state must preserve cloud behavior');
state.destroy();

var browserOffline = browserRoot(false);
state = NetworkState.create(browserOffline.root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: null,
  internetAvailable: false,
  connectionType: null,
  localAddress: null
}, 'browser offline must block cloud while keeping LAN availability unknown');
assert.strictEqual(state.allowsLocal(), true, 'browser offline must preserve local behavior when LAN is unknown');
assert.strictEqual(state.allowsCloud(), false, 'browser offline must block cloud behavior');
state.destroy();

var browserOnline = browserRoot(true);
state = NetworkState.create(browserOnline.root);
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: null,
  internetAvailable: null,
  connectionType: null,
  localAddress: null
}, 'browser online must not claim confirmed Internet availability');
assert.strictEqual(state.allowsCloud(), true, 'browser online unknown state must preserve cloud behavior');
var browserNotifications = [];
state.subscribe(function (snapshot) { browserNotifications.push(snapshot.status); });
browserOnline.root.navigator.onLine = false;
browserOnline.emit('offline');
assert.deepStrictEqual(state.snapshot(), {
  status: 'unknown',
  lanAvailable: null,
  internetAvailable: false,
  connectionType: null,
  localAddress: null
}, 'browser offline events must mark Internet unavailable without claiming LAN is absent');
browserOnline.root.navigator.onLine = true;
browserOnline.emit('online');
assert.strictEqual(state.snapshot().status, 'unknown', 'browser online events must return to conservative unknown state');
assert.deepStrictEqual(browserNotifications, ['unknown', 'unknown'], 'browser events must notify only for normalized changes');
state.destroy();

var browserUnknown = browserRoot();
state = NetworkState.create(browserUnknown.root);
assert.strictEqual(state.snapshot().status, 'unknown', 'unsupported browser connectivity must remain unknown');
state.destroy();

var updates = serviceRoot({
  wifi: { state: 'connected', ipAddress: '192.168.1.30' },
  isInternetConnectionAvailable: true
});
state = NetworkState.create(updates.root);
var notifications = [];
var unsubscribe = state.subscribe(function (snapshot) { notifications.push(snapshot); });
updates.requests[0].options.onSuccess({
  wifi: { state: 'connected', ipAddress: '192.168.1.30' },
  isInternetConnectionAvailable: true
});
assert.strictEqual(notifications.length, 0, 'unchanged normalized state must not notify subscribers');
updates.requests[0].options.onSuccess({
  wifi: { state: 'connected', ipAddress: '192.168.1.31' },
  isInternetConnectionAvailable: true
});
assert.strictEqual(notifications.length, 1, 'changed normalized state must notify subscribers once');
assert.strictEqual(notifications[0].localAddress, '192.168.1.31', 'notifications must provide the normalized snapshot');
var selfUnsubscribe;
var selfCalls = 0;
var followingCalls = 0;
selfUnsubscribe = state.subscribe(function () {
  selfCalls += 1;
  selfUnsubscribe();
});
state.subscribe(function () { followingCalls += 1; });
updates.requests[0].options.onSuccess({
  wifi: { state: 'connected', ipAddress: '192.168.1.32' },
  isInternetConnectionAvailable: true
});
assert.strictEqual(selfCalls, 1, 'a listener may unsubscribe itself during notification');
assert.strictEqual(followingCalls, 1, 'self-unsubscribe must not skip the following listener');
var notificationsAfterSelfUnsubscribe = notifications.length;
unsubscribe();
updates.requests[0].options.onSuccess({
  wifi: { state: 'disconnected' },
  isInternetConnectionAvailable: false
});
assert.strictEqual(notifications.length, notificationsAfterSelfUnsubscribe, 'unsubscribed listeners must not receive later changes');
state.destroy();

var cancelCalls = 0;
var unsubscribeCalls = 0;
var cancellable = serviceRoot({
  wired: { state: 'connected', ipAddress: '192.168.1.40' },
  isInternetConnectionAvailable: true
}, function (index) {
  if (index === 0) {
    return { cancel: function () { cancelCalls += 1; } };
  }
  return { unsubscribe: function () { unsubscribeCalls += 1; } };
});
state = NetworkState.create(cancellable.root);
state.refresh();
assert.strictEqual(cancelCalls, 1, 'refresh must cancel the prior Connection Manager subscription');
assert.strictEqual(cancellable.requests.length, 2, 'refresh must create a replacement Connection Manager request');
state.destroy();
assert.strictEqual(unsubscribeCalls, 1, 'destroy must unsubscribe the active Connection Manager handle');

console.log('Network state checks passed');
