(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffServerFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var config = values.config || {};
    var statePort = values.state || {};
    var presentation = values.presentation || {};
    var application = values.application || {};
    var lifecycle = values.lifecycle || {};
    var transitions = values.transitions || {};
    var platformRoot = platform.root || {};
    var document = platform.document || null;
    var storage = platform.storage;
    var credentialStorage = platform.credentialStorage;
    var ServerController = modules.ServerController;
    var ServerEditorView = modules.ServerEditorView;
    var ServerDiscovery = modules.ServerDiscovery;
    var ServerStore = modules.ServerStore;
    var AuthStore = modules.AuthStore;
    var NetworkState = modules.NetworkState;
    var NetworkTransition = modules.NetworkTransition;
    var PlexAuth = modules.PlexAuth;
    var PlexClient = modules.PlexClient;
    var LocalData = modules.LocalData;
    var WatchlistState = modules.WatchlistState;
    var WatchlistClient = modules.WatchlistClient;
    var applicationConfig = config.application || {};
    var authOptions = config.authOptions || {};
    var configuredApiBaseUrl = String(config.configuredApiBaseUrl || applicationConfig.apiBaseUrl || '');
    var configuredToken = String(config.configuredToken || applicationConfig.token || '');
    var configuredServer = config.configuredServer || null;
    var controller = null;
    var editor = null;
    var networkState = null;
    var networkTransition = null;
    var networkUnsubscribe = null;
    var networkValue = null;
    var serverValue = null;
    var serverStateValue = null;
    var authStateValue = null;
    var destroyed = false;
    var generation = 0;
    var applicationGeneration = 0;
    var manualProbeRequest = null;
    var applicationRequests = [];
    var accountRequests = [];

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function copyObject(source) {
      var result = {};
      var key;
      source = source || {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function copyNetwork(source) {
      source = source || {};
      return {
        status: source.status,
        lanAvailable: source.lanAvailable,
        internetAvailable: source.internetAvailable,
        connectionType: source.connectionType,
        localAddress: source.localAddress
      };
    }

    function copyProfiles(source) {
      return (source || []).map(function (profile) { return copyObject(profile); });
    }

    function currentView() {
      var view = call(statePort.view);
      return view === undefined || view === null ? '' : String(view);
    }

    function authSnapshot() {
      var state = AuthStore.validate(authStateValue || {});
      state.profiles = copyProfiles(state.profiles);
      return state;
    }

    function serverState() {
      var state = ServerStore.validate(serverStateValue || {});
      state.servers = state.servers.slice();
      return state;
    }

    function publishState() {
      if (destroyed) { return; }
      call(statePort.publish, {
        activeProfile: activeProfile(),
        activeServer: serverValue,
        authState: authSnapshot(),
        config: applicationConfig,
        networkSnapshot: copyNetwork(networkValue),
        serverState: serverState()
      });
    }

    function updateSession(changes) {
      changes = changes || {};
      if (destroyed) { return readSession(); }
      if (Object.prototype.hasOwnProperty.call(changes, 'activeServer')) { serverValue = changes.activeServer || null; }
      if (Object.prototype.hasOwnProperty.call(changes, 'apiBaseUrl')) { applicationConfig.apiBaseUrl = String(changes.apiBaseUrl || ''); }
      if (Object.prototype.hasOwnProperty.call(changes, 'token')) { applicationConfig.token = String(changes.token || ''); }
      if (Object.prototype.hasOwnProperty.call(changes, 'serverState')) { serverStateValue = ServerStore.validate(changes.serverState || {}); }
      publishState();
      return readSession();
    }

    function readSession() {
      return {
        activeServer: serverValue,
        apiBaseUrl: String(applicationConfig.apiBaseUrl || ''),
        token: String(applicationConfig.token || ''),
        serverState: serverState(),
        view: currentView()
      };
    }

    function servers() { return serverState().servers; }
    function activeServer() { return serverValue; }
    function authMode() { return String(authStateValue && authStateValue.mode || 'offline'); }
    function setupComplete() { return !!(authStateValue && authStateValue.setupComplete); }
    function ownerToken() { return String(authStateValue && authStateValue.ownerToken || ''); }
    function profiles() { return copyProfiles(authStateValue && authStateValue.profiles || []); }
    function activeProfile() {
      var profile = AuthStore.activeProfile(authStateValue);
      return profile ? copyObject(profile) : null;
    }

    function saveAuth(next) {
      if (destroyed) { return authSnapshot(); }
      authStateValue = AuthStore.save(credentialStorage, next || authStateValue || {});
      publishState();
      call(presentation.renderProfile);
      call(presentation.renderSettings);
      return authSnapshot();
    }

    function activeToken(machineIdentifier, server) {
      var cachedToken = AuthStore.activeToken(authStateValue, machineIdentifier);
      if (cachedToken) { return cachedToken; }
      if (authMode() !== 'plex' && server &&
          ServerStore.normalizeUri(server.uri) === ServerStore.normalizeUri(configuredApiBaseUrl)) {
        return configuredToken;
      }
      return '';
    }

    function persistConnection(server) {
      if (destroyed || authMode() !== 'plex' || !server) { return false; }
      authStateValue = AuthStore.setActiveProfileConnection(authStateValue, server.machineIdentifier, server.uri);
      saveAuth(authStateValue);
      return true;
    }

    function connectionUris(server) {
      var value = server || {};
      var connections = Object.prototype.toString.call(value.connections) === '[object Array]' ? value.connections.slice() : [];
      var profile = activeProfile();
      var selected = activeServer();
      if (ServerStore.same(value, selected)) {
        if (applicationConfig.apiBaseUrl) { connections.push(applicationConfig.apiBaseUrl); }
        if (profile && profile.serverConnectionUri) { connections.push(profile.serverConnectionUri); }
      }
      return ServerStore.connectionUris({ uri: value.uri, connections: connections });
    }

    function preferredLocalUri(server, uris) {
      var selected = activeServer();
      var profile = activeProfile();
      var preferred = [];
      var index;
      var candidate;
      if (ServerStore.same(server, selected)) {
        preferred.push(applicationConfig.apiBaseUrl);
        if (profile) { preferred.push(profile.serverConnectionUri); }
      }
      preferred.push(server && server.uri);
      for (index = 0; index < preferred.length; index += 1) {
        candidate = ServerStore.normalizeUri(preferred[index]);
        if (candidate && uris.indexOf(candidate) !== -1 && ServerDiscovery.isLocalCandidate(candidate)) {
          return candidate;
        }
      }
      return '';
    }

    function addressesFor(server, compactDirect) {
      var uris = connectionUris(server);
      var localHosts = [];
      var localUris = [];
      var result = [];
      var directCount = 0;
      var selectedLocalUri;
      var index;
      var uri;
      var host;
      var direct;
      var embeddedHost;
      for (index = 0; index < uris.length; index += 1) {
        uri = uris[index];
        host = String(uri || '').match(/^https?:\/\/([^/:]+)/i);
        if (host && ServerDiscovery.isLocalCandidate(uri)) {
          localHosts.push(host[1]);
          if (localUris.indexOf(uri) === -1) { localUris.push(uri); }
        }
      }
      for (index = 0; index < uris.length; index += 1) {
        uri = uris[index];
        host = String(uri || '').match(/^https?:\/\/([^/:]+)/i);
        direct = host && host[1].match(/^(\d+)-(\d+)-(\d+)-(\d+)\..*\.plex\.direct$/i);
        embeddedHost = direct ? [direct[1], direct[2], direct[3], direct[4]].join('.') : '';
        if (compactDirect && direct) {
          if (localHosts.indexOf(embeddedHost) === -1) { directCount += 1; }
        } else if (compactDirect && ServerDiscovery.isLocalCandidate(uri)) {
          /* The settings picker needs one usable local endpoint, not every adapter route. */
        } else {
          result.push({ kind: ServerDiscovery.isLocalCandidate(uri) ? 'local' : 'remote', uri: uri });
        }
      }
      if (compactDirect && localUris.length) {
        selectedLocalUri = preferredLocalUri(server, uris) || localUris[0];
        result.unshift({ kind: 'local', uri: selectedLocalUri });
      }
      if (compactDirect && directCount) { result.push({ kind: 'direct', count: directCount, uri: '' }); }
      return result;
    }

    function appendAddresses(row, addresses) {
      var container;
      var index;
      var descriptor;
      var labelKey;
      if (!row || typeof presentation.element !== 'function') { return; }
      container = presentation.element('span', 'server-editor-addresses');
      for (index = 0; index < (addresses || []).length; index += 1) {
        descriptor = addresses[index] || {};
        if (descriptor.kind === 'direct') {
          container.appendChild(presentation.element(
            'span',
            'server-editor-meta',
            call(presentation.t, 'settings.remoteDirect') + ': ' +
              call(presentation.t, 'settings.addressCount', { count: descriptor.count })
          ));
        } else {
          labelKey = descriptor.kind === 'local' ? 'settings.localAddress' : 'settings.remoteAddress';
          container.appendChild(presentation.element(
            'span',
            'server-editor-meta',
            call(presentation.t, labelKey) + ': ' + String(descriptor.uri || '')
          ));
        }
      }
      row.appendChild(container);
    }

    function editorSnapshot() {
      if (!editor || typeof editor.snapshot !== 'function') { return { open: false, index: 0 }; }
      return editor.snapshot();
    }

    function renderEditor() {
      var viewState;
      var count;
      if (destroyed || !editor) { return editorSnapshot(); }
      count = servers().length + 2;
      viewState = editorSnapshot();
      if (typeof editor.focus === 'function') {
        editor.focus(viewState.index, count);
        viewState = editorSnapshot();
      }
      if (typeof editor.render === 'function') {
        editor.render({
          activeUri: activeServer() && activeServer().uri || '',
          addressesFor: function (server) { return addressesFor(server, true); },
          index: viewState.index,
          open: viewState.open,
          servers: servers()
        });
      }
      return editorSnapshot();
    }

    function openEditor() {
      if (destroyed || !editor) { return false; }
      if (typeof editor.open === 'function') { editor.open(); }
      renderEditor();
      call(presentation.renderSettings);
      return editorSnapshot();
    }

    function closeEditor() {
      if (destroyed || !editor) { return false; }
      if (typeof editor.close === 'function') { editor.close(); }
      renderEditor();
      call(presentation.renderSettings);
      return editorSnapshot();
    }

    function focusEditor(index) {
      if (destroyed || !editor) { return false; }
      if (typeof editor.focus === 'function') { editor.focus(index, servers().length + 2); }
      if (typeof editor.updateFocus === 'function') { editor.updateFocus(); }
      else { renderEditor(); }
      return editorSnapshot();
    }

    function snapshot() {
      var source = controller && typeof controller.snapshot === 'function' ? (controller.snapshot() || {}) : {};
      return {
        activeServer: source.activeServer || activeServer(),
        activities: Object.prototype.toString.call(source.activities) === '[object Array]' ? source.activities.slice() : [],
        auth: authSnapshot(),
        destroyed: destroyed,
        discoveryActive: source.discoveryActive === true,
        editor: editorSnapshot(),
        failoverActive: source.failoverActive === true,
        failedUris: Object.prototype.toString.call(source.failedUris) === '[object Array]' ? source.failedUris.slice() : [],
        network: copyNetwork(networkValue),
        remoteVerificationStarted: Object.prototype.toString.call(source.remoteVerificationStarted) === '[object Array]' ? source.remoteVerificationStarted.slice() : [],
        serverState: source.serverState || serverState()
      };
    }

    function discover(callback) {
      var requestGeneration = generation;
      if (destroyed || !controller || typeof controller.discover !== 'function') { return null; }
      return controller.discover(function (discovered) {
        var list;
        var currentUri;
        var current;
        if (destroyed || requestGeneration !== generation) { return; }
        list = Object.prototype.toString.call(discovered) === '[object Array]' ? discovered : servers();
        renderEditor();
        call(transitions.discoveryComplete, list, snapshot());
        call(callback, list, snapshot());
        currentUri = ServerStore.normalizeUri(applicationConfig.apiBaseUrl);
        current = snapshot();
        if (currentUri && current.failedUris.indexOf(currentUri) !== -1 && !current.failoverActive) { loadApplication(); }
      });
    }

    function normalizeManualAddress(value) {
      return ServerDiscovery.normalizeCandidate(value);
    }

    function shouldOfferConnection(localUri, enteredUri) {
      return ServerDiscovery.shouldOfferLocalConnection(localUri, enteredUri);
    }

    function findServerIdentity(list, server) {
      var index;
      for (index = 0; index < (list || []).length; index += 1) {
        if (ServerStore.same(list[index], server)) { return list[index]; }
      }
      return null;
    }

    function mergeServers(incoming) {
      var current;
      var merged;
      var saved;
      var selected;
      if (destroyed) { return servers(); }
      current = serverState();
      merged = ServerStore.merge(current.servers, incoming || []);
      saved = ServerStore.save(storage, merged, current.activeUri || (activeServer() && activeServer().uri) || '');
      selected = activeServer();
      if (selected) { selected = findServerIdentity(saved.servers, selected) || selected; }
      updateSession({ serverState: saved, activeServer: selected });
      renderEditor();
      return servers();
    }

    function serverForIdentity(server) {
      if (!server) { return null; }
      if (controller && typeof controller.serverForIdentity === 'function') { return controller.serverForIdentity(server); }
      return findServerIdentity(servers(), server);
    }

    function serverForUri(uri) {
      var target = ServerStore.normalizeUri(uri);
      var list = servers();
      var index;
      for (index = 0; index < list.length; index += 1) {
        if (ServerStore.normalizeUri(list[index].uri) === target) { return list[index]; }
      }
      return null;
    }

    function probeManualAddress(uri, callback) {
      var requestGeneration = generation;
      var timeout;
      var discoveryConfig;
      var completed = false;
      var request;
      if (destroyed) { call(callback, new Error('Plex server unavailable')); return null; }
      discoveryConfig = typeof config.discovery === 'function' ? config.discovery() : (config.discovery || applicationConfig);
      timeout = Number(discoveryConfig && discoveryConfig.discoveryTimeout || 1800);
      request = ServerDiscovery.probe(platformRoot, uri, '', timeout, function (server) {
        var resolved;
        completed = true;
        if (destroyed || requestGeneration !== generation) { return; }
        manualProbeRequest = null;
        if (!server) { call(callback, new Error('Plex server unavailable')); return; }
        mergeServers([server]);
        resolved = serverForIdentity(server) || server;
        call(callback, null, resolved);
      });
      if (!completed && request) { manualProbeRequest = request; }
      return request || null;
    }

    function applyServer(server) {
      if (destroyed || !controller || typeof controller.applyServer !== 'function') { return false; }
      return controller.applyServer(server);
    }

    function switchServer(server) {
      var current;
      var applied;
      if (destroyed || !server) { return false; }
      current = activeServer();
      if (ServerStore.same(current, server)) {
        closeEditor();
        return false;
      }
      applied = applyServer(server);
      if (applied === false) { return false; }
      closeEditor();
      call(transitions.serverSwitched, server, snapshot());
      return true;
    }

    function activateEditor() {
      var viewState;
      var selected;
      if (destroyed) { return false; }
      viewState = editorSnapshot();
      if (viewState.index === 0) { discover(); return true; }
      if (viewState.index === 1) {
        closeEditor();
        call(transitions.openManualSetup, snapshot());
        return true;
      }
      selected = servers()[viewState.index - 2];
      if (!selected) { return false; }
      switchServer(selected);
      return true;
    }

    function attemptFailover(error, callback) {
      if (destroyed || !controller || typeof controller.attemptFailover !== 'function') {
        call(callback, false, error);
        return false;
      }
      controller.attemptFailover(error, callback);
      return true;
    }

    function clearFailedRoutes() {
      if (destroyed || !controller || typeof controller.clearFailedRoutes !== 'function') { return false; }
      controller.clearFailedRoutes();
      return true;
    }

    function waitForActivity(activityId, callback) {
      if (destroyed || !controller || typeof controller.waitForActivity !== 'function') {
        call(callback, { cancelled: true });
        return false;
      }
      controller.waitForActivity(activityId, callback);
      return true;
    }

    function storeServer(server) {
      if (destroyed || !controller || typeof controller.storeServer !== 'function') { return false; }
      controller.storeServer(server);
      renderEditor();
      return true;
    }

    function persistRemoteState(server, connections, status, routes) {
      var current;
      var updated;
      if (destroyed) { return false; }
      current = serverForIdentity(server) || server;
      updated = ServerStore.withRemoteConnections(
        current,
        connections || [],
        status,
        new Date().getTime(),
        routes || server && server.connectionRoutes || []
      );
      if (!updated) { return false; }
      return storeServer(updated);
    }

    function verifyRemoteConnections(server, token, connections, routes) {
      if (destroyed || !controller || typeof controller.verifyRemoteConnections !== 'function') { return false; }
      controller.verifyRemoteConnections(server, token, connections, routes);
      return true;
    }

    function resumeRemoteVerification(server) {
      if (destroyed || !controller || typeof controller.resumeRemoteVerification !== 'function') { return false; }
      controller.resumeRemoteVerification(server);
      return true;
    }

    function start() {
      if (destroyed || !controller || typeof controller.start !== 'function') { return false; }
      controller.start();
      return true;
    }

    function networkSnapshot() { return copyNetwork(networkValue); }
    function allowsLocal() { return !networkState || networkState.allowsLocal(); }
    function allowsCloud() { return !networkState || networkState.allowsCloud(); }
    function subscribeNetwork(listener) {
      if (destroyed || !networkState || typeof networkState.subscribe !== 'function') { return function () {}; }
      return networkState.subscribe(listener);
    }

    function watchlistAccountToken() {
      var profile = activeProfile();
      return authMode() === 'plex' ? String(profile && profile.accountToken || ownerToken() || '') : '';
    }

    function watchlistAvailable() {
      return !!(allowsCloud() && WatchlistState && WatchlistClient && WatchlistState.available(authMode(), watchlistAccountToken()));
    }

    function watchlistIdentity() {
      var profile = activeProfile();
      return [activeServer() && (activeServer().machineIdentifier || activeServer().uri) || applicationConfig.apiBaseUrl || '',
        profile && (profile.id || profile.uuid || profile.title) || 'local'].join('|');
    }

    function mediaIdentity() {
      var profile = activeProfile();
      return {
        server: activeServer() && (activeServer().machineIdentifier || activeServer().uri) || applicationConfig.apiBaseUrl || 'local',
        profile: profile && (profile.id || profile.uuid || profile.title) || 'local'
      };
    }

    function track(list, request) {
      if (request && typeof request.abort === 'function') { list.push(request); }
      return request || null;
    }

    function untrack(list, request) {
      var index = list.indexOf(request);
      if (index !== -1) { list.splice(index, 1); }
    }

    function abortRequests(list) {
      while (list.length) {
        var request = list.pop();
        if (request && typeof request.abort === 'function') { request.abort(); }
      }
    }

    function createPin(_purpose, callback) {
      var requestGeneration = generation;
      var request = null;
      var completed = false;
      if (destroyed) { call(callback, new Error('account unavailable')); return null; }
      request = PlexAuth.createPin(platformRoot, authOptions, function (error, pin) {
        completed = true;
        untrack(accountRequests, request);
        if (destroyed || requestGeneration !== generation) { return; }
        call(callback, error || null, pin || null);
      });
      if (!completed) { track(accountRequests, request); }
      return request || null;
    }

    function pollPin(pinId, callback) {
      var requestGeneration = generation;
      var request = null;
      var completed = false;
      if (destroyed) { call(callback, new Error('account unavailable')); return null; }
      request = PlexAuth.pollPin(platformRoot, pinId, authOptions, function (error, pin) {
        completed = true;
        untrack(accountRequests, request);
        if (destroyed || requestGeneration !== generation) { return; }
        call(callback, error || null, pin || null);
      });
      if (!completed) { track(accountRequests, request); }
      return request || null;
    }

    function loadAccountServers(token, callback) {
      var requestGeneration = generation;
      var request = null;
      var completed = false;
      if (destroyed) { call(callback, new Error('account unavailable')); return null; }
      authStateValue.ownerToken = String(token || ownerToken());
      saveAuth(authStateValue);
      request = PlexAuth.loadAccountServers(platformRoot, ownerToken(), authOptions, function (error, incoming) {
        completed = true;
        untrack(accountRequests, request);
        if (destroyed || requestGeneration !== generation) { return; }
        if (!error) { mergeServers(incoming || []); }
        call(callback, error || null, error ? [] : servers());
      });
      if (!completed) { track(accountRequests, request); }
      return request || null;
    }

    function loadProfiles(token, callback) {
      var requestGeneration = generation;
      var previous = activeProfile();
      var request = null;
      var completed = false;
      if (destroyed) { call(callback, new Error('account unavailable')); return null; }
      authStateValue.ownerToken = String(token || ownerToken());
      saveAuth(authStateValue);
      request = PlexAuth.loadHomeUsers(platformRoot, ownerToken(), authOptions, function (error, incoming) {
        var merged;
        var index;
        completed = true;
        untrack(accountRequests, request);
        if (destroyed || requestGeneration !== generation) { return; }
        if (error) { call(callback, error); return; }
        merged = AuthStore.mergeProfiles(authStateValue.profiles, incoming || []);
        if (previous) {
          for (index = 0; index < merged.length; index += 1) {
            if (AuthStore.sameProfile(merged[index], previous)) { authStateValue.activeProfileId = merged[index].id; break; }
          }
        }
        authStateValue.profiles = merged;
        saveAuth(authStateValue);
        call(callback, null, copyProfiles(merged));
      });
      if (!completed) { track(accountRequests, request); }
      return request || null;
    }

    function completeProfile(profile, token, accountToken, machineIdentifier, connectionUri, extraProfiles, callback) {
      var updated = {
        id: profile.id,
        uuid: profile.uuid,
        title: profile.title,
        protected: profile.protected,
        thumb: profile.thumb,
        token: token || profile.token,
        accountToken: accountToken || profile.accountToken,
        serverMachineIdentifier: machineIdentifier || profile.serverMachineIdentifier,
        serverConnectionUri: connectionUri || profile.serverConnectionUri
      };
      authStateValue.profiles = AuthStore.mergeProfiles(authStateValue.profiles, [updated].concat(extraProfiles || []));
      authStateValue.mode = 'plex';
      authStateValue.activeProfileId = profile.id;
      authStateValue.setupComplete = true;
      saveAuth(authStateValue);
      call(callback, null, copyObject(updated));
    }

    function switchProfile(profile, pin, switchOptions, callback) {
      var optionsValue = switchOptions || {};
      var selected = optionsValue.selectedServer || activeServer();
      var accountToken;
      var request = null;
      var cancelled = false;
      var requestGeneration = generation;
      function active() {
        return !destroyed && !cancelled && requestGeneration === generation &&
          (typeof optionsValue.isActive !== 'function' || optionsValue.isActive() !== false);
      }
      function setRequest(next) {
        if (request) { untrack(accountRequests, request); }
        request = next || null;
        if (cancelled && request && request.abort) { request.abort(); }
        else { track(accountRequests, request); }
      }
      function finish(error, result) {
        if (request) { untrack(accountRequests, request); request = null; }
        if (active()) { call(callback, error || null, result || null); }
      }
      function resolveAccess(token) {
        var preferredUri;
        if (!selected || !selected.machineIdentifier) { finish(new Error('Plex server access unavailable')); return; }
        preferredUri = String(optionsValue.preferredConnectionUri || selected.uri || '');
        setRequest(PlexAuth.loadServerAccess(platformRoot, token, selected.machineIdentifier, authOptions, function (error, access) {
          var candidates;
          var preferredIndex;
          if (!active()) { return; }
          if (error || !access || !access.token) { finish(error || new Error('Plex server access unavailable')); return; }
          candidates = (access.connections || []).slice();
          if (preferredUri) {
            preferredIndex = candidates.indexOf(preferredUri);
            if (preferredIndex !== -1) { candidates.splice(preferredIndex, 1); }
            candidates.unshift(preferredUri);
          }
          setRequest(PlexAuth.findReachableConnection(platformRoot, access.token, candidates, selected.machineIdentifier, authOptions, function (connectionError, connectionUri) {
            if (!active()) { return; }
            if (connectionError || !connectionUri) { finish(connectionError || new Error('No reachable Plex connection')); return; }
            verifyRemoteConnections(selected, access.token, access.connections, access.connectionRoutes);
            if (request) { untrack(accountRequests, request); request = null; }
            completeProfile(profile, access.token, token, selected.machineIdentifier, connectionUri, optionsValue.profiles, callback);
          }));
        }));
      }
      function abort() {
        cancelled = true;
        if (request && request.abort) { request.abort(); }
        untrack(accountRequests, request);
        request = null;
      }
      if (destroyed || !profile) { call(callback, new Error('Plex profile unavailable')); return null; }
      if (profile.token && selected && profile.serverMachineIdentifier === selected.machineIdentifier) {
        completeProfile(profile, profile.token, profile.accountToken, profile.serverMachineIdentifier, profile.serverConnectionUri, optionsValue.profiles, callback);
        return null;
      }
      accountToken = profile.accountToken || (!profile.serverMachineIdentifier ? profile.token : '');
      if (accountToken) {
        resolveAccess(accountToken);
        return { abort: abort };
      }
      setRequest(PlexAuth.switchHomeUser(platformRoot, ownerToken(), profile, pin || '', authOptions, function (error, token) {
        if (!active()) { return; }
        if (error || !token) { finish(error || new Error('Plex profile token missing')); return; }
        resolveAccess(token);
      }));
      return { abort: abort };
    }

    function continueOffline() {
      if (destroyed) { return authSnapshot(); }
      authStateValue.mode = 'offline';
      authStateValue.activeProfileId = '';
      authStateValue.setupComplete = true;
      return saveAuth(authStateValue);
    }

    function completeOfflineSetup() {
      if (destroyed || setupComplete() || !serverStateValue.activeUri) { return authSnapshot(); }
      authStateValue.setupComplete = true;
      authStateValue.mode = 'offline';
      return saveAuth(authStateValue);
    }

    function needsOnboarding() { return AuthStore.needsOnboarding(serverStateValue, authStateValue); }

    function reloadApplication() {
      call(lifecycle.reload);
    }

    function disconnect() {
      if (destroyed) { return authSnapshot(); }
      saveAuth(AuthStore.disconnect(authStateValue));
      call(lifecycle.whenCredentialsIdle, reloadApplication);
      return authSnapshot();
    }

    function deleteLocalData() {
      if (destroyed) { return false; }
      if (LocalData) { LocalData.clear(storage); }
      try { if (credentialStorage && credentialStorage.removeItem) { credentialStorage.removeItem(AuthStore.STORAGE_KEY); } }
      catch (_error) {}
      authStateValue = AuthStore.emptyState();
      call(lifecycle.whenCredentialsIdle, reloadApplication);
      return true;
    }

    function applyNavigation(items) { call(application.applyNavigation, items || []); }
    function loadHome() { call(application.loadHome); }
    function preloadWatchlist() { if (watchlistAvailable()) { call(application.preloadWatchlist); } }

    function loadApplication() {
      var loadGeneration;
      var navigationRequest = null;
      var profileRequest = null;
      var navigationCompleted = false;
      var profileCompleted = false;
      if (destroyed || !applicationConfig.apiBaseUrl || !PlexClient) { return false; }
      applicationGeneration += 1;
      loadGeneration = applicationGeneration;
      abortRequests(applicationRequests);
      start();
      navigationRequest = PlexClient.loadNavigation(applicationConfig, function (error, items) {
        navigationCompleted = true;
        untrack(applicationRequests, navigationRequest);
        if (destroyed || loadGeneration !== applicationGeneration) { return; }
        if (error) {
          attemptFailover(error, function (switched) {
            if (destroyed || loadGeneration !== applicationGeneration) { return; }
            if (switched) { loadApplication(); return; }
            loadHome();
          });
          return;
        }
        clearFailedRoutes();
        if (items && items.length) { applyNavigation(items); }
        loadHome();
        preloadWatchlist();
        call(application.loaded, snapshot());
      });
      if (!navigationCompleted) { track(applicationRequests, navigationRequest); }
      if (!applicationConfig.token) { return true; }
      profileRequest = PlexClient.loadAccountProfile(applicationConfig, function (error, account) {
        profileCompleted = true;
        untrack(applicationRequests, profileRequest);
        if (destroyed || loadGeneration !== applicationGeneration) { return; }
        if (!error && account) { call(application.seedAccountSettings, account); }
      });
      if (!profileCompleted) { track(applicationRequests, profileRequest); }
      return true;
    }

    function loadServerIdentity(callback) {
      if (destroyed || !applicationConfig.apiBaseUrl || !PlexClient || typeof PlexClient.loadServerIdentity !== 'function') {
        return null;
      }
      return PlexClient.loadServerIdentity(applicationConfig, callback);
    }

    function bootstrap() {
      var current = serverState();
      var selected = serverForUri(current.activeUri);
      if (destroyed) { return false; }
      call(application.persistSettings);
      call(presentation.renderProfile);
      if (needsOnboarding()) {
        call(transitions.openSetup, snapshot());
        return 'setup';
      }
      completeOfflineSetup();
      if (!selected && configuredServer) { selected = serverForUri(configuredServer.uri) || configuredServer; }
      if (!selected && servers().length) { selected = servers()[0]; }
      if (selected) {
        applyServer(selected);
        resumeRemoteVerification(selected);
      }
      if (applicationConfig.apiBaseUrl) { loadApplication(); }
      discover(function () {
        if (destroyed) { return; }
        if (!applicationConfig.apiBaseUrl && servers().length) {
          applyServer(servers()[0]);
          loadApplication();
        }
      });
      return true;
    }

    function onNetworkSnapshot(next) {
      var result;
      var localAvailable;
      if (destroyed) { return; }
      result = networkTransition.update(next, activeServer());
      networkValue = copyNetwork(next);
      localAvailable = allowsLocal();
      publishState();
      call(presentation.renderNetwork, networkSnapshot());
      if (!localAvailable) { call(application.stopHomePolling); return; }
      if (!result.localWasAvailable || result.cloudRecovered) {
        call(application.recoverAfterNetwork, result, networkSnapshot());
        call(application.scheduleHomePolling);
      }
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      generation += 1;
      applicationGeneration += 1;
      if (manualProbeRequest && typeof manualProbeRequest.abort === 'function') { manualProbeRequest.abort(); }
      manualProbeRequest = null;
      abortRequests(applicationRequests);
      abortRequests(accountRequests);
      if (typeof networkUnsubscribe === 'function') { networkUnsubscribe(); }
      networkUnsubscribe = null;
      if (networkState && typeof networkState.destroy === 'function') { networkState.destroy(); }
      if (controller && typeof controller.destroy === 'function') { controller.destroy(); }
      if (editor && typeof editor.destroy === 'function') { editor.destroy(); }
    }

    if (!ServerController || typeof ServerController.create !== 'function') { throw new Error('ServerFeatureController requires ServerController'); }
    if (!ServerEditorView || typeof ServerEditorView.create !== 'function') { throw new Error('ServerFeatureController requires ServerEditorView'); }
    if (!ServerDiscovery || !ServerStore || !AuthStore || !NetworkState || !NetworkTransition || !PlexAuth) {
      throw new Error('ServerFeatureController requires server, account, and network modules');
    }

    serverStateValue = ServerStore.load(storage);
    authStateValue = AuthStore.load(credentialStorage);
    configuredServer = configuredServer || ServerStore.fromConfig(applicationConfig);
    if (configuredServer) {
      serverStateValue = ServerStore.validate({
        activeUri: serverStateValue.activeUri,
        servers: ServerStore.merge(serverStateValue.servers, [configuredServer])
      });
    }
    networkState = NetworkState.create(platformRoot);
    networkValue = networkState.snapshot();
    networkTransition = NetworkTransition.create(networkValue, function (server) { resumeRemoteVerification(server); });

    editor = ServerEditorView.create({
      document: document,
      t: presentation.t,
      element: presentation.element,
      appendAddresses: appendAddresses,
      keepFocusVisible: presentation.keepFocusVisible,
      isPointerSelectionActive: function () { return call(presentation.pointerActive) === true; }
    });

    controller = ServerController.create({
      root: platformRoot,
      clock: function () { return new Date().getTime(); },
      modules: {
        ActivityState: modules.ActivityState,
        NetworkPolicy: modules.NetworkPolicy,
        PlexAuth: PlexAuth,
        PlexClient: PlexClient,
        ServerDiscovery: ServerDiscovery,
        ServerStore: ServerStore
      },
      storage: storage,
      authOptions: authOptions,
      discoveryConfig: function () {
        return typeof config.discovery === 'function' ? (config.discovery() || {}) : (config.discovery || applicationConfig);
      },
      connectionUris: connectionUris,
      networkSnapshot: networkSnapshot,
      networkAllowsCloud: allowsCloud,
      session: { read: readSession, update: updateSession },
      auth: { mode: authMode, activeProfile: activeProfile, activeToken: activeToken, persistConnection: persistConnection },
      presentation: {
        renderActivities: function (activities) { if (!destroyed) { call(presentation.renderActivities, activities || []); } },
        renderEditor: renderEditor,
        renderProfile: function () { if (!destroyed) { call(presentation.renderProfile); } },
        renderSettings: function () { if (!destroyed) { call(presentation.renderSettings); } },
        editorOpen: function () { return !destroyed && editorSnapshot().open; },
        openEditor: openEditor,
        closeEditor: closeEditor
      },
      lifecycle: {
        persistRemoteState: persistRemoteState,
        resetContent: function () { if (!destroyed) { call(lifecycle.resetContent); } }
      }
    });

    networkUnsubscribe = networkState.subscribe(onNetworkSnapshot);
    publishState();

    return {
      activateEditor: activateEditor,
      activeProfile: activeProfile,
      activeServer: activeServer,
      addressesFor: addressesFor,
      allowsCloud: allowsCloud,
      allowsLocal: allowsLocal,
      applyServer: applyServer,
      authMode: authMode,
      authSnapshot: authSnapshot,
      bootstrap: bootstrap,
      closeEditor: closeEditor,
      continueOffline: continueOffline,
      createPin: createPin,
      deleteLocalData: deleteLocalData,
      destroy: destroy,
      disconnect: disconnect,
      discover: discover,
      editorSnapshot: editorSnapshot,
      focusEditor: focusEditor,
      loadAccountServers: loadAccountServers,
      loadApplication: loadApplication,
      loadProfiles: loadProfiles,
      loadServerIdentity: loadServerIdentity,
      mediaIdentity: mediaIdentity,
      networkSnapshot: networkSnapshot,
      normalizeManualAddress: normalizeManualAddress,
      openEditor: openEditor,
      ownerToken: ownerToken,
      pollPin: pollPin,
      probeManualAddress: probeManualAddress,
      profiles: profiles,
      renderEditor: renderEditor,
      servers: servers,
      setupComplete: setupComplete,
      shouldOfferConnection: shouldOfferConnection,
      snapshot: snapshot,
      subscribeNetwork: subscribeNetwork,
      switchProfile: switchProfile,
      waitForActivity: waitForActivity,
      watchlistAccountToken: watchlistAccountToken,
      watchlistAvailable: watchlistAvailable,
      watchlistIdentity: watchlistIdentity
    };
  }

  return { create: create };
}));
