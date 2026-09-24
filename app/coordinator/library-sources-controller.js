(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibrarySourcesController = factory(); }
}(this, function () {
  'use strict';

  function copy(source) {
    var result = {};
    var key;
    source = source || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
    }
    return result;
  }

  function create(options) {
    var values = options || {};
    var modules = values.modules || {};
    var server = values.server || {};
    var transport = values.transport || {};
    var presentation = values.presentation || {};
    var lifecycle = values.lifecycle || {};
    var applicationConfig = values.config || {};
    var clock = values.clock || {};
    var LibrarySourceCatalog = modules.LibrarySourceCatalog;
    var LibraryTabStore = modules.LibraryTabStore;
    var catalog;
    var destroyed = false;
    var generation = 0;
    var requests = [];
    var contexts = {};
    var completedIdentity = '';
    var refreshingIdentity = '';
    var retryTimer = null;
    var retryAttempt = 0;
    var refreshWaiters = [];
    var offline = {};
    var libraryFailures = {};
    var catalogFailures = {};

    function reportLibraryStatus(sourceId, failed, kind) {
      if (destroyed) { return; }
      var failures = libraryFailures[sourceId] || {};
      if (failed) { failures[kind || 'page'] = true; }
      else { delete failures[kind || 'page']; }
      if (Object.keys(failures).length) { libraryFailures[sourceId] = failures; }
      else { delete libraryFailures[sourceId]; }
      call(presentation.renderSourceWarnings);
    }

    function sourceWarnings() {
      var result = [];
      var failedServers = {};
      (call(server.servers) || []).forEach(function (entry) {
        var id = String(entry.machineIdentifier || '');
        if (!serverEnabled(id) || (!offline[id] && !catalogFailures[id])) { return; }
        failedServers[id] = true;
        result.push(displayServerNameForMachine(id) || entry.name || 'Plex');
      });
      catalog.preferenceState().items.forEach(function (entry) {
        var id = entry.serverMachineIdentifier;
        if (!libraryFailures[entry.sourceId] || failedServers[id] || !serverEnabled(id) ||
            (entry.enabled === false && entry.homeRecentEnabled === false)) { return; }
        result.push((displayServerNameForMachine(id) || 'Plex') + ' · ' + displayLibraryName(entry.sourceId));
      });
      return result;
    }

    function bounded(invoke, callback) {
      var settled = false;
      var request;
      var timer = null;
      function finish(error, value) {
        if (settled) { return; }
        settled = true;
        if (timer !== null && clock.clearTimeout) { clock.clearTimeout(timer); }
        callback(error, value);
      }
      if (clock.setTimeout) {
        timer = clock.setTimeout(function () {
          finish(new Error('Plex source timeout'));
          if (request && request.abort) { request.abort(); }
        }, 10000);
      }
      try { request = invoke(finish); } catch (error) { finish(error); }
      return { abort: function () {
        settled = true;
        if (timer !== null && clock.clearTimeout) { clock.clearTimeout(timer); }
        if (request && request.abort) { request.abort(); }
      } };
    }

    function reportAvailability(machine, available, deferLifecycle) {
      var id = String(machine || '');
      var wasOffline;
      var changed;
      var knownSource = false;
      if (!id || id === String(primaryContext().serverMachineIdentifier)) { return false; }
      wasOffline = !!offline[id];
      changed = available ? wasOffline : !wasOffline;
      if (!available && changed) {
        knownSource = catalog.sources().some(function (source) {
          return String(source && source.serverMachineIdentifier || '') === id;
        });
      }
      if (available) { delete offline[id]; }
      else { offline[id] = true; delete contexts[id]; scheduleRetry(); }
      if (changed) { applyNavigation(); call(presentation.renderSourceWarnings); }
      if (available && wasOffline && !deferLifecycle) {
        call(lifecycle.onAvailabilityRecovered, id, { wasOffline: true, newlyDiscovered: false });
      }
      if (!available && changed && knownSource) {
        call(lifecycle.onAvailabilityLost, id);
      }
      return wasOffline;
    }

    function t(key) { return call(presentation.t, key) || key; }

    function navigationItems() {
      var items = catalog.navigationItems().map(function (item) {
        var result = copy(item);
        result.offline = !!offline[String(item.serverMachineIdentifier || '')];
        if (result.offline) { result.title += ' · ' + t('common.offline'); }
        return result;
      });
      if (aggregateLibraries() && LibraryTabStore && typeof LibraryTabStore.aggregateNavigation === 'function') {
        return LibraryTabStore.aggregateNavigation(items);
      }
      return items;
    }

    if (!LibrarySourceCatalog || typeof LibrarySourceCatalog.create !== 'function') {
      throw new Error('LibrarySourcesController requires LibrarySourceCatalog');
    }
    catalog = LibrarySourceCatalog.create({
      storage: values.storage,
      LibrarySource: modules.LibrarySource,
      LibraryTabStore: modules.LibraryTabStore
    });

    function call(callback, arg1, arg2) {
      if (typeof callback === 'function') { return callback(arg1, arg2); }
      return undefined;
    }

    function flushRefreshWaiters(error) {
      var callbacks = refreshWaiters.slice();
      refreshWaiters = [];
      callbacks.forEach(function (callback) { call(callback, error || null); });
    }

    function track(request) {
      if (request && typeof request.abort === 'function' && requests.indexOf(request) === -1) { requests.push(request); }
      return request || null;
    }

    function untrack(request) {
      var index = requests.indexOf(request);
      if (index !== -1) { requests.splice(index, 1); }
    }

    function abortRequests() {
      while (requests.length) {
        var request = requests.pop();
        if (request && typeof request.abort === 'function') { request.abort(); }
      }
    }

    function clearRetry(resetAttempt) {
      if (retryTimer !== null && typeof clock.clearTimeout === 'function') { clock.clearTimeout(retryTimer); }
      retryTimer = null;
      if (resetAttempt !== false) { retryAttempt = 0; }
    }

    function scheduleRetry() {
      var delay;
      if (destroyed || retryTimer !== null || typeof clock.setTimeout !== 'function') { return; }
      delay = Math.min(60000, 5000 * Math.pow(2, retryAttempt));
      retryAttempt += 1;
      retryTimer = clock.setTimeout(function () {
        retryTimer = null;
        refresh(function () {}, true);
      }, delay);
    }

    function requestConfig(context) {
      var result = copy(applicationConfig);
      var source = context || {};
      if (source.apiBaseUrl !== undefined) { result.apiBaseUrl = String(source.apiBaseUrl || ''); }
      if (source.token !== undefined) { result.token = String(source.token || ''); }
      if (source.requestTimeout !== undefined) { result.requestTimeout = source.requestTimeout; }
      return result;
    }

    function applyNavigation() {
      var items = navigationItems();
      call(presentation.applyNavigation, items);
      call(presentation.renderNavigation);
      return items;
    }

    function applyPrimaryNavigation(items) {
      var primary = typeof server.activeServer === 'function' ? server.activeServer() : null;
      contexts = {};
      offline = {};
      libraryFailures = {};
      catalogFailures = {};
      completedIdentity = '';
      refreshingIdentity = '';
      generation += 1;
      abortRequests();
      clearRetry();
      catalog.applyPrimaryNavigation(primary || {}, items || []);
      return applyNavigation();
    }

    function decorateContext(source, context) {
      var result = copy(context);
      result.sourceId = String(source && source.id || '');
      result.sectionKey = String(source && source.sectionKey || '');
      result.sectionType = String(source && source.sectionType || '');
      result.sectionTitle = String(source && source.sectionTitle || '');
      result.serverMachineIdentifier = String(result.serverMachineIdentifier || source && source.serverMachineIdentifier || '');
      result.serverName = String(result.serverName || source && source.serverName || '');
      result.requestTimeout = Math.min(10000, Math.max(1000, Number(result.requestTimeout) || 10000));
      if (source && source.owned === false) { result.owned = false; }
      else if (result.owned !== false) { result.owned = true; }
      return result;
    }

    function resolveSource(sourceId, callback) {
      var source = catalog.source(sourceId);
      var machineIdentifier;
      var primary;
      var cached;
      var request = null;
      var completed = false;
      var requestGeneration = generation;
      if (destroyed || !source) { call(callback, new Error('Library source unavailable')); return null; }
      machineIdentifier = String(source.serverMachineIdentifier || '');
      if (!serverEnabled(machineIdentifier)) { call(callback, new Error('Library source disabled')); return null; }
      if (offline[machineIdentifier]) { call(callback, new Error('Library source offline')); return null; }
      primary = primaryContext();
      if (primary.apiBaseUrl && machineIdentifier && machineIdentifier === String(primary.serverMachineIdentifier || '')) {
        call(callback, null, decorateContext(source, primary));
        return null;
      }
      cached = contexts[machineIdentifier];
      if (cached) {
        call(callback, null, decorateContext(source, cached));
        return null;
      }
      if (!server.resolveContentSource) { call(callback, new Error('Plex source resolver unavailable')); return null; }
      request = bounded(function (done) { return server.resolveContentSource(machineIdentifier, done); }, function (error, context) {
        completed = true;
        untrack(request);
        if (destroyed || requestGeneration !== generation) { return; }
        if (error || !context) { call(callback, error || new Error('Library source unavailable')); return; }
        contexts[machineIdentifier] = copy(context);
        call(callback, null, decorateContext(source, context));
      });
      if (!completed) { track(request); }
      return request || null;
    }

    function contextForMachine(machineIdentifier) {
      var id = String(machineIdentifier || '');
      var primary = primaryContext();
      if (!id || !serverEnabled(id)) { return null; }
      if (primary.apiBaseUrl && id === String(primary.serverMachineIdentifier || '')) { return primary; }
      return contexts[id] ? copy(contexts[id]) : null;
    }

    function primaryContext() {
      var primary = typeof server.activeServer === 'function' ? server.activeServer() : null;
      return {
        apiBaseUrl: String(applicationConfig.apiBaseUrl || ''),
        token: String(applicationConfig.token || ''),
        requestTimeout: applicationConfig.requestTimeout,
        serverMachineIdentifier: String(primary && primary.machineIdentifier || ''),
        serverName: String(primary && (primary.name || primary.title) || 'Plex'),
        primary: true,
        owned: primary && primary.owned === false ? false : true
      };
    }

    function displayLibraryName(sourceId) { return catalog.displayLibraryName ? catalog.displayLibraryName(sourceId) : ''; }
    function displayServerNameForMachine(machineIdentifier) { return catalog.displayServerNameForMachine ? catalog.displayServerNameForMachine(machineIdentifier) : ''; }
    function displayTitle(sourceId) { return catalog.displayTitle ? catalog.displayTitle(sourceId) : ''; }
    function serverEnabled(machineIdentifier) { return catalog.serverEnabled ? catalog.serverEnabled(machineIdentifier) !== false : true; }
    function serverAvailable(machineIdentifier) { return !offline[String(machineIdentifier || '')]; }
    function homeOrder(kindOrder) { return catalog.homeOrder ? catalog.homeOrder(kindOrder || []) : []; }
    function currentSettings() { return typeof values.settings === 'function' ? (values.settings() || {}) : (values.settings || {}); }
    function aggregateHomeLibraries() { return currentSettings().aggregateHomeLibraries === true; }
    function aggregateLibraries() { return currentSettings().aggregateLibraries === true; }

    function homeRecentEnabled(sourceId) {
      if (catalog.homeRecentEnabled) { return catalog.homeRecentEnabled(sourceId); }
      var preferences = catalog.preferenceState ? catalog.preferenceState() : { items: [] };
      var target = String(sourceId || '');
      var source = catalog.source ? catalog.source(target) : null;
      var index;
      if (source && !serverEnabled(source.serverMachineIdentifier)) { return false; }
      for (index = 0; index < (preferences.items || []).length; index += 1) {
        if (String(preferences.items[index].sourceId || '') === target) { return preferences.items[index].homeRecentEnabled !== false; }
      }
      return true;
    }

    function resolveServers(callback, useAvailable) {
      var cancelled = false;
      var requests = [];
      function afterRefresh(refreshError) {
        var primary = typeof server.activeServer === 'function' ? server.activeServer() : null;
        var primaryId = String(primary && primary.machineIdentifier || '');
        var ids = [];
        var seen = {};
        var remaining;
        var results = [];
        var firstError = refreshError || null;
        if (cancelled) { return; }
        if (primaryId && serverEnabled(primaryId)) { ids.push(primaryId); seen[primaryId] = true; }
        catalog.sources().forEach(function (source) {
          var id = String(source && source.serverMachineIdentifier || '');
          if (id && !seen[id] && serverEnabled(id)) { seen[id] = true; ids.push(id); }
        });
        remaining = ids.length;
        if (!remaining) { call(callback, firstError || new Error('No Plex content servers available'), []); return; }
        function complete() {
          remaining -= 1;
          if (remaining > 0 || cancelled) { return; }
          results.sort(function (left, right) {
            if (left.primary !== right.primary) { return left.primary ? -1 : 1; }
            return left.order - right.order;
          });
          call(callback, results.length ? null : (firstError || new Error('No Plex content servers available')), results.map(function (entry) {
            var value = copy(entry.context);
            delete value.order;
            return value;
          }));
        }
        ids.forEach(function (machineIdentifier, order) {
          var cached = contextForMachine(machineIdentifier);
          var request = null;
          var settled = false;
          function accept(error, context) {
            settled = true;
            if (cancelled) { return; }
            if (error || !context) { firstError = firstError || error || new Error('Plex source unavailable'); complete(); return; }
            context = copy(context);
            context.serverMachineIdentifier = String(context.serverMachineIdentifier || machineIdentifier);
            context.serverName = String(context.serverName || (machineIdentifier === primaryId && primary && (primary.name || primary.title)) || 'Plex');
            context.primary = machineIdentifier === primaryId;
            contexts[machineIdentifier] = copy(context);
            results.push({ context: context, primary: context.primary, order: order });
            complete();
          }
          if (offline[machineIdentifier]) { accept(new Error('Plex source offline')); return; }
          if (cached) { accept(null, cached); return; }
          if (!server.resolveContentSource) { accept(new Error('Plex source resolver unavailable')); return; }
          request = bounded(function (done) { return server.resolveContentSource(machineIdentifier, done); }, accept);
          if (!settled && request && typeof request.abort === 'function') { requests.push(request); }
        });
      }
      if (useAvailable === true) { afterRefresh(null); }
      else { refresh(afterRefresh); }
      return {
        abort: function () {
          if (cancelled) { return; }
          cancelled = true;
          requests.forEach(function (request) { if (request && request.abort) { request.abort(); } });
          requests = [];
        }
      };
    }

    function refresh(callback, force) {
      var identity = String(typeof server.watchlistIdentity === 'function' ? server.watchlistIdentity() || '' : '');
      var primary = typeof server.activeServer === 'function' ? server.activeServer() : null;
      var primaryId = String(primary && primary.machineIdentifier || '');
      var forceRefresh = force === true;
      var requestGeneration;
      var queryRequest = null;
      var queryCompleted = false;
      if (destroyed) { call(callback, new Error('Library sources unavailable')); return null; }
      if (!forceRefresh && identity && completedIdentity === identity) { call(callback, null); return null; }
      if (identity && refreshingIdentity === identity) {
        if (typeof callback === 'function') { refreshWaiters.push(callback); }
        return null;
      }
      clearRetry(false);
      generation += 1;
      requestGeneration = generation;
      abortRequests();
      if (identity && completedIdentity && identity !== completedIdentity) { contexts = {}; }
      refreshingIdentity = identity;
      if (!server.queryAccountServers) {
        refreshingIdentity = '';
        call(callback, new Error('Plex account discovery unavailable'));
        flushRefreshWaiters(new Error('Plex account discovery unavailable'));
        return null;
      }
      queryRequest = bounded(function (done) { return server.queryAccountServers(done); }, function (error, accountServers) {
        var secondaries;
        var remaining;
        var failed = 0;
        var reachableMachineIdentifiers = [];
        queryCompleted = true;
        untrack(queryRequest);
        if (destroyed || requestGeneration !== generation) { return; }
        if (error) {
          refreshingIdentity = '';
          scheduleRetry();
          call(callback, error);
          flushRefreshWaiters(error);
          return;
        }
        secondaries = (accountServers || []).filter(function (entry) {
          return !!entry && !!entry.machineIdentifier && String(entry.machineIdentifier) !== primaryId;
        });
        remaining = secondaries.length;
        if (!remaining) {
          contexts = {};
          if (catalog.retainServerSources) { catalog.retainServerSources([]); applyNavigation(); }
          completedIdentity = identity;
          refreshingIdentity = '';
          clearRetry();
          call(callback, null);
          flushRefreshWaiters(null);
          return;
        }
        function completeOne() {
          var retained;
          remaining -= 1;
          if (remaining > 0 || destroyed || requestGeneration !== generation) { return; }
          retained = {};
          secondaries.forEach(function (entry) {
            var id = String(entry.machineIdentifier);
            if (contexts[id]) { retained[id] = contexts[id]; }
          });
          contexts = retained;
          if (catalog.retainServerSources) { catalog.retainServerSources(secondaries.map(function (entry) { return String(entry.machineIdentifier); })); applyNavigation(); }
          completedIdentity = identity;
          refreshingIdentity = '';
          if (failed > 0) { scheduleRetry(); }
          else { clearRetry(); }
          call(callback, null);
          flushRefreshWaiters(null);
        }
        secondaries.forEach(function (entry) {
          var resolveRequest = null;
          var resolveCompleted = false;
          var hadCatalogSources = catalog.sources().some(function (source) {
            return String(source && source.serverMachineIdentifier || '') === String(entry.machineIdentifier);
          });
          resolveRequest = bounded(function (done) { return server.resolveContentSource(entry.machineIdentifier, done); }, function (resolveError, context) {
            var sectionRequest = null;
            var sectionCompleted = false;
            var wasOffline;
            resolveCompleted = true;
            untrack(resolveRequest);
            if (destroyed || requestGeneration !== generation) { return; }
            if (resolveError || !context) { reportAvailability(entry.machineIdentifier, false); failed += 1; completeOne(); return; }
            contexts[String(entry.machineIdentifier)] = copy(context);
            wasOffline = reportAvailability(entry.machineIdentifier, true, true);
            sectionRequest = bounded(function (done) { return transport.loadLibrarySections(requestConfig(context), done); }, function (sectionError, sections) {
              sectionCompleted = true;
              untrack(sectionRequest);
              if (destroyed || requestGeneration !== generation) { return; }
              if (!sectionError) {
                delete catalogFailures[String(entry.machineIdentifier)];
                reachableMachineIdentifiers.push(String(entry.machineIdentifier));
                catalog.mergeServerSections(entry, sections || []);
                applyNavigation();
                if (wasOffline || !hadCatalogSources) {
                  call(lifecycle.onAvailabilityRecovered, String(entry.machineIdentifier), {
                    wasOffline: wasOffline,
                    newlyDiscovered: !hadCatalogSources
                  });
                }
              } else { catalogFailures[String(entry.machineIdentifier)] = true; failed += 1; }
              call(presentation.renderSourceWarnings);
              completeOne();
            });
            if (!sectionCompleted) { track(sectionRequest); }
          });
          if (!resolveCompleted) { track(resolveRequest); }
        });
      });
      if (!queryCompleted) { track(queryRequest); }
      return queryRequest || null;
    }


    function recoverPrimary(error, callback) {
      if (destroyed || !server || typeof server.attemptFailover !== 'function') {
        call(callback, error || new Error('Primary Plex server unavailable'), null);
        return false;
      }
      return server.attemptFailover(error, function (switched, failoverError) {
        var refreshed;
        if (destroyed) { return; }
        if (!switched) {
          call(callback, failoverError || error || new Error('Primary Plex server unavailable'), null);
          return;
        }
        refreshed = primaryContext();
        if (!refreshed || !refreshed.apiBaseUrl) {
          call(callback, failoverError || error || new Error('Primary Plex server unavailable'), null);
          return;
        }
        call(callback, null, refreshed);
      });
    }

    function verifyAvailability(machineIdentifier, callback) {
      var id = String(machineIdentifier || '');
      var primary = primaryContext();
      var request = null;
      var completed = false;
      var requestGeneration = generation;
      if (!id) { call(callback, new Error('Plex source unavailable')); return null; }
      if (!serverEnabled(id)) { call(callback, new Error('Plex source disabled')); return null; }
      if (id === String(primary.serverMachineIdentifier || '') && primary.apiBaseUrl) {
        call(callback, null, primary);
        return null;
      }
      if (!server.resolveContentSource) { call(callback, new Error('Plex source resolver unavailable')); return null; }
      request = bounded(function (done) { return server.resolveContentSource(id, done); }, function (error, context) {
        completed = true;
        untrack(request);
        if (destroyed || requestGeneration !== generation) { return; }
        if (error || !context) {
          reportAvailability(id, false);
          call(callback, error || new Error('Plex source unavailable'));
          return;
        }
        contexts[id] = copy(context);
        reportAvailability(id, true);
        call(callback, null, copy(context));
      });
      if (!completed) { track(request); }
      return request || null;
    }

    function updateTab(sourceId, changes) { catalog.updateTab(sourceId, changes || {}); return applyNavigation(); }
    function updateHome(changes) { var result = catalog.updateHome(changes || {}); applyNavigation(); return result; }
    function updateDisplayMode(mode) { catalog.updateDisplayMode(mode); return applyNavigation(); }
    function updateServerAlias(machineIdentifier, alias) {
      catalog.updateServerAlias(machineIdentifier, alias);
      call(lifecycle.onServerAliasChanged, String(machineIdentifier || ''));
      return applyNavigation();
    }
    function knownServerIds() {
      return (call(server.servers) || []).map(function (entry) { return String(entry && entry.machineIdentifier || ''); }).filter(function (id) { return !!id; });
    }
    function canDisableServer(machineIdentifier) { return catalog.canDisableServer ? catalog.canDisableServer(machineIdentifier, knownServerIds()) === true : true; }
    function updateServerEnabled(machineIdentifier, enabled) {
      var before = serverEnabled(machineIdentifier);
      var result;
      catalog.updateServerEnabled(machineIdentifier, enabled, knownServerIds());
      result = applyNavigation();
      if (before !== serverEnabled(machineIdentifier)) { call(lifecycle.onServerEnabledChanged, String(machineIdentifier || ''), serverEnabled(machineIdentifier)); }
      return result;
    }
    function persistLegacyPrimaryOrder() {
      try {
        if (values.storage && values.storage.setItem && LibraryTabStore && LibraryTabStore.LEGACY_ORDER_KEY) {
          values.storage.setItem(LibraryTabStore.LEGACY_ORDER_KEY, JSON.stringify(catalog.primaryOrder()));
        }
      } catch (_error) {}
    }

    function reorder(sourceIds) {
      catalog.reorder(sourceIds || []);
      persistLegacyPrimaryOrder();
      return applyNavigation();
    }

    function reorderHome(tokens) {
      return catalog.reorderHome ? catalog.reorderHome(tokens || []) : [];
    }

    function reloadPreferences() {
      var before = {};
      var ids = {};
      var result;
      function collect() {
        var state = catalog.preferenceState ? catalog.preferenceState() : { serverStates: [] };
        (catalog.sources ? catalog.sources() : []).forEach(function (source) {
          var id = String(source && source.serverMachineIdentifier || '');
          if (id) { ids[id] = true; }
        });
        (state.serverStates || []).forEach(function (entry) {
          var id = String(entry && entry.serverMachineIdentifier || '');
          if (id) { ids[id] = true; }
        });
      }
      if (destroyed) { return []; }
      collect();
      Object.keys(ids).forEach(function (id) { before[id] = serverEnabled(id); });
      catalog.reloadPreferences();
      collect();
      persistLegacyPrimaryOrder();
      result = applyNavigation();
      Object.keys(ids).forEach(function (id) {
        var after = serverEnabled(id);
        if (before[id] !== undefined && before[id] !== after) { call(lifecycle.onServerEnabledChanged, id, after); }
      });
      return result;
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      generation += 1;
      abortRequests();
      clearRetry();
      contexts = {};
      refreshWaiters = [];
    }

    return {
      applyPrimaryNavigation: applyPrimaryNavigation,
      destroy: destroy,
      displayMode: function () { return catalog.displayMode(); },
      displayLibraryName: displayLibraryName,
      displayServerNameForMachine: displayServerNameForMachine,
      displayTitle: displayTitle,
      aggregateHomeLibraries: aggregateHomeLibraries,
      aggregateLibraries: aggregateLibraries,
      homeOrder: homeOrder,
      homePreference: function () { return catalog.homePreference(); },
      homeRecentEnabled: homeRecentEnabled,
      navigationItems: navigationItems,
      reportAvailability: reportAvailability,
      reportLibraryStatus: reportLibraryStatus,
      sourceWarnings: sourceWarnings,
      preferenceState: function () { return catalog.preferenceState(); },
      primaryContext: primaryContext,
      primaryOrder: function () { return catalog.primaryOrder(); },
      refresh: refresh,
      recoverPrimary: recoverPrimary,
      reloadPreferences: reloadPreferences,
      resolveServers: resolveServers,
      reorder: reorder,
      reorderHome: reorderHome,
      resolveSource: resolveSource,
      contextForMachine: contextForMachine,
      canDisableServer: canDisableServer,
      serverAvailable: serverAvailable,
      serverEnabled: serverEnabled,
      source: function (sourceId) { return catalog.source(sourceId); },
      sources: function () { return catalog.sources(); },
      updateDisplayMode: updateDisplayMode,
      verifyAvailability: verifyAvailability,
      updateHome: updateHome,
      updateServerAlias: updateServerAlias,
      updateServerEnabled: updateServerEnabled,
      updateTab: updateTab
    };
  }

  return { create: create };
}));
