  var serverEditorView = ServerEditorView.create({
    document: document,
    t: t,
    element: element,
    appendAddresses: appendServerEditorAddresses,
    keepFocusVisible: keepPanelFocusVisible,
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  function renderServerEditor() {
    var viewState = serverEditorView.snapshot();
    serverEditorView.render({
      activeUri: activeServer && activeServer.uri,
      addressesFor: function (server) { return serverConnectionAddresses(server, true); },
      index: viewState.index,
      open: viewState.open,
      servers: serverState.servers
    });
  }

  function serverConnectionAddresses(server, compactDirect) {
    var value = server || {};
    var connections = (value.connections || []).slice();
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var directCount = 0;
    var localHosts = [];
    var result = [];
    var matchesActive = activeServer && (
      (value.machineIdentifier && value.machineIdentifier === activeServer.machineIdentifier) || value.uri === activeServer.uri
    );
    if (matchesActive && config.apiBaseUrl) { connections.push(config.apiBaseUrl); }
    if (matchesActive && profile && profile.serverConnectionUri) { connections.push(profile.serverConnectionUri); }
    connections = ServerStore.connectionUris({ uri: value.uri, connections: connections });
    connections.forEach(function (uri) {
      var host = String(uri).match(/^https?:\/\/([^/:]+)/i);
      if (ServerDiscovery.isLocalCandidate(uri) && host) { localHosts.push(host[1]); }
    });
    connections.forEach(function (uri) {
      var host = String(uri).match(/^https?:\/\/([^/:]+)/i);
      var direct = host && host[1].match(/^(\d+)-(\d+)-(\d+)-(\d+)\..*\.plex\.direct$/i);
      var embeddedHost = direct ? [direct[1], direct[2], direct[3], direct[4]].join('.') : '';
      if (compactDirect && direct) {
        if (localHosts.indexOf(embeddedHost) === -1) { directCount += 1; }
        return;
      }
      result.push({ kind: ServerDiscovery.isLocalCandidate(uri) ? 'local' : 'remote', uri: uri });
    });
    if (compactDirect && directCount) { result.push({ kind: 'direct', count: directCount, uri: '' }); }
    return result;
  }

  function appendServerEditorAddresses(row, addresses) {
    var container = element('span', 'server-editor-addresses');
    var index;
    var labelKey;
    for (index = 0; index < addresses.length; index += 1) {
      if (addresses[index].kind === 'direct') {
        container.appendChild(element('span', 'server-editor-meta', t('settings.remoteDirect') + ': ' + t('settings.addressCount', { count: addresses[index].count })));
        continue;
      }
      labelKey = addresses[index].kind === 'local' ? 'settings.localAddress' : 'settings.remoteAddress';
      container.appendChild(element('span', 'server-editor-meta', t(labelKey) + ': ' + addresses[index].uri));
    }
    row.appendChild(container);
  }

  function replaceStoredServer(server) {
    var index;
    var replaced = false;
    var servers = serverState.servers.slice();
    for (index = 0; index < servers.length; index += 1) {
      if ((server.machineIdentifier && servers[index].machineIdentifier === server.machineIdentifier) || servers[index].uri === server.uri) {
        servers[index] = server;
        replaced = true;
        break;
      }
    }
    if (!replaced) { servers.push(server); }
    serverState = ServerStore.save(root.localStorage, servers, server.uri);
  }

  function activateServerConnection(uri) {
    var promoted;
    if (!activeServer || !uri) { return false; }
    promoted = ServerStore.preferConnection(activeServer, uri);
    if (!promoted) { return false; }
    activeServer = promoted;
    config.apiBaseUrl = promoted.uri;
    replaceStoredServer(promoted);
    if (AuthStore && authState.mode === 'plex') {
      authState = AuthStore.setActiveProfileConnection(authState, promoted.machineIdentifier, promoted.uri);
      authState = AuthStore.save(root.localStorage, authState);
    }
    renderActiveProfile();
    if (appView === 'settings') { renderAppSettings(); }
    return true;
  }

  function attemptServerFailover(error, callback) {
    var currentUri = ServerStore.normalizeUri(config.apiBaseUrl);
    var candidates;
    if (!activeServer || !PlexAuth || !PlexAuth.findReachableConnection || serverFailoverRequest) { callback(false, error); return; }
    if (currentUri) { serverFailoverFailedUris[currentUri] = true; }
    candidates = serverConnectionAddresses(activeServer).map(function (address) { return address.uri; }).filter(function (uri) {
      return !serverFailoverFailedUris[uri];
    });
    if (!candidates.length) { callback(false, error); return; }
    serverFailoverRequest = PlexAuth.findReachableConnection(root, config.token || '', candidates, activeServer.machineIdentifier, authOptions, function (connectionError, uri) {
      serverFailoverRequest = null;
      if (connectionError || !uri || !activateServerConnection(uri)) { callback(false, error || connectionError); return; }
      callback(true, null);
    });
  }

  function openServerEditor() {
    serverEditorView.open();
    renderAppSettings();
  }

  function closeServerEditor() {
    serverEditorView.close();
    renderAppSettings();
  }

  function serverForUri(uri) {
    var index;
    for (index = 0; index < serverState.servers.length; index += 1) {
      if (serverState.servers[index].uri === uri) { return serverState.servers[index]; }
    }
    return null;
  }

  function serverForIdentity(server) {
    var index;
    if (!server) { return null; }
    for (index = 0; index < serverState.servers.length; index += 1) {
      if ((server.machineIdentifier && serverState.servers[index].machineIdentifier === server.machineIdentifier) || serverState.servers[index].uri === server.uri) {
        return serverState.servers[index];
      }
    }
    return null;
  }

  function applyServer(server) {
    var cachedToken;
    var profile;
    var previousIdentity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    var nextIdentity;
    if (!server) { return; }
    if (serverFailoverRequest && serverFailoverRequest.abort) { serverFailoverRequest.abort(); }
    serverFailoverRequest = null;
    serverFailoverFailedUris = {};
    activeServer = server;
    config.apiBaseUrl = server.uri;
    cachedToken = AuthStore ? AuthStore.activeToken(authState, server.machineIdentifier) : '';
    profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    if (cachedToken && profile && profile.serverConnectionUri) { config.apiBaseUrl = profile.serverConnectionUri; }
    config.token = cachedToken || (authState.mode !== 'plex' && server.uri === ServerStore.normalizeUri(configuredApiBaseUrl) ? configuredToken : '');
    serverState = ServerStore.save(root.localStorage, serverState.servers, server.uri);
    nextIdentity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    if (previousIdentity !== nextIdentity && homeRefreshCoordinator) {
      if (serverActivityRequest && serverActivityRequest.abort) { serverActivityRequest.abort(); }
      serverActivityRequest = null;
      root.clearTimeout(serverActivityPollTimer);
      serverActivities = [];
      serverActivityFingerprint = '';
      serverActivityWaiters = [];
      renderServerActivities();
      homeRefreshCoordinator.reset();
      watchlistView.reset();
      posterLoader.cancelScope('home');
      data.rows = [];
      homeDomDirty = true;
      lastHomeSelectionKey = '';
      document.getElementById('content').innerHTML = '';
    }
  }

  function discoverLocalServers(callback) {
    if (!ServerDiscovery || serverDiscoveryActive) { if (callback) { callback(); } return; }
    serverDiscoveryActive = true;
    if (serverEditorView.snapshot().open) { renderServerEditor(); }
    ServerDiscovery.discover(root, config, function (servers) {
      serverDiscoveryActive = false;
      serverState.servers = ServerStore.merge(serverState.servers, servers);
      serverState = ServerStore.save(root.localStorage, serverState.servers, activeServer ? activeServer.uri : serverState.activeUri);
      if (serverEditorView.snapshot().open) {
        serverEditorView.focus(serverEditorView.snapshot().index, serverState.servers.length + 2);
        renderServerEditor();
      }
      if (config.apiBaseUrl && serverFailoverFailedUris[ServerStore.normalizeUri(config.apiBaseUrl)] && !serverFailoverRequest) {
        loadPlex();
      }
      if (callback) { callback(); }
    });
  }

  function activeProfileTitle() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return authState.mode === 'plex' && profile ? profile.title : t('settings.localNoAuth');
  }

  function renderActiveProfile() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var button = document.getElementById('active-profile');
    var avatar = document.getElementById('active-profile-avatar');
    var initial = document.getElementById('active-profile-initial');
    if (authState.mode !== 'plex' && authState.setupComplete) {
      button.className = 'active-profile is-offline';
      button.disabled = false;
      setText('active-profile-name', t('profile.offline'));
      avatar.style.display = 'none';
      avatar.removeAttribute('src');
      initial.style.display = 'none';
      button.setAttribute('data-nav-index', navigationItems.length + 1);
      return;
    }
    if (!profile) {
      button.className = 'active-profile is-hidden';
      button.disabled = true;
      button.removeAttribute('data-nav-index');
      return;
    }
    button.className = 'active-profile';
    button.disabled = false;
    button.setAttribute('data-nav-index', navigationItems.length + 1);
    setText('active-profile-name', profile.title);
    setText('active-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
    avatar.style.display = profile.thumb ? 'block' : 'none';
    avatar.src = profile.thumb || '';
    avatar.onerror = function () { avatar.style.display = 'none'; initial.style.display = 'flex'; };
    initial.style.display = profile.thumb ? 'none' : 'flex';
  }

  function renderServerActivities() {
    var button = document.getElementById('server-activity');
    var panel = document.getElementById('server-activity-panel');
    var focused = button.className.indexOf('is-focused') !== -1;
    var index;
    var activity;
    var row;
    var title = serverActivities.length ? (serverActivities[0].title || t('activity.working')) : '';
    var homeRefreshing = homeRefreshVisualActive && !serverActivities.length;
    if (serverActivities.length > 1) { title += ' ' + t('activity.more', { count: serverActivities.length - 1 }); }
    button.className = 'server-activity ' + (serverActivities.length ? 'is-active' : (homeRefreshing ? 'is-home-refreshing' : 'is-idle')) + (focused ? ' is-focused' : '');
    button.setAttribute('data-nav-index', navigationItems.length);
    button.setAttribute('aria-label', t('activity.label') + (title ? ': ' + title : ''));
    button.setAttribute('title', t('activity.label'));
    setText('server-activity-title', title);
    if (appView === 'detail') {
      if (title) { showDetailMetadataStatus(title, false); }
      else if (detailRefreshPending) { showDetailMetadataStatus(t('status.refreshing'), false); }
      else if (!detailMetadataStatusTemporary) { hideDetailMetadataStatus(); }
    }
    panel.innerHTML = '';
    if (!serverActivities.length) {
      panel.appendChild(element('div', 'activity-empty', t('activity.idle')));
      return;
    }
    for (index = 0; index < serverActivities.length; index += 1) {
      activity = serverActivities[index];
      row = element('div', 'activity-row');
      row.appendChild(element('span', 'activity-heading', activity.title || t('activity.working')));
      if (activity.subtitle) { row.appendChild(element('span', 'activity-subtitle', activity.subtitle)); }
      if (activity.progress >= 0) { renderActivityProgress(row, activity); }
      panel.appendChild(row);
    }
  }

  function renderActivityProgress(row, activity) {
    var progress = element('span', 'activity-progress');
    var value = element('span', 'activity-progress-value');
    value.style.width = Math.max(0, Math.min(100, activity.progress)) + '%';
    progress.appendChild(value);
    row.appendChild(progress);
  }

  function processServerActivityWaiters() {
    var now = new Date().getTime();
    var remaining = [];
    var completed = [];
    serverActivityWaiters.forEach(function (entry) {
      if (ActivityState.advanceWaiter(entry.waiter, serverActivities, now)) { completed.push(entry.callback); }
      else { remaining.push(entry); }
    });
    serverActivityWaiters = remaining;
    completed.forEach(function (callback) { callback(); });
  }

  function scheduleServerActivityPoll(delay) {
    root.clearTimeout(serverActivityPollTimer);
    serverActivityPollTimer = root.setTimeout(pollServerActivities, typeof delay === 'number' ? delay : 3000);
  }

  function pollServerActivities() {
    var identity;
    serverActivityPollTimer = null;
    if (!config.apiBaseUrl || appView === 'player') { scheduleServerActivityPoll(3000); return; }
    if (serverActivityRequest) { scheduleServerActivityPoll(500); return; }
    identity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    serverActivityRequest = PlexClient.loadActivities(config, function (error, activities) {
      var nextFingerprint;
      serverActivityRequest = null;
      if (identity !== String(config.apiBaseUrl || '') + '|' + String(config.token || '')) { scheduleServerActivityPoll(0); return; }
      if (!error) {
        nextFingerprint = ActivityState.fingerprint(activities);
        serverActivities = activities;
        if (nextFingerprint !== serverActivityFingerprint) {
          serverActivityFingerprint = nextFingerprint;
          renderServerActivities();
        }
      }
      processServerActivityWaiters();
      scheduleServerActivityPoll(3000);
    });
  }

  function waitForServerActivity(activityId, callback) {
    serverActivityWaiters.push({
      waiter: ActivityState.createWaiter(activityId, serverActivities, new Date().getTime()),
      callback: callback
    });
    scheduleServerActivityPoll(100);
  }
