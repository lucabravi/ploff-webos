  // Onboarding, account linking, editors, profile switching, and diagnostics.
  var setupScanIndicator = SetupScanIndicator.create({
    root: root,
    shouldContinue: function () { return appView === 'setup' && setupStage === 'servers' && serverDiscoveryActive && !serverState.servers.length; },
    message: function (count) {
      setText('setup-message', t('setup.findServerMessage') + ' ' + new Array(count + 1).join('.'));
    }
  });

  function stopSetupScanMessage() { setupScanIndicator.stop(); }

  function startSetupScanMessage() {
    if (serverDiscoveryActive && !serverState.servers.length) { setupScanIndicator.start(); }
  }

  var setupFocus = SetupFocus.create({
    buttons: function () { return document.querySelectorAll('#setup-view button'); },
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  var setupView = SetupView.create({
    document: document,
    element: element,
    setText: setText,
    t: t,
    languages: setupUiLanguages,
    presentation: function () {
      return {
        activeLanguage: appSettings.uiLanguage,
        activeProfileId: authState.activeProfileId,
        ownerToken: authState.ownerToken,
        serverDiscoveryActive: serverDiscoveryActive,
        manualAddress: config.apiBaseUrl || '',
        loginPin: setupPin,
        statusKey: setupStatusKey
      };
    },
    focus: function (index) { setupFocus.apply(index); },
    scanIndicator: setupScanIndicator
  });

  var setupAuthSession = SetupAuthSession.create({
    root: root,
    createPin: function (purpose, callback) { return PlexAuth.createPin(root, authOptions, callback); },
    pollPin: function (pinId, callback) { return PlexAuth.pollPin(root, pinId, authOptions, callback); },
    onState: function (snapshot) {
      setupPin = snapshot.pin;
      if (snapshot.phase === 'idle' || appView !== 'setup' || setupStage !== 'login') { return; }
      if (snapshot.phase === 'expired') { setupStatusKey = 'setup.loginExpired'; }
      else if (snapshot.phase === 'error') { setupStatusKey = 'setup.loginUnavailable'; }
      else { setupStatusKey = 'setup.loginWaiting'; }
      setupView.render(setupController.snapshot());
    },
    onAuthenticated: function (result) {
      if (appView !== 'setup' || setupStage !== 'login' || !result || !result.token) { return; }
      setupController.activate('login-authenticated', result);
    }
  });

  function renderSetupControllerState(snapshot) {
    setupStage = snapshot.stage;
    setupStatusKey = snapshot.statusKey;
    if (appView === 'setup') { setupView.render(snapshot); }
  }

  setupController = SetupController.create({
    root: root,
    authSession: setupAuthSession,
    render: renderSetupControllerState,
    scan: function (snapshot, callback) {
      serverDiscoveryActive = true;
      startSetupScanMessage();
      ServerDiscovery.discover(root, config, function (servers) {
        serverDiscoveryActive = false;
        stopSetupScanMessage();
        serverState.servers = ServerStore.merge(serverState.servers, servers);
        serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        callback(null, serverState.servers);
      });
      return null;
    },
    selectLanguage: function (language) {
      appSettings.uiLanguage = language;
      appSettings.uiLanguageExplicit = true;
      appSettings = Settings.save(root.localStorage, appSettings);
      homeDomDirty = true;
    },
    normalizeManualAddress: ServerDiscovery.normalizeCandidate,
    probeManualAddress: function (uri, callback) {
      ServerDiscovery.probe(root, uri, '', config.discoveryTimeout || 1800, function (server) {
        if (!server) { callback(new Error('Plex server unavailable')); return; }
        serverState.servers = ServerStore.merge(serverState.servers, [server]);
        serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        callback(null, serverForIdentity(server) || server);
      });
      return null;
    },
    shouldOfferConnection: ServerDiscovery.shouldOfferLocalConnection,
    loadAccountServers: function (ownerToken, callback) {
      authState.ownerToken = ownerToken || authState.ownerToken;
      authState = AuthStore.save(root.localStorage, authState);
      return PlexAuth.loadAccountServers(root, authState.ownerToken, authOptions, function (error, servers) {
        if (!error) {
          serverState.servers = ServerStore.merge(serverState.servers, servers);
          serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        }
        callback(error, error ? [] : serverState.servers);
      });
    },
    loadProfiles: function (ownerToken, callback) {
      var previousActiveProfile = AuthStore.activeProfile(authState);
      authState.ownerToken = ownerToken || authState.ownerToken;
      authState = AuthStore.save(root.localStorage, authState);
      return PlexAuth.loadHomeUsers(root, authState.ownerToken, authOptions, function (error, profiles) {
        var merged;
        var index;
        if (error) { callback(error); return; }
        merged = AuthStore.mergeProfiles(authState.profiles, profiles);
        if (previousActiveProfile) {
          for (index = 0; index < merged.length; index += 1) {
            if (AuthStore.sameProfile(merged[index], previousActiveProfile)) { authState.activeProfileId = merged[index].id; break; }
          }
        }
        authState.profiles = merged;
        authState = AuthStore.save(root.localStorage, authState);
        callback(null, merged);
      });
    },
    switchProfile: function (profile, pin, callback) { return switchSetupProfile(profile, pin, callback); },
    continueOffline: function () {
      authState.mode = 'offline'; authState.activeProfileId = ''; authState.setupComplete = true;
      authState = AuthStore.save(root.localStorage, authState);
    },
    disconnect: function () {
      authState = AuthStore.save(root.localStorage, AuthStore.disconnect(authState));
    },
    finish: function (snapshot) { finishSetup(snapshot); },
    cancel: function (snapshot) { cancelSetup(snapshot); }
  });

  function completeSetupProfile(profile, token, accountToken, machineIdentifier, connectionUri, callback) {
    var setupSnapshot = setupController.snapshot();
    var updated = {
      id: profile.id, uuid: profile.uuid, title: profile.title, protected: profile.protected,
      thumb: profile.thumb, token: token || profile.token,
      accountToken: accountToken || profile.accountToken,
      serverMachineIdentifier: machineIdentifier || profile.serverMachineIdentifier,
      serverConnectionUri: connectionUri || profile.serverConnectionUri
    };
    authState.profiles = AuthStore.mergeProfiles(authState.profiles, [updated].concat(setupSnapshot.profiles));
    authState.mode = 'plex'; authState.activeProfileId = profile.id; authState.setupComplete = true;
    authState = AuthStore.save(root.localStorage, authState);
    if (callback) { callback(null, updated); }
    else { finishSetup(); }
  }

  function persistRemoteConnectionState(server, connections, status, connectionRoutes) {
    var current = serverForIdentity(server) || server;
    var updated = ServerStore.withRemoteConnections(current, connections, status, new Date().getTime(), connectionRoutes);
    if (!updated) { return; }
    replaceStoredServer(updated);
    if (activeServer && (
      (updated.machineIdentifier && updated.machineIdentifier === activeServer.machineIdentifier) ||
      updated.uri === activeServer.uri
    )) {
      activeServer = updated;
    }
  }

  function verifyRemoteConnectionsInBackground(server, token, connections, connectionRoutes) {
    var verificationKey = String(server && (server.machineIdentifier || server.uri) || '');
    var remoteConnections = (connections || []).filter(function (uri) {
      return !ServerDiscovery.isLocalCandidate(uri);
    });
    if (!verificationKey || remoteConnectionVerificationStarted[verificationKey]) { return; }
    remoteConnectionVerificationStarted[verificationKey] = true;
    persistRemoteConnectionState(server, connections, remoteConnections.length ? 'pending' : 'unavailable', connectionRoutes);
    if (!remoteConnections.length) { return; }
    root.setTimeout(function () {
      PlexAuth.findReachableConnection(root, token, remoteConnections, server.machineIdentifier, authOptions, function (error) {
        persistRemoteConnectionState(server, connections, error ? 'failed' : 'linked', connectionRoutes);
        if (serverEditorView.snapshot().open) { renderServerEditor(); }
      });
    }, 0);
  }

  function resumeRemoteConnectionVerification(server) {
    var status = String(server && server.remoteLinkStatus || '');
    var token = AuthStore ? AuthStore.activeToken(authState, server && server.machineIdentifier) : '';
    if (!server || !token || status === 'linked' || status === 'unavailable') { return; }
    verifyRemoteConnectionsInBackground(server, token, server.connections || [], server.connectionRoutes || []);
  }

  function resolveSetupProfileAccess(profile, accountToken, generation, callback) {
    var setupSnapshot = setupController.snapshot();
    var server = setupSnapshot.selectedServer || activeServer;
    var preferredServer;
    var preferredIndex;
    if (!server || !server.machineIdentifier) {
      callback(new Error('Plex server access unavailable'));
      return;
    }
    preferredServer = {
      uri: setupSnapshot.preferredConnectionUri || server.uri,
      machineIdentifier: server.machineIdentifier
    };
    PlexAuth.loadServerAccess(root, accountToken, server.machineIdentifier, authOptions, function (error, access) {
      var candidates;
      if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
      if (error || !access || !access.token) {
        callback(error || new Error('Plex server access unavailable'));
        return;
      }
      candidates = access.connections.slice();
      if (preferredServer.uri) {
        preferredIndex = candidates.indexOf(preferredServer.uri);
        if (preferredIndex !== -1) { candidates.splice(preferredIndex, 1); }
        candidates.unshift(preferredServer.uri);
      }
      PlexAuth.findReachableConnection(root, access.token, candidates, server.machineIdentifier, authOptions, function (connectionError, connectionUri) {
        if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
        if (connectionError || !connectionUri) {
          callback(connectionError || new Error('No reachable Plex connection'));
          return;
        }
        verifyRemoteConnectionsInBackground(server, access.token, access.connections, access.connectionRoutes);
        completeSetupProfile(profile, access.token, accountToken, server.machineIdentifier, connectionUri, callback);
      });
    });
  }

  function switchSetupProfile(profile, pin, callback) {
    var generation;
    var setupSnapshot = setupController.snapshot();
    var server = setupSnapshot.selectedServer || activeServer;
    var accountToken;
    if (profile.token && server && profile.serverMachineIdentifier === server.machineIdentifier) {
      completeSetupProfile(profile, profile.token, profile.accountToken, profile.serverMachineIdentifier, profile.serverConnectionUri, callback);
      return null;
    }
    generation = setupAuthGeneration + 1; setupAuthGeneration = generation;
    accountToken = profile.accountToken || (!profile.serverMachineIdentifier ? profile.token : '');
    if (accountToken) { resolveSetupProfileAccess(profile, accountToken, generation, callback); return null; }
    return PlexAuth.switchHomeUser(root, authState.ownerToken, profile, pin || '', authOptions, function (error, token) {
      if (generation !== setupAuthGeneration) { return; }
      if (error || !token) {
        callback(error || new Error('Plex profile token missing'));
        return;
      }
      resolveSetupProfileAccess(profile, token, generation, callback);
    });
  }

  function finishSetup(snapshot) {
    var destination = snapshot.returnView;
    setupAuthSession.cancel(); setupAuthGeneration += 1; setupPin = null; setupStatusKey = '';
    if (snapshot.selectedServer) { applyServer(snapshot.selectedServer); }
    else if (activeServer) { applyServer(activeServer); }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    renderActiveProfile();
    if (destination === 'settings') {
      appView = 'settings'; renderAppSettings(); loadPlex();
    } else {
      revealHome({ focus: 'first', refresh: false });
      loadPlex(); discoverLocalServers();
    }
  }

  function cancelSetup(snapshot) {
    var destination = snapshot.returnView;
    setupAuthSession.cancel(); setupAuthGeneration += 1; setupPin = null; setupStatusKey = '';
    if (!snapshot.returnView) { setupController.activate('servers'); return; }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    restoreSetupReturnView(destination);
  }

  function restoreSetupReturnView(destination) {
    appView = destination || 'home';
    if (appView === 'settings') { renderAppSettings(); }
    else if (appView === 'search') { updateSearchFocus(); }
    else if (appView === 'library') { updateLibraryFocus(); }
    else if (appView === 'detail') { updateDetailFocus(); }
    else {
      revealHome({ focus: 'preserve', refresh: false });
    }
  }

  function setupLanguageIndex(language) {
    var index;
    for (index = 0; index < setupUiLanguages.length; index += 1) {
      if (setupUiLanguages[index].code === language) { return index; }
    }
    return 0;
  }

  function setupProfileIndex(profiles) {
    var index;
    for (index = 0; index < profiles.length; index += 1) {
      if (profiles[index].id === authState.activeProfileId) { return index; }
    }
    return 0;
  }

  function openSetup() {
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      firstRun: !authState.setupComplete,
      languageExplicit: appSettings.uiLanguageExplicit,
      language: appSettings.uiLanguage,
      servers: serverState.servers,
      profiles: AuthStore.mergeProfiles(authState.profiles, []),
      selectedServer: null,
      focusIndex: setupLanguageIndex(appSettings.uiLanguage),
      returnView: ''
    });
    completeStartup();
  }

  function openProfileManager() {
    var destination = appView;
    var profiles = AuthStore.mergeProfiles(authState.profiles, []);
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      stage: authState.ownerToken || authState.profiles.length ? 'profiles' : 'access',
      scan: false,
      languageExplicit: true,
      language: appSettings.uiLanguage,
      servers: serverState.servers,
      profiles: profiles,
      selectedServer: activeServer,
      preferredConnectionUri: config.apiBaseUrl || (activeServer && activeServer.uri) || '',
      focusIndex: setupProfileIndex(profiles),
      returnView: destination
    });
    if (authState.ownerToken) { setupController.activate('load-profiles', { token: authState.ownerToken }); }
  }

  function openManualServerSetup() {
    serverEditorView.close();
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      stage: 'manual', scan: false, languageExplicit: true, language: appSettings.uiLanguage,
      servers: serverState.servers, profiles: AuthStore.mergeProfiles(authState.profiles, []),
      selectedServer: activeServer,
      preferredConnectionUri: config.apiBaseUrl || (activeServer && activeServer.uri) || '',
      returnView: 'settings'
    });
  }

  function activateSetupAction(action) {
    var payload = null;
    if (action === 'connect-manual') { payload = { address: document.getElementById('setup-address').value }; }
    else if (action === 'account-servers' || action === 'load-profiles') { payload = { token: authState.ownerToken }; }
    setupController.activate(action, payload);
  }

  function activateSetupButton(button) {
    var index;
    if (button.hasAttribute('data-setup-language')) {
      index = Number(button.getAttribute('data-setup-language'));
      if (setupUiLanguages[index]) { setupController.activate('language', setupUiLanguages[index].code); }
      return;
    }
    if (button.hasAttribute('data-setup-action')) { activateSetupAction(button.getAttribute('data-setup-action')); return; }
    if (button.hasAttribute('data-setup-server')) {
      index = Number(button.getAttribute('data-setup-server'));
      setupController.activate('select-server', index); return;
    }
    if (button.hasAttribute('data-setup-profile')) {
      index = Number(button.getAttribute('data-setup-profile'));
      if (setupController.snapshot().profiles[index]) { setupController.activate('select-profile', index); }
    }
  }
