(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./library-source'), require('./library-tab-store'));
  } else {
    root.PloffLibrarySourceCatalog = factory(root.PloffLibrarySource, root.PloffLibraryTabStore);
  }
}(this, function (LibrarySource, LibraryTabStore) {
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

  function text(value, maximum) {
    var result = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    return maximum ? result.slice(0, maximum) : result;
  }

  function copyList(values) { return (values || []).map(copy); }

  function create(options) {
    var values = options || {};
    var storage = values.storage;
    var now = typeof values.now === 'function' ? values.now : function () { return new Date().getTime(); };
    var state = LibraryTabStore.load(storage);
    var sources = [];
    var fixedItems = [];
    var primaryMachineIdentifier = '';
    var projection = null;
    var navigationCache = null;

    function invalidateProjection() {
      projection = null;
      navigationCache = null;
    }

    function currentProjection() {
      var result;
      if (projection) { return projection; }
      result = {
        sourceById: {},
        sourceByMachine: {},
        preferenceBySourceId: {},
        serverAliasByMachine: {},
        serverEnabledByMachine: {},
        libraryNameBySourceId: {},
        serverNameBySourceId: {},
        titleBySourceId: {}
      };
      (sources || []).forEach(function (entry) {
        var sourceId = String(entry && entry.id || '');
        var machineIdentifier = String(entry && entry.serverMachineIdentifier || '');
        if (sourceId && !result.sourceById[sourceId]) { result.sourceById[sourceId] = entry; }
        if (machineIdentifier && !result.sourceByMachine[machineIdentifier]) { result.sourceByMachine[machineIdentifier] = entry; }
      });
      (state.items || []).forEach(function (entry) {
        var sourceId = String(entry && entry.sourceId || '');
        if (sourceId && !result.preferenceBySourceId[sourceId]) { result.preferenceBySourceId[sourceId] = entry; }
      });
      (state.serverAliases || []).forEach(function (entry) {
        var machineIdentifier = String(entry && entry.serverMachineIdentifier || '');
        if (machineIdentifier && result.serverAliasByMachine[machineIdentifier] === undefined) {
          result.serverAliasByMachine[machineIdentifier] = String(entry.alias || '');
        }
      });
      (state.serverStates || []).forEach(function (entry) {
        var machineIdentifier = String(entry && entry.serverMachineIdentifier || '');
        if (machineIdentifier && result.serverEnabledByMachine[machineIdentifier] === undefined) {
          result.serverEnabledByMachine[machineIdentifier] = entry.enabled !== false;
        }
      });
      (sources || []).forEach(function (entry) {
        var sourceId = String(entry && entry.id || '');
        var machineIdentifier = String(entry && entry.serverMachineIdentifier || '');
        var preference = result.preferenceBySourceId[sourceId];
        var libraryName = text(preference && preference.alias || entry && (entry.sectionTitle || entry.defaultTitle), 80);
        var serverName = entry && entry.primary === false
          ? (result.serverAliasByMachine[machineIdentifier] || text(entry.serverName || 'Plex', 80))
          : '';
        if (!sourceId) { return; }
        result.libraryNameBySourceId[sourceId] = libraryName;
        result.serverNameBySourceId[sourceId] = serverName;
        result.titleBySourceId[sourceId] = serverName ? libraryName + ' \u00b7 ' + serverName : libraryName;
      });
      projection = result;
      return projection;
    }

    function persist() {
      state = LibraryTabStore.save(storage, state);
      invalidateProjection();
      return state;
    }

    function reconcile() {
      state = LibraryTabStore.reconcile(state, sources, {
        primaryMachineIdentifier: primaryMachineIdentifier,
        legacyOrder: LibraryTabStore.legacyOrder(storage),
        now: now()
      });
      return persist();
    }

    function replaceServerSources(server, sections) {
      var machineIdentifier = String(server && server.machineIdentifier || '');
      var retained = [];
      var next = [];
      (sources || []).forEach(function (entry) {
        if (String(entry.serverMachineIdentifier || '') !== machineIdentifier) { retained.push(entry); }
      });
      (sections || []).forEach(function (section) {
        var entry = LibrarySource.fromSection(server, section, primaryMachineIdentifier);
        if (entry.id && entry.sectionKey) { next.push(entry); }
      });
      sources = retained.concat(next);
      invalidateProjection();
    }

    function setFixedItems(items) {
      fixedItems = (items || []).filter(function (item) { return item && item.kind !== 'library'; }).map(copy);
    }

    function composeNavigation() {
      var libraries;
      var home = homePreference();
      var result = [];
      var inserted = false;
      if (!navigationCache) { navigationCache = LibraryTabStore.navigation(sources, state); }
      libraries = navigationCache;
      fixedItems.forEach(function (item) {
        var entry = copy(item);
        if (entry.kind === 'home') {
          entry.displayMode = home.displayMode;
          entry.icon = home.icon;
        }
        result.push(entry);
        if (!inserted && item.kind === 'home') {
          libraries.forEach(function (library) { result.push(copy(library)); });
          inserted = true;
        }
      });
      if (!inserted) {
        libraries.forEach(function (library) { result.push(copy(library)); });
      }
      return result;
    }

    function applyPrimaryNavigation(server, items) {
      var nextPrimary = String(server && server.machineIdentifier || '');
      var sections = [];
      sources = [];
      primaryMachineIdentifier = nextPrimary;
      setFixedItems(items);
      (items || []).forEach(function (item) {
        if (!item || item.kind !== 'library') { return; }
        sections.push({ key: item.key, title: item.title, type: item.type });
      });
      replaceServerSources(server || {}, sections);
      reconcile();
      return composeNavigation();
    }

    function mergeServerSections(server, sections) {
      if (!server || !server.machineIdentifier) { return composeNavigation(); }
      replaceServerSources(server, sections || []);
      reconcile();
      return composeNavigation();
    }

    function retainServerSources(machineIdentifiers) {
      var allowed = {};
      (machineIdentifiers || []).forEach(function (machineIdentifier) {
        allowed[String(machineIdentifier || '')] = true;
      });
      if (primaryMachineIdentifier) { allowed[primaryMachineIdentifier] = true; }
      sources = sources.filter(function (entry) {
        return !!allowed[String(entry && entry.serverMachineIdentifier || '')];
      });
      reconcile();
      ensureContentServerEnabled();
      return composeNavigation();
    }

    function source(sourceId) {
      var item = currentProjection().sourceById[String(sourceId || '')];
      return item ? copy(item) : null;
    }

    function sourceList() { return sources.map(copy); }
    function navigationItems() { return composeNavigation(); }
    function preferenceState() {
      return {
        version: state.version,
        legacyMigrated: state.legacyMigrated === true,
        displayMode: state.displayMode,
        home: copy(state.home),
        serverAliases: copyList(state.serverAliases),
        serverStates: copyList(state.serverStates),
        homeOrder: (state.homeOrder || []).slice(),
        items: copyList(state.items)
      };
    }
    function homePreference() {
      return { displayMode: state.displayMode, icon: state.home.icon };
    }
    function displayMode() { return state.displayMode; }
    function displayLibraryName(sourceId) { return currentProjection().libraryNameBySourceId[String(sourceId || '')] || ''; }
    function displayServerNameForMachine(machineIdentifier) {
      var machine = String(machineIdentifier || '');
      var current = currentProjection();
      var alias = current.serverAliasByMachine[machine];
      var match = current.sourceByMachine[machine];
      if (alias) { return alias; }
      return match ? String(match.serverName || 'Plex') : '';
    }
    function displayTitle(sourceId) { return currentProjection().titleBySourceId[String(sourceId || '')] || ''; }
    function serverEnabled(machineIdentifier) {
      var machine = String(machineIdentifier || '');
      var enabled;
      if (!machine) { return true; }
      enabled = currentProjection().serverEnabledByMachine[machine];
      return enabled === undefined ? true : enabled !== false;
    }
    function homeRecentEnabled(sourceId) {
      var target = String(sourceId || '');
      var current = currentProjection();
      var item = current.sourceById[target];
      var preference = current.preferenceBySourceId[target];
      if (item && !serverEnabled(item.serverMachineIdentifier)) { return false; }
      return !preference || preference.homeRecentEnabled !== false;
    }
    function serverIds(additionalIds) {
      var seen = {};
      var ids = [];
      sources.forEach(function (entry) {
        var id = String(entry && entry.serverMachineIdentifier || '');
        if (!id || seen[id]) { return; }
        seen[id] = true;
        ids.push(id);
      });
      (additionalIds || []).forEach(function (value) {
        var id = String(value || '');
        if (!id || seen[id]) { return; }
        seen[id] = true;
        ids.push(id);
      });
      return { seen: seen, ids: ids };
    }
    function ensureContentServerEnabled() {
      var known = serverIds();
      var fallback;
      if (!known.ids.length || known.ids.some(function (id) { return serverEnabled(id); })) { return false; }
      fallback = primaryMachineIdentifier && known.seen[primaryMachineIdentifier] ? primaryMachineIdentifier : known.ids[0];
      state = LibraryTabStore.updateServerEnabled(state, fallback, true);
      persist();
      return true;
    }
    function canDisableServer(machineIdentifier, additionalIds) {
      var target = String(machineIdentifier || '');
      var known = serverIds(additionalIds);
      var enabled = [];
      if (!target || !serverEnabled(target)) { return false; }
      known.ids.forEach(function (id) {
        if (serverEnabled(id)) { enabled.push(id); }
      });
      return enabled.length > 1 && enabled.indexOf(target) !== -1;
    }
    function homeOrder(kindOrder) {
      return LibraryTabStore.homeOrder(state, kindOrder || []).filter(function (token) {
        var sourceId;
        var item;
        token = String(token || '');
        if (token.indexOf('source:') !== 0) { return true; }
        sourceId = token.slice(7);
        item = source(sourceId);
        return !!item && serverEnabled(item.serverMachineIdentifier);
      });
    }

    function updateTab(sourceId, changes) {
      state = LibraryTabStore.update(state, sourceId, changes || {});
      persist();
      return composeNavigation();
    }

    function updateHome(changes) {
      state = LibraryTabStore.updateHome(state, changes || {});
      persist();
      return homePreference();
    }

    function updateDisplayMode(mode) {
      state = LibraryTabStore.updateDisplayMode(state, mode);
      persist();
      return composeNavigation();
    }

    function updateServerAlias(machineIdentifier, alias) {
      state = LibraryTabStore.updateServerAlias(state, machineIdentifier, alias);
      persist();
      return composeNavigation();
    }

    function updateServerEnabled(machineIdentifier, enabled, additionalIds) {
      if (enabled === false && !canDisableServer(machineIdentifier, additionalIds)) { return composeNavigation(); }
      state = LibraryTabStore.updateServerEnabled(state, machineIdentifier, enabled);
      persist();
      return composeNavigation();
    }

    function reorder(sourceIds) {
      state = LibraryTabStore.reorder(state, sourceIds || []);
      persist();
      return composeNavigation();
    }

    function reorderHome(tokens) {
      state = LibraryTabStore.reorderHome(state, tokens || []);
      persist();
      return homeOrder([]);
    }

    function reloadPreferences() {
      state = LibraryTabStore.load(storage);
      reconcile();
      ensureContentServerEnabled();
      return composeNavigation();
    }

    function primaryOrder() {
      // Keep this projection local: LibraryTabStore.primaryOrder() revalidates state,
      // while catalog reads must stay on the already-normalized cached state.
      var primary = String(primaryMachineIdentifier || '');
      return (state.items || []).filter(function (entry) {
        return String(entry && entry.serverMachineIdentifier || '') === primary;
      }).map(function (entry) { return String(entry.sectionKey || ''); });
    }

    return {
      applyPrimaryNavigation: applyPrimaryNavigation,
      displayMode: displayMode,
      displayLibraryName: displayLibraryName,
      displayServerNameForMachine: displayServerNameForMachine,
      displayTitle: displayTitle,
      homeRecentEnabled: homeRecentEnabled,
      homeOrder: homeOrder,
      homePreference: homePreference,
      mergeServerSections: mergeServerSections,
      navigationItems: navigationItems,
      preferenceState: preferenceState,
      primaryOrder: primaryOrder,
      reloadPreferences: reloadPreferences,
      reorder: reorder,
      reorderHome: reorderHome,
      retainServerSources: retainServerSources,
      canDisableServer: canDisableServer,
      serverEnabled: serverEnabled,
      source: source,
      sources: sourceList,
      updateDisplayMode: updateDisplayMode,
      updateHome: updateHome,
      updateServerAlias: updateServerAlias,
      updateServerEnabled: updateServerEnabled,
      updateTab: updateTab
    };
  }

  return { create: create };
}));
