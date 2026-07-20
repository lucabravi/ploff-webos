(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlexAuth = factory();
  }
}(this, function () {
  'use strict';

  var CLIENT_ID_KEY = 'ploff.clientIdentifier.v1';

  function attribute(xml, name) {
    var match = String(xml || '').match(new RegExp('\\b' + name + '="([^"]*)"', 'i'));
    return match ? match[1] : '';
  }

  function decode(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function bool(value) {
    return value === '1' || value === 'true' || value === true;
  }

  function pinFromXml(xml) {
    var tag = String(xml || '').match(/<pin\b[^>]*>/i);
    if (!tag) { throw new Error('Invalid Plex PIN response'); }
    return {
      id: attribute(tag[0], 'id'),
      code: attribute(tag[0], 'code'),
      expiresIn: Number(attribute(tag[0], 'expiresIn') || 0),
      token: attribute(tag[0], 'authToken')
    };
  }

  function homeUsersFromXml(xml) {
    var tags = String(xml || '').match(/<User\b[^>]*>/gi) || [];
    var users = [];
    var index;
    var id;
    for (index = 0; index < tags.length; index += 1) {
      id = attribute(tags[index], 'id') || attribute(tags[index], 'uuid');
      if (!id) { continue; }
      users.push({
        id: id,
        uuid: attribute(tags[index], 'uuid'),
        title: decode(attribute(tags[index], 'title') || attribute(tags[index], 'username') || 'Plex'),
        protected: bool(attribute(tags[index], 'protected')),
        thumb: decode(attribute(tags[index], 'thumb')),
        token: ''
      });
    }
    return users;
  }

  function profileTokenFromXml(xml) {
    return attribute(xml, 'authenticationToken') || attribute(xml, 'authToken');
  }

  function normalizedConnectionUri(value) {
    var uri = String(value || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    return /^https?:\/\//i.test(uri) ? uri : '';
  }

  function orderedConnectionRoutes(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    var ranked = [];
    var seen = {};
    var index;
    var connection;
    var uri;
    var rank;
    for (index = 0; index < source.length; index += 1) {
      connection = typeof source[index] === 'string' ? { uri: source[index] } : (source[index] || {});
      uri = normalizedConnectionUri(connection.uri);
      if (!uri || seen[uri]) { continue; }
      seen[uri] = true;
      rank = connection.local === true ? 0 : (connection.relay === true ? 2 : 1);
      ranked.push({
        uri: uri,
        local: connection.local === true,
        relay: connection.relay === true,
        rank: rank,
        index: index
      });
    }
    ranked.sort(function (left, right) {
      return left.rank === right.rank ? left.index - right.index : left.rank - right.rank;
    });
    return ranked.map(function (item) {
      return { uri: item.uri, local: item.local, relay: item.relay };
    });
  }

  function orderedConnections(values) {
    return orderedConnectionRoutes(values).map(function (item) { return item.uri; });
  }

  function accountServersFromJson(jsonText) {
    var resources = JSON.parse(jsonText);
    var servers = [];
    var index;
    var resource;
    var connections;
    var connectionRoutes;
    var provides;
    if (Object.prototype.toString.call(resources) !== '[object Array]') { throw new Error('Invalid Plex resources response'); }
    for (index = 0; index < resources.length; index += 1) {
      resource = resources[index] || {};
      provides = ',' + String(resource.provides || '').toLowerCase().replace(/\s+/g, '') + ',';
      if (provides.indexOf(',server,') === -1 && String(resource.product || '').toLowerCase() !== 'plex media server') { continue; }
      if (!resource.clientIdentifier) { continue; }
      connectionRoutes = orderedConnectionRoutes(resource.connections || []);
      connections = connectionRoutes.map(function (connection) { return connection.uri; });
      if (!connections.length) { continue; }
      servers.push({
        name: String(resource.name || resource.product || 'Plex Media Server'),
        uri: connections[0],
        machineIdentifier: String(resource.clientIdentifier),
        version: String(resource.productVersion || resource.version || ''),
        source: 'plex',
        owned: resource.owned === true || resource.owned === 1 || resource.owned === '1',
        connections: connections,
        connectionRoutes: connectionRoutes
      });
    }
    return servers;
  }

  function serverAccessFromJson(jsonText, machineIdentifier) {
    var resources = JSON.parse(jsonText);
    var index;
    var connectionIndex;
    var connections;
    var connectionRoutes;
    if (Object.prototype.toString.call(resources) !== '[object Array]') { throw new Error('Invalid Plex resources response'); }
    for (index = 0; index < resources.length; index += 1) {
      if (String(resources[index].clientIdentifier || '') !== String(machineIdentifier || '')) { continue; }
      if (!resources[index].accessToken) { throw new Error('Plex server access token missing'); }
      connectionRoutes = orderedConnectionRoutes(resources[index].connections || []);
      connections = connectionRoutes.map(function (connection) { return connection.uri; });
      return { token: String(resources[index].accessToken), connections: connections, connectionRoutes: connectionRoutes };
    }
    throw new Error('Plex profile has no access to this server');
  }

  function baseHeaders(options) {
    var value = options || {};
    return {
      'X-Plex-Platform': 'webOS',
      'X-Plex-Platform-Version': String(value.platformVersion || ''),
      'X-Plex-Provides': 'client,player',
      'X-Plex-Product': 'Ploff',
      'X-Plex-Version': String(value.version || '1.0'),
      'X-Plex-Device': 'TV',
      'X-Plex-Device-Name': String(value.deviceName || 'Ploff'),
      'X-Plex-Client-Identifier': String(value.clientIdentifier || '')
    };
  }

  function requestXml(rootObject, method, url, options, token, callback, accept) {
    var xhr = new rootObject.XMLHttpRequest();
    var nativeAbort = xhr.abort;
    var headers = baseHeaders(options);
    var finished = false;
    var name;
    function done(error, body) {
      if (finished) { return; }
      finished = true;
      callback(error || null, body || '');
    }
    try {
      xhr.open(method, url, true);
      xhr.timeout = Number(options && options.timeout || 5000);
      for (name in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, name) && headers[name]) { xhr.setRequestHeader(name, headers[name]); }
      }
      if (accept) { xhr.setRequestHeader('Accept', accept); }
      if (token) { xhr.setRequestHeader('X-Plex-Token', token); }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) { done(null, xhr.responseText); }
        else { done(new Error('Plex authentication failed with status ' + xhr.status)); }
      };
      xhr.onerror = function () { done(new Error('Plex authentication network error')); };
      xhr.ontimeout = function () { done(new Error('Plex authentication timed out')); };
      xhr.send();
    } catch (error) {
      (rootObject.setTimeout || setTimeout)(function () { done(error); }, 0);
    }
    return {
      abort: function () {
        if (finished) { return; }
        finished = true;
        if (nativeAbort) { nativeAbort.call(xhr); }
      }
    };
  }

  function endpoint(options, path) {
    return String(options && options.baseUrl || 'https://plex.tv').replace(/\/+$/, '') + path;
  }

  function createPin(rootObject, options, callback) {
    return requestXml(rootObject, 'POST', endpoint(options, '/api/v2/pins'), options, '', function (error, body) {
      if (error) { callback(error); return; }
      try { callback(null, pinFromXml(body)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function pollPin(rootObject, pinId, options, callback) {
    return requestXml(rootObject, 'GET', endpoint(options, '/api/v2/pins/' + encodeURIComponent(pinId)), options, '', function (error, body) {
      if (error) { callback(error); return; }
      try { callback(null, pinFromXml(body)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function loadHomeUsers(rootObject, ownerToken, options, callback) {
    return requestXml(rootObject, 'GET', endpoint(options, '/api/home/users'), options, ownerToken, function (error, body) {
      var users;
      if (error) { callback(error); return; }
      try {
        users = homeUsersFromXml(body);
        if (!users.length) { throw new Error('No Plex Home profiles returned'); }
        callback(null, users);
      } catch (parseError) { callback(parseError); }
    });
  }

  function switchHomeUser(rootObject, ownerToken, user, pin, options, callback) {
    var path = '/api/home/users/' + encodeURIComponent(user && user.id || '') + '/switch';
    if (pin) { path += '?pin=' + encodeURIComponent(pin); }
    return requestXml(rootObject, 'POST', endpoint(options, path), options, ownerToken, function (error, body) {
      var token;
      if (error) { callback(error); return; }
      token = profileTokenFromXml(body);
      if (!token) { callback(new Error('Plex profile token missing')); return; }
      callback(null, token);
    });
  }

  function loadServerAccess(rootObject, accountToken, machineIdentifier, options, callback) {
    return requestXml(rootObject, 'GET', endpoint(options, '/api/v2/resources?includeHttps=1&includeRelay=1'), options, accountToken, function (error, body) {
      if (error) { callback(error); return; }
      try { callback(null, serverAccessFromJson(body, machineIdentifier)); }
      catch (parseError) { callback(parseError); }
    }, 'application/json');
  }

  function loadAccountServers(rootObject, accountToken, options, callback) {
    return requestXml(rootObject, 'GET', endpoint(options, '/api/v2/resources?includeHttps=1&includeRelay=1'), options, accountToken, function (error, body) {
      if (error) { callback(error); return; }
      try { callback(null, accountServersFromJson(body)); }
      catch (parseError) { callback(parseError); }
    }, 'application/json');
  }

  function serverIdentityFromXml(xml) {
    var tag = String(xml || '').match(/<MediaContainer\b[^>]*>/i);
    return tag ? attribute(tag[0], 'machineIdentifier') : '';
  }

  function findReachableConnection(rootObject, token, connections, machineIdentifier, options, callback) {
    var candidates = orderedConnections(connections || []);
    var index = 0;
    var currentRequest = null;
    var cancelled = false;
    function tryNext(lastError) {
      var uri;
      if (cancelled) { return; }
      if (index >= candidates.length) {
        callback(lastError || new Error('No reachable Plex server connection'));
        return;
      }
      uri = candidates[index];
      index += 1;
      currentRequest = requestXml(rootObject, 'GET', uri + '/identity', options, '', function (error, body) {
        var identity;
        if (cancelled) { return; }
        identity = error ? '' : serverIdentityFromXml(body);
        if (!error && identity && identity === String(machineIdentifier || '')) { callback(null, uri); return; }
        if (!error) { error = new Error('Plex server identity mismatch'); }
        tryNext(error);
      });
    }
    tryNext();
    return {
      abort: function () {
        cancelled = true;
        if (currentRequest && currentRequest.abort) { currentRequest.abort(); }
      }
    };
  }

  function loadLocalServerAccess(rootObject, profileToken, server, options, callback) {
    var connectionUri = String(server && server.uri || '').replace(/\/+$/, '');
    var expectedIdentity = String(server && server.machineIdentifier || '');
    var identityRequest;
    if (!connectionUri || !profileToken) {
      callback(new Error('Local Plex server access is incomplete'));
      return null;
    }
    identityRequest = requestXml(rootObject, 'GET', connectionUri + '/identity', options, '', function (identityError, body) {
      var identity = identityError ? '' : serverIdentityFromXml(body);
      if (identityError || !identity || identity !== expectedIdentity) {
        callback(identityError || new Error('Plex server identity mismatch'));
        return;
      }
      requestXml(rootObject, 'GET', connectionUri + '/library/sections', options, profileToken, function (error) {
        if (error) { callback(error); return; }
        callback(null, {
          token: String(profileToken),
          machineIdentifier: expectedIdentity,
          connectionUri: connectionUri
        });
      });
    });
    return identityRequest;
  }

  function clientIdentifier(storage) {
    var value = '';
    try { value = storage && storage.getItem(CLIENT_ID_KEY) || ''; } catch (error) {}
    if (!value) {
      value = 'ploff-' + String(new Date().getTime()) + '-' + Math.floor(Math.random() * 1000000000);
      try { if (storage && storage.setItem) { storage.setItem(CLIENT_ID_KEY, value); } } catch (saveError) {}
    }
    return value;
  }

  return {
    CLIENT_ID_KEY: CLIENT_ID_KEY,
    accountServersFromJson: accountServersFromJson,
    clientIdentifier: clientIdentifier,
    createPin: createPin,
    findReachableConnection: findReachableConnection,
    homeUsersFromXml: homeUsersFromXml,
    loadAccountServers: loadAccountServers,
    loadHomeUsers: loadHomeUsers,
    loadLocalServerAccess: loadLocalServerAccess,
    loadServerAccess: loadServerAccess,
    pinFromXml: pinFromXml,
    pollPin: pollPin,
    profileTokenFromXml: profileTokenFromXml,
    serverIdentityFromXml: serverIdentityFromXml,
    serverAccessFromJson: serverAccessFromJson,
    switchHomeUser: switchHomeUser
  };
}));
