(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffServerController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platformRoot = values.root;
    var modules = values.modules || {};
    var ActivityState = modules.ActivityState;
    var NetworkPolicy = modules.NetworkPolicy;
    var PlexAuth = modules.PlexAuth;
    var PlexClient = modules.PlexClient;
    var ServerDiscovery = modules.ServerDiscovery;
    var ServerStore = modules.ServerStore;
    var session = values.session;
    var auth = values.auth || {};
    var presentation = values.presentation || {};
    var lifecycle = values.lifecycle || {};
    var storage = values.storage;
    var clock = values.clock || function () { return new Date().getTime(); };
    var discoveryActive = false;
    var destroyed = false;
    var failedUris = {};
    var failoverRequest = null;
    var activityRequest = null;
    var activityTimer = null;
    var activities = [];
    var activityFingerprint = '';
    var activityWaiters = [];
    var remoteVerificationStarted = {};
    var remoteVerificationTimers = {};
    var remoteVerificationRequests = {};

    function readSession() {
      return session.read();
    }

    function updateSession(changes) {
      session.update(changes);
    }

    function activeServer() {
      return readSession().activeServer || null;
    }

    function serverState() {
      return readSession().serverState || { activeUri: '', servers: [] };
    }

    function connectionUris(server) {
      if (values.connectionUris) { return values.connectionUris(server); }
      return ServerStore.connectionUris({
        uri: server && server.uri,
        connections: server && server.connections || []
      });
    }

    function replaceStoredServer(server) {
      var current = serverState();
      var servers = current.servers.slice();
      var replaced = false;
      var index;
      for (index = 0; index < servers.length; index += 1) {
        if ((server.machineIdentifier && servers[index].machineIdentifier === server.machineIdentifier) ||
            servers[index].uri === server.uri) {
          servers[index] = server;
          replaced = true;
          break;
        }
      }
      if (!replaced) { servers.push(server); }
      updateSession({ serverState: ServerStore.save(storage, servers, server.uri) });
    }

    function storeServer(server) {
      var current = activeServer();
      replaceStoredServer(server);
      if (current && ((server.machineIdentifier && server.machineIdentifier === current.machineIdentifier) ||
          server.uri === current.uri)) {
        updateSession({ activeServer: server });
      }
    }

    function serverForIdentity(server) {
      var servers = serverState().servers;
      var index;
      if (!server) { return null; }
      for (index = 0; index < servers.length; index += 1) {
        if ((server.machineIdentifier && servers[index].machineIdentifier === server.machineIdentifier) ||
            servers[index].uri === server.uri) {
          return servers[index];
        }
      }
      return null;
    }

    function activateConnection(uri) {
      var current = activeServer();
      var promoted;
      if (destroyed || !current || !uri) { return false; }
      promoted = ServerStore.preferConnection(current, uri);
      if (!promoted) { return false; }
      updateSession({ activeServer: promoted, apiBaseUrl: promoted.uri });
      replaceStoredServer(promoted);
      if (auth.persistConnection) { auth.persistConnection(promoted); }
      if (presentation.renderProfile) { presentation.renderProfile(); }
      if (presentation.renderSettings) { presentation.renderSettings(); }
      return true;
    }

    function clearActivityState(cancelWaiters) {
      var error;
      if (activityRequest && activityRequest.abort) { activityRequest.abort(); }
      activityRequest = null;
      platformRoot.clearTimeout(activityTimer);
      activityTimer = null;
      activities = [];
      activityFingerprint = '';
      if (cancelWaiters && activityWaiters.length) {
        error = { cancelled: true };
        activityWaiters.forEach(function (entry) { entry.callback(error); });
      }
      activityWaiters = [];
      if (presentation.renderActivities) { presentation.renderActivities(activities); }
    }

    function applyServer(server) {
      var current = readSession();
      var previousIdentity;
      var nextIdentity;
      var token;
      var profile;
      var apiBaseUrl;
      var nextState;
      if (destroyed || !server) { return false; }
      if (failoverRequest && failoverRequest.abort) { failoverRequest.abort(); }
      failoverRequest = null;
      failedUris = {};
      previousIdentity = String(current.apiBaseUrl || '') + '|' + String(current.token || '');
      token = auth.activeToken ? auth.activeToken(server.machineIdentifier, server) : current.token;
      profile = auth.activeProfile ? auth.activeProfile() : null;
      apiBaseUrl = token && profile && profile.serverConnectionUri ? profile.serverConnectionUri : server.uri;
      nextState = ServerStore.save(storage, serverState().servers, server.uri);
      updateSession({
        activeServer: server,
        apiBaseUrl: apiBaseUrl,
        token: token || '',
        serverState: nextState
      });
      nextIdentity = String(apiBaseUrl || '') + '|' + String(token || '');
      if (previousIdentity !== nextIdentity) {
        clearActivityState(true);
        if (lifecycle.resetContent) { lifecycle.resetContent(); }
      }
      return true;
    }

    function attemptFailover(error, callback) {
      var current = readSession();
      var server = activeServer();
      var currentUri = ServerStore.normalizeUri(current.apiBaseUrl);
      var candidates;
      var done = callback || function () {};
      if (destroyed || !server || !PlexAuth || !PlexAuth.findReachableConnection || failoverRequest) {
        done(false, error);
        return;
      }
      if (currentUri) { failedUris[currentUri] = true; }
      candidates = connectionUris(server).filter(function (uri) {
        return !failedUris[ServerStore.normalizeUri(uri)] &&
          NetworkPolicy.allowsFailover(
            values.networkSnapshot(),
            server.connectionRoutes,
            uri,
            ServerStore.normalizeUri,
            ServerDiscovery.isLocalCandidate
          );
      });
      if (!candidates.length) { done(false, error); return; }
      failoverRequest = PlexAuth.findReachableConnection(
        platformRoot,
        current.token || '',
        candidates,
        server.machineIdentifier,
        values.authOptions || {},
        function (connectionError, uri) {
          failoverRequest = null;
          if (destroyed || connectionError || !uri || !activateConnection(uri)) {
            done(false, error || connectionError);
            return;
          }
          done(true, null);
        }
      );
    }

    function discover(callback) {
      var done = callback || function () {};
      if (destroyed || !ServerDiscovery || discoveryActive) { done(serverState().servers); return; }
      discoveryActive = true;
      if (presentation.renderEditor && presentation.editorOpen && presentation.editorOpen()) {
        presentation.renderEditor();
      }
      ServerDiscovery.discover(platformRoot, values.discoveryConfig ? values.discoveryConfig() : readSession(), function (servers) {
        var current;
        var merged;
        if (destroyed) { return; }
        discoveryActive = false;
        current = serverState();
        merged = ServerStore.merge(current.servers, servers || []);
        updateSession({
          serverState: ServerStore.save(storage, merged, activeServer() ? activeServer().uri : current.activeUri)
        });
        if (presentation.renderEditor && presentation.editorOpen && presentation.editorOpen()) {
          presentation.renderEditor();
        }
        done(serverState().servers);
      });
    }

    function processActivityWaiters() {
      var remaining = [];
      var completed = [];
      activityWaiters.forEach(function (entry) {
        if (ActivityState.advanceWaiter(entry.waiter, activities, clock())) {
          completed.push(entry.callback);
        } else {
          remaining.push(entry);
        }
      });
      activityWaiters = remaining;
      completed.forEach(function (callback) { callback(null); });
    }

    function scheduleActivityPoll(delay) {
      if (destroyed) { return; }
      platformRoot.clearTimeout(activityTimer);
      activityTimer = platformRoot.setTimeout(pollActivities, typeof delay === 'number' ? delay : 3000);
    }

    function pollActivities() {
      var current;
      var identity;
      if (destroyed) { return; }
      activityTimer = null;
      current = readSession();
      if (!current.apiBaseUrl || current.view === 'player') { scheduleActivityPoll(3000); return; }
      if (activityRequest) { scheduleActivityPoll(500); return; }
      identity = String(current.apiBaseUrl || '') + '|' + String(current.token || '');
      activityRequest = PlexClient.loadActivities(current, function (error, nextActivities) {
        var latest;
        var nextFingerprint;
        activityRequest = null;
        if (destroyed) { return; }
        latest = readSession();
        if (identity !== String(latest.apiBaseUrl || '') + '|' + String(latest.token || '')) {
          scheduleActivityPoll(0);
          return;
        }
        if (!error) {
          nextFingerprint = ActivityState.fingerprint(nextActivities);
          activities = nextActivities || [];
          if (nextFingerprint !== activityFingerprint) {
            activityFingerprint = nextFingerprint;
            if (presentation.renderActivities) { presentation.renderActivities(activities); }
          }
        }
        processActivityWaiters();
        scheduleActivityPoll(3000);
      });
    }

    function waitForActivity(activityId, callback) {
      if (destroyed) {
        callback({ cancelled: true });
        return;
      }
      activityWaiters.push({
        waiter: ActivityState.createWaiter(activityId, activities, clock()),
        callback: callback
      });
      scheduleActivityPoll(100);
    }

    function verifyRemoteConnections(server, token, connections, connectionRoutes) {
      var verificationKey = String(server && (server.machineIdentifier || server.uri) || '');
      var remoteConnections = (connections || []).filter(function (uri) {
        return !ServerDiscovery.isLocalCandidate(uri);
      });
      var runVerification;
      if (destroyed || !verificationKey || remoteVerificationStarted[verificationKey]) { return; }
      if (values.networkAllowsCloud && !values.networkAllowsCloud()) { return; }
      remoteVerificationStarted[verificationKey] = true;
      if (lifecycle.persistRemoteState) {
        lifecycle.persistRemoteState(server, connections, remoteConnections.length ? 'pending' : 'unavailable', connectionRoutes);
      }
      if (!remoteConnections.length) { return; }
      runVerification = function () {
        var completed = false;
        var request;
        delete remoteVerificationTimers[verificationKey];
        if (destroyed) { return; }
        request = PlexAuth.findReachableConnection(
          platformRoot,
          token,
          remoteConnections,
          server.machineIdentifier,
          values.authOptions || {},
          function (error) {
            completed = true;
            delete remoteVerificationRequests[verificationKey];
            if (destroyed) { return; }
            if (lifecycle.persistRemoteState) {
              lifecycle.persistRemoteState(server, connections, error ? 'failed' : 'linked', connectionRoutes);
            }
          }
        );
        if (!completed && request) { remoteVerificationRequests[verificationKey] = request; }
      };
      if (NetworkPolicy.deferCloudWork) {
        remoteVerificationTimers[verificationKey] = NetworkPolicy.deferCloudWork(
          platformRoot,
          values.networkAllowsCloud || function () { return true; },
          runVerification,
          function () {
            delete remoteVerificationTimers[verificationKey];
            delete remoteVerificationStarted[verificationKey];
          }
        );
      } else {
        runVerification();
      }
    }

    function resumeRemoteVerification(server) {
      var status = String(server && server.remoteLinkStatus || '');
      var token = auth.activeToken ? auth.activeToken(server && server.machineIdentifier, server) : '';
      if (!server || !token || status === 'linked' || status === 'unavailable') { return; }
      verifyRemoteConnections(server, token, server.connections || [], server.connectionRoutes || []);
    }

    function openEditor() {
      if (destroyed || !presentation.openEditor) { return; }
      presentation.openEditor();
    }

    function closeEditor() {
      if (destroyed || !presentation.closeEditor) { return; }
      presentation.closeEditor();
    }

    function start() {
      if (destroyed) { return; }
      scheduleActivityPoll(0);
    }

    function clearFailedRoutes() {
      failedUris = {};
    }

    function snapshot() {
      return {
        activeServer: activeServer(),
        activities: activities.slice(),
        destroyed: destroyed,
        discoveryActive: discoveryActive,
        failoverActive: !!failoverRequest,
        failedUris: Object.keys(failedUris),
        remoteVerificationStarted: Object.keys(remoteVerificationStarted),
        serverState: serverState()
      };
    }

    function destroy() {
      var key;
      if (destroyed) { return; }
      destroyed = true;
      if (failoverRequest && failoverRequest.abort) { failoverRequest.abort(); }
      failoverRequest = null;
      for (key in remoteVerificationTimers) {
        if (Object.prototype.hasOwnProperty.call(remoteVerificationTimers, key)) {
          platformRoot.clearTimeout(remoteVerificationTimers[key]);
        }
      }
      remoteVerificationTimers = {};
      for (key in remoteVerificationRequests) {
        if (Object.prototype.hasOwnProperty.call(remoteVerificationRequests, key) &&
            remoteVerificationRequests[key] && remoteVerificationRequests[key].abort) {
          remoteVerificationRequests[key].abort();
        }
      }
      remoteVerificationRequests = {};
      clearActivityState(true);
    }

    return {
      start: start,
      clearFailedRoutes: clearFailedRoutes,
      discover: discover,
      applyServer: applyServer,
      activateConnection: activateConnection,
      attemptFailover: attemptFailover,
      pollActivities: pollActivities,
      waitForActivity: waitForActivity,
      openEditor: openEditor,
      closeEditor: closeEditor,
      storeServer: storeServer,
      verifyRemoteConnections: verifyRemoteConnections,
      resumeRemoteVerification: resumeRemoteVerification,
      serverForIdentity: serverForIdentity,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));
