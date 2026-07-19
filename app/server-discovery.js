(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffServerDiscovery = factory();
  }
}(this, function () {
  'use strict';

  var SERVICE_URI = 'luna://io.github.rhapsodos.ploff.discovery/discover';

  function normalizeCandidate(value) {
    var uri = String(value || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    if (/^https?:\/\/[^/]+$/i.test(uri)) { return uri; }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(uri)) { uri = 'http://' + uri + ':32400'; }
    else if (/^[a-z0-9][a-z0-9.-]*$/i.test(uri)) {
      if (/\.(local|lan|home|internal|home\.arpa)$/i.test(uri) || uri.indexOf('.') === -1) { uri = 'http://' + uri + ':32400'; }
      else { uri = 'https://' + uri; }
    }
    return /^https?:\/\/[^/]+(?::\d+)?$/i.test(uri) ? uri : '';
  }

  function configuredUris(config) {
    var values = [];
    var source = [config && config.apiBaseUrl].concat(config && config.discoveryHosts || []);
    var index;
    var uri;
    for (index = 0; index < source.length; index += 1) {
      uri = normalizeCandidate(source[index]);
      if (uri && values.indexOf(uri) === -1) { values.push(uri); }
    }
    return values;
  }

  function candidateHost(value) {
    var uri = normalizeCandidate(value);
    var authority;
    if (!uri) { return ''; }
    authority = uri.replace(/^https?:\/\//i, '').split('/')[0];
    return authority.replace(/:\d+$/, '').toLowerCase();
  }

  function isLocalCandidate(value) {
    var host = candidateHost(value);
    var parts;
    var first;
    var second;
    if (!host) { return false; }
    if (host === 'localhost' || host.indexOf('.') === -1 || /\.(local|lan|home|internal|home\.arpa)$/i.test(host)) { return true; }
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { return false; }
    parts = host.split('.');
    first = Number(parts[0]);
    second = Number(parts[1]);
    return first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }

  function shouldOfferLocalConnection(localUri, enteredUri) {
    var local = normalizeCandidate(localUri);
    var entered = normalizeCandidate(enteredUri);
    return !!(local && entered && local !== entered && isLocalCandidate(local) && !isLocalCandidate(entered));
  }

  function attribute(xml, name) {
    var match = String(xml || '').match(new RegExp('\\b' + name + '="([^"]*)"', 'i'));
    return match ? match[1] : '';
  }

  function identityFromXml(xml, uri, name) {
    var container = String(xml || '').match(/<MediaContainer\b[^>]*>/i);
    var machineIdentifier = container ? attribute(container[0], 'machineIdentifier') : '';
    if (!machineIdentifier) { return null; }
    return {
      name: name || uri,
      uri: normalizeCandidate(uri),
      machineIdentifier: machineIdentifier,
      version: attribute(container[0], 'version'),
      source: 'probe'
    };
  }

  function probe(rootObject, uri, name, timeout, callback) {
    var xhr;
    var finished = false;
    function done(server) {
      if (finished) { return; }
      finished = true;
      callback(server || null);
    }
    try {
      xhr = new rootObject.XMLHttpRequest();
      xhr.open('GET', uri + '/identity', true);
      xhr.timeout = timeout;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) { done(identityFromXml(xhr.responseText, uri, name)); }
        else { done(null); }
      };
      xhr.onerror = function () { done(null); };
      xhr.ontimeout = function () { done(null); };
      xhr.send();
    } catch (error) {
      done(null);
    }
  }

  function discoverWithService(rootObject, callback) {
    var bridge;
    var finished = false;
    function done(servers) {
      if (finished) { return; }
      finished = true;
      callback(Object.prototype.toString.call(servers) === '[object Array]' ? servers : []);
    }
    if (rootObject.webOS && rootObject.webOS.service && rootObject.webOS.service.request) {
      try {
        rootObject.webOS.service.request(SERVICE_URI, {
          method: '', parameters: {},
          onSuccess: function (response) { done(response && response.servers); },
          onFailure: function () { done([]); }
        });
      } catch (serviceError) { done([]); }
      return;
    }
    if (rootObject.PalmServiceBridge) {
      try {
        bridge = new rootObject.PalmServiceBridge();
        bridge.onservicecallback = function (payload) {
          var response;
          try { response = JSON.parse(payload); }
          catch (error) { done([]); return; }
          done(response && response.servers);
        };
        bridge.call(SERVICE_URI, '{}');
        rootObject.setTimeout(function () { done([]); }, 3500);
      } catch (bridgeError) { done([]); }
      return;
    }
    done([]);
  }

  function discover(rootObject, config, callback) {
    var uris = configuredUris(config || {});
    var pending = uris.length + 1;
    var results = [];
    var index;
    function complete(items) {
      var itemIndex;
      for (itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        if (items[itemIndex] && items[itemIndex].uri) { results.push(items[itemIndex]); }
      }
      pending -= 1;
      if (pending === 0) { callback(results); }
    }
    for (index = 0; index < uris.length; index += 1) {
      (function (uri, name) {
        probe(rootObject, uri, name, config.discoveryTimeout || 1800, function (server) { complete(server ? [server] : []); });
      }(uris[index], index === 0 ? config.serverName : ''));
    }
    discoverWithService(rootObject, complete);
  }

  return {
    SERVICE_URI: SERVICE_URI,
    configuredUris: configuredUris,
    discover: discover,
    identityFromXml: identityFromXml,
    isLocalCandidate: isLocalCandidate,
    normalizeCandidate: normalizeCandidate,
    probe: probe,
    shouldOfferLocalConnection: shouldOfferLocalConnection
  };
}));
