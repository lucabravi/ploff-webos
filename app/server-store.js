(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffServerStore = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.servers.v1';

  function normalizeUri(value) {
    var uri = String(value || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    return /^https?:\/\//i.test(uri) ? uri : '';
  }

  function normalize(server) {
    var value = server || {};
    var uri = normalizeUri(value.uri || value.apiBaseUrl);
    var normalized;
    var connections;
    if (!uri) { return null; }
    normalized = {
      name: String(value.name || value.serverName || uri),
      uri: uri,
      machineIdentifier: String(value.machineIdentifier || ''),
      version: String(value.version || ''),
      source: String(value.source || 'saved')
    };
    if (Object.prototype.toString.call(value.connections) === '[object Array]') {
      connections = value.connections.map(normalizeUri).filter(function (connection) { return !!connection; });
      if (connections.length) { normalized.connections = connections; }
    }
    if (typeof value.owned !== 'undefined') { normalized.owned = value.owned === true; }
    if (/^(pending|linked|failed|unavailable)$/.test(String(value.remoteLinkStatus || ''))) {
      normalized.remoteLinkStatus = String(value.remoteLinkStatus);
    }
    if (Number(value.remoteLinkCheckedAt) > 0) {
      normalized.remoteLinkCheckedAt = Number(value.remoteLinkCheckedAt);
    }
    return normalized;
  }

  function fromConfig(config) {
    var value = config || {};
    return normalize({
      name: value.serverName || value.apiBaseUrl,
      uri: value.apiBaseUrl,
      source: 'config'
    });
  }

  function findMatch(items, candidate) {
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (items[index].uri === candidate.uri || (
        candidate.machineIdentifier &&
        items[index].machineIdentifier === candidate.machineIdentifier &&
        items[index].source === 'plex' &&
        candidate.source === 'plex'
      )) {
        return index;
      }
    }
    return -1;
  }

  function mergedConnections(left, right) {
    var values = [left.uri].concat(left.connections || [], [right.uri], right.connections || []);
    var result = [];
    var index;
    var uri;
    for (index = 0; index < values.length; index += 1) {
      uri = normalizeUri(values[index]);
      if (uri && result.indexOf(uri) === -1) { result.push(uri); }
    }
    return result;
  }

  function connectionUris(server) {
    var value = server || {};
    var values = [value.uri].concat(value.connections || []);
    var result = [];
    var index;
    var uri;
    for (index = 0; index < values.length; index += 1) {
      uri = normalizeUri(values[index]);
      if (uri && result.indexOf(uri) === -1) { result.push(uri); }
    }
    return result;
  }

  function preferConnection(server, preferredUri) {
    var value = normalize(server);
    var preferred = normalizeUri(preferredUri);
    var connections;
    if (!value || !preferred) { return value; }
    connections = connectionUris({ uri: preferred, connections: [value.uri].concat(value.connections || []) });
    value.uri = preferred;
    value.connections = connections;
    return value;
  }

  function withRemoteConnections(server, connections, status, checkedAt) {
    var value = normalize(server);
    if (!value) { return null; }
    value.connections = connectionUris({
      uri: value.uri,
      connections: (value.connections || []).concat(connections || [])
    });
    value.remoteLinkStatus = /^(pending|linked|failed|unavailable)$/.test(String(status || '')) ? String(status) : 'pending';
    if (Number(checkedAt) > 0) { value.remoteLinkCheckedAt = Number(checkedAt); }
    return value;
  }

  function merge() {
    var result = [];
    var listIndex;
    var itemIndex;
    var source;
    var candidate;
    var match;
    for (listIndex = 0; listIndex < arguments.length; listIndex += 1) {
      source = Object.prototype.toString.call(arguments[listIndex]) === '[object Array]' ? arguments[listIndex] : [];
      for (itemIndex = 0; itemIndex < source.length; itemIndex += 1) {
        candidate = normalize(source[itemIndex]);
        if (!candidate) { continue; }
        match = findMatch(result, candidate);
        if (match === -1) {
          result.push(candidate);
        } else {
          if (result[match].connections || candidate.connections || result[match].uri !== candidate.uri) {
            result[match].connections = mergedConnections(result[match], candidate);
          }
          result[match].machineIdentifier = candidate.machineIdentifier || result[match].machineIdentifier;
          result[match].version = candidate.version || result[match].version;
          result[match].source = candidate.source || result[match].source;
          if (typeof candidate.owned !== 'undefined') { result[match].owned = candidate.owned; }
          if (candidate.remoteLinkStatus) { result[match].remoteLinkStatus = candidate.remoteLinkStatus; }
          if (candidate.remoteLinkCheckedAt) { result[match].remoteLinkCheckedAt = candidate.remoteLinkCheckedAt; }
          if (!result[match].name || result[match].name === result[match].uri) { result[match].name = candidate.name; }
        }
      }
    }
    return result;
  }

  function emptyState() {
    return { version: 1, activeUri: '', servers: [] };
  }

  function validate(value) {
    var state = value || {};
    var servers = merge(state.servers || []);
    var activeUri = normalizeUri(state.activeUri);
    if (activeUri && !servers.some(function (server) { return server.uri === activeUri; })) { activeUri = ''; }
    return { version: 1, activeUri: activeUri, servers: servers };
  }

  function load(storage) {
    var raw;
    try {
      raw = storage && storage.getItem(STORAGE_KEY);
      return raw ? validate(JSON.parse(raw)) : emptyState();
    } catch (error) {
      return emptyState();
    }
  }

  function save(storage, servers, activeUri) {
    var state = validate({ servers: servers, activeUri: activeUri });
    if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    return state;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    connectionUris: connectionUris,
    fromConfig: fromConfig,
    load: load,
    merge: merge,
    normalize: normalize,
    normalizeUri: normalizeUri,
    preferConnection: preferConnection,
    save: save,
    validate: validate,
    withRemoteConnections: withRemoteConnections
  };
}));
