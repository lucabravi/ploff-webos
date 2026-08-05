'use strict';

var assert = require('assert');
var ServerController = require('../app/coordinator/server-controller');
var timers = [];
var clearedTimers = [];
var activityCallback = null;
var failoverCallback = null;
var failoverCandidates = [];
var reachableConnectionCalls = 0;
var remoteStates = [];
var discoveries = 0;
var renderedActivities = [];
var sessionUpdates = [];
var storedServers = [];
var now = 1000;

function normalizeUri(value) {
  return String(value || '').replace(/\/+$/, '');
}

function makeServer(uri, machineIdentifier, connections) {
  return {
    uri: uri,
    machineIdentifier: machineIdentifier,
    connections: connections || [uri],
    connectionRoutes: (connections || [uri]).map(function (connection) {
      return { uri: connection, local: connection.indexOf('192.168.') !== -1 };
    })
  };
}

var localUri = 'http://192.168.0.7:32400';
var remoteUri = 'https://remote.example:32400';
var directUri = 'https://192-168-0-7.example.plex.direct:32400';
var initialServer = makeServer(localUri, 'machine-a', [localUri, remoteUri, directUri]);
var session = {
  apiBaseUrl: localUri,
  token: 'token-a',
  activeServer: initialServer,
  serverState: { activeUri: localUri, servers: [initialServer] },
  view: 'home'
};

