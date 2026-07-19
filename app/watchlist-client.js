(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffWatchlistClient = factory();
  }
}(this, function () {
  'use strict';

  var DEFAULT_BASE = 'https://discover.provider.plex.tv';

  function url(base, path, parameters) {
    var query = [];
    var key;
    for (key in (parameters || {})) {
      if (Object.prototype.hasOwnProperty.call(parameters, key)) { query.push(encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key])); }
    }
    return String(base || DEFAULT_BASE).replace(/\/$/, '') + '/' + String(path || '').replace(/^\//, '') + (query.length ? '?' + query.join('&') : '');
  }

  function request(rootObject, options, method, requestUrl, callback) {
    var xhr = new rootObject.XMLHttpRequest();
    var nativeAbort = xhr.abort;
    var complete = false;
    function finish(error, text) {
      if (complete) { return; }
      complete = true;
      callback(error, text || '');
    }
    try {
      xhr.open(method, requestUrl, true);
      xhr.timeout = Number(options.timeout || 6000);
      if (xhr.setRequestHeader) {
        xhr.setRequestHeader('X-Plex-Token', options.token || '');
        xhr.setRequestHeader('Accept', 'application/json');
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) { finish(null, xhr.responseText); }
        else { finish(new Error('Plex Watchlist request failed: ' + xhr.status)); }
      };
      xhr.onerror = function () { finish(new Error('Plex Watchlist request failed')); };
      xhr.ontimeout = function () { finish(new Error('Plex Watchlist request timed out')); };
      xhr.send();
    } catch (error) {
      (rootObject.setTimeout || setTimeout)(function () { finish(error); }, 0);
    }
    return {
      abort: function () {
        if (complete) { return; }
        complete = true;
        if (nativeAbort) { nativeAbort.call(xhr); }
      }
    };
  }

  function featureList(value) {
    var provider = value && (value.MediaProvider || value.mediaProvider || value);
    var features = provider && (provider.Feature || provider.feature || provider.features) || [];
    return Object.prototype.toString.call(features) === '[object Array]' ? features : [features];
  }

  function childList(value, names) {
    var result = [];
    var index;
    var child;
    for (index = 0; index < names.length; index += 1) {
      child = value && value[names[index]];
      if (!child) { continue; }
      result = result.concat(Object.prototype.toString.call(child) === '[object Array]' ? child : [child]);
    }
    return result;
  }

  function visitFeature(feature, callback) {
    var children;
    var index;
    if (!feature || typeof feature !== 'object') { return; }
    callback(feature);
    children = childList(feature, ['Action', 'action', 'Directory', 'directory', 'Pivot', 'pivot', 'Feature', 'feature']);
    for (index = 0; index < children.length; index += 1) { visitFeature(children[index], callback); }
  }

  function providerFromJson(text, baseUrl) {
    var features = featureList(JSON.parse(text || '{}'));
    var provider = {
      baseUrl: String(baseUrl || DEFAULT_BASE).replace(/\/$/, ''),
      watchlistPath: '/library/sections/watchlist/all',
      searchPath: '/library/search',
      addPath: '/actions/addToWatchlist',
      removePath: '/actions/removeFromWatchlist'
    };
    features.forEach(function (feature) {
      visitFeature(feature, function (entry) {
        var action = String(entry.action || entry.id || entry.type || '').toLowerCase();
        var key = entry.key || entry.path || '';
        if (/watchlist\/all/i.test(key)) { provider.watchlistPath = key; }
        if (action.indexOf('search') !== -1 && key) { provider.searchPath = key; }
        if (/addtowatchlist/i.test(action + ' ' + key)) { provider.addPath = key; }
        if (/removefromwatchlist/i.test(action + ' ' + key)) { provider.removePath = key; }
      });
    });
    return provider;
  }

  function discover(rootObject, options, callback) {
    var settings = options || {};
    var base = settings.baseUrl || DEFAULT_BASE;
    return request(rootObject, settings, 'GET', String(base).replace(/\/$/, '') + '/', function (error, text) {
      if (error) { callback(error); return; }
      try { callback(null, providerFromJson(text, base)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function guidFor(value) {
    var guid = value.guid || value.Guid || '';
    var index;
    if (typeof guid === 'string') { return guid; }
    if (Object.prototype.toString.call(guid) !== '[object Array]') { guid = guid ? [guid] : []; }
    for (index = 0; index < guid.length; index += 1) {
      if (guid[index] && /^plex:\/\//.test(guid[index].id || guid[index].tag || '')) { return guid[index].id || guid[index].tag; }
    }
    return '';
  }

  function itemsFromJson(text) {
    var value = JSON.parse(text || '{}');
    var container = value.MediaContainer || value.mediaContainer || value;
    var items = container.Metadata || container.metadata || [];
    if (Object.prototype.toString.call(items) !== '[object Array]') { items = items ? [items] : []; }
    return items.filter(function (item) { return item && (item.type === 'movie' || item.type === 'show') && guidFor(item); }).map(function (item) {
      return { ratingKey: String(item.ratingKey || item.key || ''), type: item.type, title: item.title || '', guid: guidFor(item) };
    });
  }

  function searchItemsFromJson(text) {
    var value = JSON.parse(text || '{}');
    var container = value.MediaContainer || value.mediaContainer || value;
    var searchGroups = container.SearchResults || container.searchResults || [];
    var hubs = container.Hub || container.hub || [];
    var values = [];
    var results;
    var metadata;
    if (Object.prototype.toString.call(searchGroups) !== '[object Array]') { searchGroups = searchGroups ? [searchGroups] : []; }
    searchGroups.forEach(function (group) {
      if (group && group.id && group.id !== 'external') { return; }
      results = childList(group, ['SearchResult', 'searchResult']);
      results.forEach(function (result) {
        metadata = childList(result, ['Metadata', 'metadata']);
        metadata.forEach(function (item) {
          values.push({ item: item, score: Number(result.score || item.score || 0) });
        });
      });
    });
    if (Object.prototype.toString.call(hubs) !== '[object Array]') { hubs = hubs ? [hubs] : []; }
    hubs.forEach(function (hub) {
      metadata = childList(hub, ['Metadata', 'metadata', 'Directory', 'directory']);
      metadata.forEach(function (item) {
        values.push({ item: item, score: Number(item.score || hub.score || 0) });
      });
    });
    return values.filter(function (value) {
      return value.item && (value.item.type === 'movie' || value.item.type === 'show') && guidFor(value.item);
    }).map(function (value) {
      var item = value.item;
      return { ratingKey: String(item.ratingKey || item.key || ''), type: item.type, title: item.title || '', guid: guidFor(item), score: value.score };
    });
  }

  function search(rootObject, options, query, limit, callback) {
    var settings = options || {};
    var provider = settings.provider || { baseUrl: settings.baseUrl || DEFAULT_BASE, searchPath: '/library/search' };
    return request(rootObject, settings, 'GET', url(provider.baseUrl, provider.searchPath || '/library/search', {
      query: query,
      limit: Math.min(30, Math.max(1, Number(limit) || 12)),
      searchProviders: 'discover',
      searchTypes: 'movies,tv',
      includeMetadata: 1
    }), function (error, text) {
      if (error) { callback(error); return; }
      try { callback(null, searchItemsFromJson(text)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function load(rootObject, options, start, size, callback) {
    var settings = options || {};
    var provider = settings.provider || { baseUrl: settings.baseUrl || DEFAULT_BASE, watchlistPath: '/library/sections/watchlist/all' };
    return request(rootObject, settings, 'GET', url(provider.baseUrl, provider.watchlistPath, {
      'X-Plex-Container-Start': Math.max(0, Number(start) || 0),
      'X-Plex-Container-Size': Math.min(100, Math.max(1, Number(size) || 100))
    }), function (error, text) {
      if (error) { callback(error); return; }
      try { callback(null, itemsFromJson(text)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function set(rootObject, options, ratingKey, enabled, callback) {
    var settings = options || {};
    var provider = settings.provider || { baseUrl: settings.baseUrl || DEFAULT_BASE, addPath: '/actions/addToWatchlist', removePath: '/actions/removeFromWatchlist' };
    return request(rootObject, settings, 'PUT', url(provider.baseUrl, enabled ? provider.addPath : provider.removePath, { ratingKey: ratingKey }), function (error) {
      callback(error || null);
    });
  }

  return { DEFAULT_BASE: DEFAULT_BASE, discover: discover, itemsFromJson: itemsFromJson, load: load, providerFromJson: providerFromJson, search: search, searchItemsFromJson: searchItemsFromJson, set: set };
}));
