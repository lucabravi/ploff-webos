(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryTabStore = factory(); }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.libraryTabs.v1';
  var LEGACY_ORDER_KEY = 'ploff.libraryOrder.v1';
  var RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
  var MAX_RECORDS = 128;
  var MODES = ['text', 'icon', 'icon-text'];
  var ICONS = ['movie', 'tv', 'anime', 'documentary', 'kids', 'music', 'folder', 'star'];
  var HOME_ICONS = ['home'].concat(ICONS);

  function isArray(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function text(value, maximum) {
    var result = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
    return maximum ? result.slice(0, maximum) : result;
  }
  function allowed(value, values, fallback) { return values.indexOf(String(value || '')) !== -1 ? String(value) : fallback; }
  function empty() { return { version: 1, legacyMigrated: false, displayMode: 'text', home: { icon: 'home' }, serverAliases: [], serverStates: [], homeOrder: [], items: [] }; }
  function normalizeHome(value) {
    value = value || {};
    return { icon: allowed(value.icon, HOME_ICONS, 'home') };
  }
  function normalizeServerAliases(values) {
    var source = isArray(values) ? values : [];
    var result = [];
    var seen = {};
    source.forEach(function (entry) {
      var machineIdentifier = text(entry && entry.serverMachineIdentifier, 180);
      var alias = text(entry && entry.alias, 80);
      if (!machineIdentifier || !alias || seen[machineIdentifier]) { return; }
      seen[machineIdentifier] = true;
      result.push({ serverMachineIdentifier: machineIdentifier, alias: alias });
    });
    return result.slice(0, MAX_RECORDS);
  }
  function normalizeServerStates(values) {
    var source = isArray(values) ? values : [];
    var result = [];
    var seen = {};
    source.forEach(function (entry) {
      var machineIdentifier = text(entry && entry.serverMachineIdentifier, 180);
      if (!machineIdentifier || seen[machineIdentifier]) { return; }
      seen[machineIdentifier] = true;
      result.push({ serverMachineIdentifier: machineIdentifier, enabled: entry && entry.enabled !== false });
    });
    return result.slice(0, MAX_RECORDS);
  }
  function normalizeHomeOrder(values) {
    var source = isArray(values) ? values : [];
    var result = [];
    var seen = {};
    source.forEach(function (value) {
      var token = text(value, 260);
      if (!token || seen[token] || (token.indexOf('kind:') !== 0 && token.indexOf('source:') !== 0)) { return; }
      seen[token] = true;
      result.push(token);
    });
    return result.slice(0, MAX_RECORDS + 8);
  }
  function normalizedDisplayMode(source) {
    var home = source && source.home || {};
    var items = source && isArray(source.items) ? source.items : [];
    var legacyItem = items.length ? items[0] || {} : {};
    return allowed(source && source.displayMode || home.displayMode || legacyItem.displayMode, MODES, 'text');
  }
  function normalizeItem(value, index) {
    value = value || {};
    var sourceId = text(value.sourceId, 240);
    if (!sourceId) { return null; }
    return {
      sourceId: sourceId,
      serverMachineIdentifier: text(value.serverMachineIdentifier, 180),
      sectionKey: text(value.sectionKey, 80),
      enabled: value.enabled !== false,
      homeRecentEnabled: value.homeRecentEnabled !== false,
      alias: text(value.alias, 80),
      mergeGroup: text(value.mergeGroup, 80),
      icon: allowed(value.icon, ICONS, 'folder'),
      order: isFinite(Number(value.order)) ? Math.max(0, Math.floor(Number(value.order))) : Math.max(0, Number(index) || 0),
      lastSeenAt: Math.max(0, Number(value.lastSeenAt || 0))
    };
  }
  function validate(value) {
    var source = value && typeof value === 'object' ? value : empty();
    var items = (isArray(source.items) ? source.items : []).map(normalizeItem).filter(Boolean);
    items.sort(function (left, right) { return left.order - right.order; });
    items.slice(0, MAX_RECORDS).forEach(function (item, index) { item.order = index; });
    return {
      version: 1,
      legacyMigrated: source.legacyMigrated === true,
      displayMode: normalizedDisplayMode(source),
      home: normalizeHome(source.home),
      serverAliases: normalizeServerAliases(source.serverAliases),
      serverStates: normalizeServerStates(source.serverStates),
      homeOrder: normalizeHomeOrder(source.homeOrder),
      items: items.slice(0, MAX_RECORDS)
    };
  }
  function parse(raw) {
    if (!raw) { return empty(); }
    try { return validate(typeof raw === 'string' ? JSON.parse(raw) : raw); }
    catch (_error) { return empty(); }
  }
  function load(storage) {
    try { return parse(storage && storage.getItem ? storage.getItem(STORAGE_KEY) : ''); }
    catch (_error) { return empty(); }
  }
  function save(storage, state) {
    var next = validate(state);
    try { if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } }
    catch (_error) {}
    return next;
  }
  function legacyOrder(storage) {
    try {
      var raw = storage && storage.getItem ? storage.getItem(LEGACY_ORDER_KEY) : '';
      var parsed = raw ? JSON.parse(raw) : [];
      return isArray(parsed) ? parsed.map(String) : [];
    } catch (_error) { return []; }
  }
  function sourceMap(sources) {
    var result = {};
    (sources || []).forEach(function (source) { if (source && source.id) { result[String(source.id)] = source; } });
    return result;
  }
  function createPreference(source, now) {
    return {
      sourceId: String(source.id),
      serverMachineIdentifier: String(source.serverMachineIdentifier || ''),
      sectionKey: String(source.sectionKey || ''),
      enabled: true,
      homeRecentEnabled: true,
      alias: '',
      icon: allowed(source.defaultIcon, ICONS, 'folder'),
      order: 0,
      lastSeenAt: now
    };
  }
  function migratedSourceOrder(sources, primaryMachineIdentifier, legacy) {
    var primary = [];
    var secondary = [];
    var ordered = [];
    var used = {};
    (sources || []).forEach(function (source) {
      if (String(source.serverMachineIdentifier || '') === String(primaryMachineIdentifier || '')) { primary.push(source); }
      else { secondary.push(source); }
    });
    (legacy || []).map(String).forEach(function (key) {
      primary.forEach(function (source) {
        if (!used[source.id] && String(source.sectionKey) === key) { ordered.push(source); used[source.id] = true; }
      });
    });
    primary.concat(secondary).forEach(function (source) {
      if (!used[source.id]) { ordered.push(source); used[source.id] = true; }
    });
    return ordered;
  }
  function reconcile(state, sources, options) {
    var values = options || {};
    var now = Math.max(0, Number(values.now || Date.now()));
    var current = validate(state || empty());
    var live = sourceMap(sources);
    var byId = {};
    var result = [];
    var orderedSources;
    current.items.forEach(function (entry) { byId[entry.sourceId] = copy(entry); });
    orderedSources = current.legacyMigrated ? (sources || []).slice() : migratedSourceOrder(sources, values.primaryMachineIdentifier, values.legacyOrder || []);

    if (current.legacyMigrated) {
      current.items.forEach(function (entry) {
        var source = live[entry.sourceId];
        var next;
        if (source) {
          next = copy(entry);
          next.serverMachineIdentifier = String(source.serverMachineIdentifier || next.serverMachineIdentifier || '');
          next.sectionKey = String(source.sectionKey || next.sectionKey || '');
          next.lastSeenAt = now;
          if (!next.icon || next.icon === 'folder') { next.icon = allowed(source.defaultIcon, ICONS, next.icon || 'folder'); }
          result.push(next);
          delete live[entry.sourceId];
        } else if (!entry.lastSeenAt || now - entry.lastSeenAt <= RETENTION_MS) {
          result.push(copy(entry));
        }
      });
      orderedSources.forEach(function (source) {
        var added;
        if (!live[source.id]) { return; }
        added = createPreference(source, now);
        added.order = result.length;
        result.push(added);
        delete live[source.id];
      });
    } else {
      orderedSources.forEach(function (source) {
        var next = byId[source.id] ? copy(byId[source.id]) : createPreference(source, now);
        next.serverMachineIdentifier = String(source.serverMachineIdentifier || '');
        next.sectionKey = String(source.sectionKey || '');
        next.lastSeenAt = now;
        if (!next.icon || next.icon === 'folder') { next.icon = allowed(source.defaultIcon, ICONS, next.icon || 'folder'); }
        result.push(next);
        delete byId[source.id];
      });
      current.items.forEach(function (entry) {
        if (!live[entry.sourceId] && !sourceMap(sources)[entry.sourceId] && (!entry.lastSeenAt || now - entry.lastSeenAt <= RETENTION_MS)) {
          if (!result.some(function (candidate) { return candidate.sourceId === entry.sourceId; })) { result.push(copy(entry)); }
        }
      });
    }

    result.sort(function (left, right) { return left.order - right.order; });
    if (!current.legacyMigrated) {
      result = orderedSources.map(function (source) {
        return result.filter(function (entry) { return entry.sourceId === source.id; })[0];
      }).filter(Boolean).concat(result.filter(function (entry) {
        return !sourceMap(sources)[entry.sourceId];
      }));
    }
    result = result.slice(0, MAX_RECORDS);
    result.forEach(function (entry, index) { entry.order = index; });
    return { version: 1, legacyMigrated: true, displayMode: current.displayMode, home: normalizeHome(current.home), serverAliases: normalizeServerAliases(current.serverAliases), serverStates: normalizeServerStates(current.serverStates), homeOrder: normalizeHomeOrder(current.homeOrder), items: result };
  }
  function update(state, sourceId, changes) {
    var next = validate(state);
    var values = changes || {};
    next.items = next.items.map(function (entry) {
      if (entry.sourceId !== String(sourceId || '')) { return entry; }
      var changed = copy(entry);
      if (own(values, 'enabled')) { changed.enabled = values.enabled !== false; }
      if (own(values, 'homeRecentEnabled')) { changed.homeRecentEnabled = values.homeRecentEnabled !== false; }
      if (own(values, 'alias')) { changed.alias = text(values.alias, 80); }
      if (own(values, 'mergeGroup')) { changed.mergeGroup = text(values.mergeGroup, 80); }
      if (own(values, 'icon')) { changed.icon = allowed(values.icon, ICONS, changed.icon); }
      return changed;
    });
    return validate(next);
  }
  function updateHome(state, changes) {
    var next = validate(state);
    var values = changes || {};
    next.home = normalizeHome({ icon: own(values, 'icon') ? values.icon : next.home.icon });
    return next;
  }
  function updateDisplayMode(state, displayMode) {
    var next = validate(state);
    next.displayMode = allowed(displayMode, MODES, next.displayMode);
    return next;
  }
  function serverAlias(state, machineIdentifier) {
    var target = String(machineIdentifier || '');
    var aliases = validate(state).serverAliases;
    var index;
    for (index = 0; index < aliases.length; index += 1) {
      if (aliases[index].serverMachineIdentifier === target) { return aliases[index].alias; }
    }
    return '';
  }
  function serverEnabled(state, machineIdentifier) {
    var target = String(machineIdentifier || '');
    var serverStates = validate(state).serverStates;
    var index;
    if (!target) { return true; }
    for (index = 0; index < serverStates.length; index += 1) {
      if (serverStates[index].serverMachineIdentifier === target) { return serverStates[index].enabled !== false; }
    }
    return true;
  }
  function updateServerEnabled(state, machineIdentifier, enabled) {
    var next = validate(state);
    var target = text(machineIdentifier, 180);
    var result = [];
    if (!target) { return next; }
    next.serverStates.forEach(function (entry) {
      if (entry.serverMachineIdentifier !== target) { result.push(entry); }
    });
    result.push({ serverMachineIdentifier: target, enabled: enabled !== false });
    next.serverStates = normalizeServerStates(result);
    return next;
  }
  function preferenceForSource(state, sourceId) {
    var target = String(sourceId || '');
    var items = validate(state).items;
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (String(items[index].sourceId || '') === target) { return items[index]; }
    }
    return null;
  }
  function displayLibraryName(source, state) {
    var preference = source && preferenceForSource(state, source.id);
    return text(preference && preference.alias || source && (source.sectionTitle || source.defaultTitle), 80);
  }
  function displayServerName(source, state) {
    if (!source || source.primary !== false) { return ''; }
    return serverAlias(state, source.serverMachineIdentifier) || text(source.serverName || 'Plex', 80);
  }
  function displayTitle(source, state) {
    var title = displayLibraryName(source, state);
    var serverTitle = displayServerName(source, state);
    return serverTitle ? title + ' \u00b7 ' + serverTitle : title;
  }
  function updateServerAlias(state, machineIdentifier, alias) {
    var next = validate(state);
    var target = text(machineIdentifier, 180);
    var value = text(alias, 80);
    var result = [];
    if (!target) { return next; }
    next.serverAliases.forEach(function (entry) {
      if (entry.serverMachineIdentifier !== target) { result.push(entry); }
    });
    if (value) { result.push({ serverMachineIdentifier: target, alias: value }); }
    next.serverAliases = normalizeServerAliases(result);
    return next;
  }
  function homeOrder(state, kindOrder) {
    var current = validate(state);
    var kinds = isArray(kindOrder) ? kindOrder.map(String) : [];
    var known = [];
    var seen = {};
    var result = [];
    function add(token) {
      token = String(token || '');
      if (!token || seen[token]) { return; }
      seen[token] = true;
      result.push(token);
    }
    kinds.forEach(function (kind) {
      if (kind === 'recent') {
        current.items.forEach(function (entry) { add('source:' + entry.sourceId); });
      } else if (kind) { add('kind:' + kind); }
    });
    known = result.slice();
    if (!current.homeOrder.length) { return known; }
    result = [];
    seen = {};
    current.homeOrder.forEach(add);
    known.forEach(add);
    return result;
  }
  function reorderHome(state, tokens) {
    var next = validate(state);
    var requested = normalizeHomeOrder(tokens);
    var original = next.homeOrder.slice();
    var originalSet = {};
    var requestedSet = {};
    var selected = [];
    var slots = [];
    var result;
    var index;
    var previousIndex;
    var nextIndex;
    var insertAt;
    if (!original.length) { next.homeOrder = requested; return next; }
    original.forEach(function (token) { originalSet[token] = true; });
    requested.forEach(function (token) {
      if (originalSet[token]) { requestedSet[token] = true; selected.push(token); }
    });
    original.forEach(function (token, position) { if (requestedSet[token]) { slots.push(position); } });
    result = original.slice();
    slots.forEach(function (position, selectedIndex) { result[position] = selected[selectedIndex]; });
    requested.forEach(function (token, requestedIndex) {
      if (originalSet[token]) { return; }
      insertAt = -1;
      for (index = requestedIndex - 1; index >= 0; index -= 1) {
        previousIndex = result.indexOf(requested[index]);
        if (previousIndex !== -1) { insertAt = previousIndex + 1; break; }
      }
      if (insertAt === -1) {
        for (index = requestedIndex + 1; index < requested.length; index += 1) {
          nextIndex = result.indexOf(requested[index]);
          if (nextIndex !== -1) { insertAt = nextIndex; break; }
        }
      }
      if (insertAt === -1) { insertAt = result.length; }
      result.splice(insertAt, 0, token);
    });
    next.homeOrder = normalizeHomeOrder(result);
    return next;
  }
  function reorder(state, sourceIds) {
    var next = validate(state);
    var order = isArray(sourceIds) ? sourceIds.map(String) : [];
    var byId = {};
    var selected = {};
    var ordered = [];
    var slots = [];
    var result = next.items.slice();
    next.items.forEach(function (entry) { byId[entry.sourceId] = entry; });
    order.forEach(function (id) {
      if (!byId[id] || selected[id]) { return; }
      selected[id] = true;
      ordered.push(byId[id]);
    });
    next.items.forEach(function (entry, index) { if (selected[entry.sourceId]) { slots.push(index); } });
    slots.forEach(function (slot, index) { result[slot] = ordered[index]; });
    result.forEach(function (entry, index) { entry.order = index; });
    next.items = result;
    return validate(next);
  }
  function navigation(sources, state) {
    var current = validate(state);
    var live = sourceMap(sources);
    var aliases = {};
    var enabledServers = {};
    var preferences = {};
    var result = [];
    current.serverAliases.forEach(function (entry) { aliases[entry.serverMachineIdentifier] = entry.alias; });
    current.serverStates.forEach(function (entry) { enabledServers[entry.serverMachineIdentifier] = entry.enabled !== false; });
    current.items.forEach(function (entry) {
      if (!preferences[entry.sourceId]) { preferences[entry.sourceId] = entry; }
    });
    current.items.forEach(function (entry) {
      var source = live[entry.sourceId];
      var machineIdentifier;
      var preference;
      var libraryName;
      var serverTitle;
      var title;
      if (!source || entry.enabled === false) { return; }
      machineIdentifier = String(source.serverMachineIdentifier || '');
      if (machineIdentifier && enabledServers[machineIdentifier] === false) { return; }
      preference = preferences[entry.sourceId] || entry;
      libraryName = text(preference.alias || source.sectionTitle || source.defaultTitle, 80);
      serverTitle = source.primary === false ? (aliases[machineIdentifier] || text(source.serverName || 'Plex', 80)) : '';
      title = serverTitle ? libraryName + ' \u00b7 ' + serverTitle : libraryName;
      result.push({
        kind: 'library',
        key: String(source.sectionKey || ''),
        type: String(source.sectionType || ''),
        title: title,
        libraryName: libraryName,
        mergeGroup: String(preference.mergeGroup || ''),
        sourceId: String(source.id || entry.sourceId),
        serverMachineIdentifier: machineIdentifier,
        primary: source.primary === true,
        serverName: String(source.serverName || ''),
        owned: source.owned !== false,
        displayMode: current.displayMode,
        icon: entry.icon
      });
    });
    return result;
  }
  function normalizedLibraryGroupName(value) {
    return text(value, 80).toLowerCase().replace(/\s+/g, ' ');
  }
  function aggregateNavigation(items) {
    var source = isArray(items) ? items : [];
    var groups = {};
    var order = [];
    var result = [];
    source.forEach(function (item) {
      var name = String(item && (item.mergeGroup || item.libraryName || item.title) || '');
      var type = String(item && item.type || '');
      var key = normalizedLibraryGroupName(name) + '|' + type.toLowerCase();
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(item);
    });
    order.forEach(function (key) {
      var group = groups[key];
      var first;
      var virtual;
      if (!group || !group.length) { return; }
      if (group.length === 1) { result.push(group[0]); return; }
      first = group[0];
      virtual = copy(first);
      virtual.kind = 'library';
      virtual.virtualLibrary = true;
      virtual.libraryName = String(first.mergeGroup || first.libraryName || first.title || '');
      virtual.title = virtual.libraryName;
      virtual.sourceId = 'virtual|' + String(first.type || '') + '|' + normalizedLibraryGroupName(virtual.libraryName);
      virtual.key = virtual.sourceId;
      virtual.serverMachineIdentifier = '';
      virtual.serverName = '';
      virtual.primary = group.some(function (entry) { return entry && entry.primary === true; });
      virtual.owned = false;
      virtual.offline = group.every(function (entry) { return entry && entry.offline === true; });
      virtual.memberSourceIds = group.map(function (entry) { return String(entry.sourceId || ''); }).filter(Boolean);
      result.push(virtual);
    });
    return result;
  }

  function primaryOrder(state, primaryMachineIdentifier) {
    return validate(state).items.filter(function (entry) {
      return entry.serverMachineIdentifier === String(primaryMachineIdentifier || '');
    }).map(function (entry) { return entry.sectionKey; });
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_ORDER_KEY: LEGACY_ORDER_KEY,
    displayLibraryName: displayLibraryName,
    displayTitle: displayTitle,
    aggregateNavigation: aggregateNavigation,
    empty: empty,
    legacyOrder: legacyOrder,
    load: load,
    homeOrder: homeOrder,
    navigation: navigation,
    parse: parse,
    primaryOrder: primaryOrder,
    reconcile: reconcile,
    reorder: reorder,
    reorderHome: reorderHome,
    save: save,
    serverAlias: serverAlias,
    serverEnabled: serverEnabled,
    update: update,
    updateDisplayMode: updateDisplayMode,
    updateHome: updateHome,
    updateServerAlias: updateServerAlias,
    updateServerEnabled: updateServerEnabled,
    validate: validate
  };
}));
