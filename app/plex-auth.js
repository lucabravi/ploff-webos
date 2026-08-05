(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./plex-http'));
  } else {
    root.PloffPlexAuth = factory(root.PloffPlexHttp);
  }
}(this, function (PlexHttp) {
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

  function decodedLocalPlexUri(value) {
    var uri = normalizedConnectionUri(value);
    var match = uri.match(/^https?:\/\/([^/:]+)(:\d+)?(\/.*)?$/i);
    var host;
    var encodedAddress;
    var parts;
    var index;
    var first;
    var second;
    var localAddress = false;
    if (!match) { return ''; }
    host = match[1];
    if (!/(?:\.plex\.direct|\.plex\.tv)$/i.test(host)) { return ''; }
    encodedAddress = host.match(/^(\d{1,3}(?:-\d{1,3}){3})\./);
    if (!encodedAddress) { return ''; }
    parts = encodedAddress[1].split('-').map(function (part) { return Number(part); });
    for (index = 0; index < parts.length; index += 1) {
      if (!isFinite(parts[index]) || parts[index] < 0 || parts[index] > 255) { return ''; }
    }
    first = parts[0];
    second = parts[1];
    localAddress = first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
    if (!localAddress) { return ''; }
    return 'http://' + parts.join('.') + (match[2] || ':32400') + (match[3] || '');
  }

  function orderedConnectionRoutes(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    var ranked = [];
    var seen = {};
    var index;
    var connection;
    var uri;
    var localUri;
    var rank;
    for (index = 0; index < source.length; index += 1) {
      connection = typeof source[index] === 'string' ? { uri: source[index] } : (source[index] || {});
      uri = normalizedConnectionUri(connection.uri);
      if (!uri) { continue; }
      localUri = decodedLocalPlexUri(uri);
      if (localUri && !seen[localUri]) {
        seen[localUri] = true;
        ranked.push({
          uri: localUri,
          local: true,
          relay: false,
          rank: 0,
          index: index - 0.5
        });
      }
      if (seen[uri]) { continue; }
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
    var source = baseHeaders(options);
    var headers = {};
    var name;
    for (name in source) {
      if (Object.prototype.hasOwnProperty.call(source, name) && source[name]) { headers[name] = source[name]; }
    }
    if (accept) { headers.Accept = accept; }
    if (token) { headers['X-Plex-Token'] = token; }
    return PlexHttp.request(rootObject, {
      method: method,
      url: url,
      timeout: Number(options && options.timeout || 5000),
      headers: headers,
      statusError: function (status) { return new Error('Plex authentication failed with status ' + status); },
      networkError: 'Plex authentication network error',
      timeoutError: 'Plex authentication timed out'
    }, function (error, body) { callback(error || null, body || ''); });
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