var controller = ServerController.create({
  root: {
    setTimeout: function (callback, delay) {
      var timer = { callback: callback, delay: delay, id: timers.length + 1 };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: function (id) { clearedTimers.push(id); }
  },
  clock: function () { return now; },
  modules: {
    ActivityState: {
      createWaiter: function (activityId) {
        return { activityId: String(activityId || ''), seen: false, startedAt: now };
      },
      advanceWaiter: function (waiter, activities) {
        var present = activities.some(function (activity) { return String(activity.id) === waiter.activityId; });
        if (present) { waiter.seen = true; return false; }
        return waiter.seen;
      },
      fingerprint: function (activities) { return JSON.stringify(activities || []); }
    },
    NetworkPolicy: {
      allowsFailover: function (snapshot, routes, uri) {
        return snapshot.status !== 'offline' || uri.indexOf('192.168.') !== -1;
      },
      deferCloudWork: function (root, allowed, work) {
        if (allowed()) { work(); }
      }
    },
    PlexAuth: {
      findReachableConnection: function (root, token, candidates, machineIdentifier, options, callback) {
        reachableConnectionCalls += 1;
        failoverCandidates.push(candidates.slice());
        failoverCallback = callback;
        return { abort: function () {} };
      }
    },
    PlexClient: {
      loadActivities: function (config, callback) {
        activityCallback = callback;
        return { abort: function () {} };
      }
    },
    ServerDiscovery: {
      discover: function (root, config, callback) {
        discoveries += 1;
        callback([]);
      },
      isLocalCandidate: function (uri) { return uri.indexOf('192.168.') !== -1; }
    },
    ServerStore: {
      connectionUris: function (server) { return (server.connections || []).slice(); },
      merge: function (current, incoming) { return current.concat(incoming || []); },
      normalizeUri: normalizeUri,
      preferConnection: function (server, uri) {
        var promoted = makeServer(uri, server.machineIdentifier, server.connections);
        promoted.connectionRoutes = server.connectionRoutes;
        return promoted;
      },
      save: function (storage, servers, activeUri) {
        storedServers = servers.slice();
        return { activeUri: activeUri, servers: servers.slice() };
      }
    }
  },
  storage: {},
  networkSnapshot: function () { return { status: 'online' }; },
  session: {
    read: function () { return session; },
    update: function (changes) {
      Object.keys(changes).forEach(function (key) { session[key] = changes[key]; });
      sessionUpdates.push(changes);
    }
  },
  auth: {
    mode: function () { return 'offline'; },
    activeProfile: function () { return null; },
    activeToken: function () { return 'token-a'; }
  },
  presentation: {
    renderActivities: function (activities) { renderedActivities.push(activities.slice()); },
    renderEditor: function () {},
    renderProfile: function () {},
    editorOpen: function () { return false; },
    openEditor: function () {},
    closeEditor: function () {}
  },
  lifecycle: {
    resetContent: function () {},
    persistRemoteState: function (server, connections, status) {
      remoteStates.push(status);
    }
  }
});

assert.strictEqual(controller.snapshot().activeServer.machineIdentifier, 'machine-a', 'the initial active server is owned by the controller');
assert.strictEqual(controller.serverForIdentity({ machineIdentifier: 'machine-a', uri: 'http://different' }), initialServer, 'server identity matches by machine identifier');

assert.strictEqual(controller.activateConnection(remoteUri), true, 'a reachable route can become active');
assert.strictEqual(session.apiBaseUrl, remoteUri, 'route promotion updates the active API URI');
assert.strictEqual(storedServers[0].uri, remoteUri, 'route promotion persists the preferred connection');

controller.attemptFailover(new Error('primary failed'), function () {});
assert.ok(failoverCallback, 'failover probes alternate routes');
var firstFailoverCallback = failoverCallback;
firstFailoverCallback(new Error('remote failed'));
failoverCallback = null;
controller.attemptFailover(new Error('remote failed'), function () {});
assert.ok(failoverCallback, 'a later failover can probe remaining routes');
assert.notStrictEqual(failoverCallback, firstFailoverCallback, 'failed routes do not block a new failover request');
assert.strictEqual(failoverCandidates[1].indexOf(remoteUri), -1, 'a failed active route is suppressed from later probes');

controller.discover();
assert.strictEqual(discoveries, 1, 'discovery is delegated once');

var remoteCallsBeforeVerification = reachableConnectionCalls;
controller.resumeRemoteVerification(initialServer);
controller.resumeRemoteVerification(initialServer);
assert.strictEqual(reachableConnectionCalls, remoteCallsBeforeVerification + 1, 'remote route verification starts once per server identity');
assert.strictEqual(remoteStates[0], 'pending', 'remote route verification exposes its pending state');

var waiterCompleted = 0;
controller.waitForActivity('metadata-1', function () { waiterCompleted += 1; });
controller.pollActivities();
activityCallback(null, [{ id: 'metadata-1', title: 'Refreshing' }]);
assert.strictEqual(waiterCompleted, 0, 'a waiter remains pending while its activity exists');
timers[timers.length - 1].callback();
activityCallback(null, []);
assert.strictEqual(waiterCompleted, 1, 'a waiter completes after its observed activity disappears');
assert.ok(renderedActivities.length >= 2, 'activity changes are presented');

var cancelledWaiter = 0;
controller.waitForActivity('metadata-2', function (error) {
  if (error && error.cancelled) { cancelledWaiter += 1; }
});
controller.destroy();
assert.strictEqual(cancelledWaiter, 1, 'destroy cancels pending activity waiters');
var timerCountAfterDestroy = timers.length;
controller.pollActivities();
assert.strictEqual(timers.length, timerCountAfterDestroy, 'destroy prevents further polling');
assert.strictEqual(controller.snapshot().destroyed, true, 'destroyed state is observable');


(function testRemoteVerificationCancellationOwnership() {
  var deferredWork = null;
  var deferredId = 41;
  var cleared = [];
  var requestAborted = 0;
  var persisted = [];
  var local = makeServer(localUri, 'machine-c', [localUri, remoteUri]);
  var state = {
    apiBaseUrl: localUri,
    token: 'token-c',
    activeServer: local,
    serverState: { activeUri: localUri, servers: [local] },
    view: 'home'
  };
  var pendingController = ServerController.create({
    root: {
      setTimeout: function () { return 1; },
      clearTimeout: function (id) { cleared.push(id); }
    },
    modules: {
      ActivityState: {
        createWaiter: function () { return {}; },
        advanceWaiter: function () { return false; },
        fingerprint: function () { return ''; }
      },
      NetworkPolicy: {
        allowsFailover: function () { return true; },
        deferCloudWork: function (root, allowed, work) { deferredWork = work; return deferredId; }
      },
      PlexAuth: {
        findReachableConnection: function () {
          return { abort: function () { requestAborted += 1; } };
        }
      },
      PlexClient: { loadActivities: function () { return null; } },
      ServerDiscovery: {
        discover: function () {},
        isLocalCandidate: function (uri) { return uri.indexOf('192.168.') !== -1; }
      },
      ServerStore: {
        connectionUris: function (server) { return server.connections.slice(); },
        merge: function (current) { return current; },
        normalizeUri: normalizeUri,
        preferConnection: function (server) { return server; },
        save: function (storage, servers, activeUri) { return { activeUri: activeUri, servers: servers }; }
      }
    },
    storage: {},
    networkSnapshot: function () { return { status: 'online' }; },
    networkAllowsCloud: function () { return true; },
    session: {
      read: function () { return state; },
      update: function (changes) { Object.keys(changes).forEach(function (key) { state[key] = changes[key]; }); }
    },
    auth: { activeToken: function () { return 'token-c'; }, activeProfile: function () { return null; } },
    lifecycle: { persistRemoteState: function (server, connections, status) { persisted.push(status); } },
    presentation: {}
  });

  pendingController.verifyRemoteConnections(local, 'token-c', local.connections, local.connectionRoutes);
  assert.strictEqual(persisted[0], 'pending', 'remote verification announces pending state before deferred work');
  pendingController.destroy();
  assert.ok(cleared.indexOf(deferredId) !== -1, 'destroy must cancel deferred remote verification timers');
  deferredWork();
  assert.strictEqual(requestAborted, 0, 'cancelled deferred verification must not start a network request after destroy');

  deferredWork = null;
  cleared = [];
  var activeController = ServerController.create({
    root: { setTimeout: function () { return 1; }, clearTimeout: function (id) { cleared.push(id); } },
    modules: {
      ActivityState: { createWaiter: function () { return {}; }, advanceWaiter: function () { return false; }, fingerprint: function () { return ''; } },
      NetworkPolicy: { allowsFailover: function () { return true; } },
      PlexAuth: { findReachableConnection: function () { return { abort: function () { requestAborted += 1; } }; } },
      PlexClient: { loadActivities: function () { return null; } },
      ServerDiscovery: { discover: function () {}, isLocalCandidate: function (uri) { return uri.indexOf('192.168.') !== -1; } },
      ServerStore: {
        connectionUris: function (server) { return server.connections.slice(); }, merge: function (current) { return current; },
        normalizeUri: normalizeUri, preferConnection: function (server) { return server; },
        save: function (storage, servers, activeUri) { return { activeUri: activeUri, servers: servers }; }
      }
    },
    storage: {}, networkSnapshot: function () { return { status: 'online' }; }, networkAllowsCloud: function () { return true; },
    session: { read: function () { return state; }, update: function () {} },
    auth: { activeToken: function () { return 'token-c'; }, activeProfile: function () { return null; } },
    lifecycle: { persistRemoteState: function () {} }, presentation: {}
  });
  activeController.verifyRemoteConnections(local, 'token-c', local.connections, local.connectionRoutes);
  activeController.destroy();
  assert.strictEqual(requestAborted, 1, 'destroy must abort an in-flight remote verification request');
}());

console.log('Server controller checks passed');
