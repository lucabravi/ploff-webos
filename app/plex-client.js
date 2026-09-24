(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./media-profile'), require('./media-preferences'), require('./version-selection'), require('./plex-url'), require('./plex-search-parser'), require('./plex-playback-urls'), require('./plex-http'), require('./plex-media-mapper'), require('./plex-media-document'), require('./plex-home-model'));
  } else {
    root.PloffClient = factory(root.PloffMediaProfile, root.PloffMediaPreferences, root.PloffVersionSelection, root.PloffPlexUrl, root.PloffPlexSearchParser, root.PloffPlexPlaybackUrls, root.PloffPlexHttp, root.PloffPlexMediaMapper, root.PloffPlexMediaDocument, root.PloffPlexHomeModel);
  }
}(this, function (MediaProfile, MediaPreferences, VersionSelection, PlexUrl, PlexSearchParser, PlexPlaybackUrls, PlexHttp, PlexMediaMapper, PlexMediaDocument, PlexHomeModel) {
  'use strict';

  /**
   * @typedef {Object} PlaybackOptionsRecord
   * @property {*} audioStreamID
   * @property {*} subtitleStreamID
   * @property {number} subtitleSize
   * @property {number} offset
   * @property {string} videoQuality
   * @property {string} playbackMode
   * @property {number=} mediaIndex
   * @property {number=} partIndex
   * @property {string=} delivery
   * @property {boolean=} localSubtitleOverlay
   * @property {string=} videoResolution
   */

  /**
   * @typedef {Object} PlaybackSessionRecord
   * @property {string} ratingKey
   * @property {string} key
   * @property {string} title
   * @property {number} duration
   * @property {*} session
   * @property {*} partId
   * @property {boolean} directPlay
   * @property {string} fileName
   * @property {number} fileSize
   * @property {string} playbackMode
   * @property {Array<*>} markers
   * @property {Array<*>} chapters
   * @property {Array<*>} audioTracks
   * @property {Array<*>} subtitleTracks
   * @property {PlaybackOptionsRecord} options
   * @property {number} resumePosition
   * @property {number} offsetBase
   * @property {*} originalContainer
   * @property {*} originalVideoCodec
   * @property {*} mediaProfile
   * @property {string=} sourceUrl
   * @property {string=} hlsUrl
   * @property {Array<*>=} mediaVersions
   * @property {number=} mediaIndex
   * @property {number=} partIndex
   * @property {string=} partKey
   * @property {string=} transcodeSession
   */

  var transcodeSessionCounter = 0;
  var recommendationCache = {};
  var recommendationCacheOrder = [];
  var recommendationLoadSequence = 0;
  var RECOMMENDATION_CACHE_LIMIT = 4;
  var buildUrl = PlexUrl.buildUrl;
  var assetUrl = PlexUrl.assetUrl;
  var posterUrl = PlexUrl.posterUrl;
  var resolvePlaybackOptions = MediaPreferences.resolvePlaybackOptions;
  var buildLibraryBrowseUrl = PlexUrl.buildLibraryBrowseUrl;
  var buildWatchedUrl = PlexUrl.buildWatchedUrl;
  var buildRemoveFromContinueWatchingUrl = PlexUrl.buildRemoveFromContinueWatchingUrl;
  var buildProgressUrl = PlexUrl.buildProgressUrl;
  var buildLibraryRefreshUrl = PlexUrl.buildLibraryRefreshUrl;
  var buildMetadataRefreshUrl = PlexUrl.buildMetadataRefreshUrl;
  var playbackModeFromXml = PlexPlaybackUrls.playbackModeFromXml;
  var buildStreamSelectionUrl = PlexPlaybackUrls.buildStreamSelectionUrl;
  var buildSubtitleStreamUrl = PlexPlaybackUrls.buildSubtitleStreamUrl;
  var buildSubtitleTranscodeUrl = PlexPlaybackUrls.buildSubtitleTranscodeUrl;
  var buildSubtitleOffsetUrl = PlexPlaybackUrls.buildSubtitleOffsetUrl;
  var hlsUrlFor = PlexPlaybackUrls.hlsUrlFor;
  var buildPlaybackUrl = PlexPlaybackUrls.buildPlaybackUrl;
  var buildDecisionUrl = PlexPlaybackUrls.buildDecisionUrl;
  var mediaFromAttributes = PlexMediaMapper.mediaFromAttributes;
  var containerFromAttributes = PlexMediaMapper.containerFromAttributes;
  var groupRecentAttributes = PlexMediaMapper.groupRecentAttributes;
  var recentCardFromAttributes = PlexMediaMapper.recentCardFromAttributes;
  var detailFromAttributes = PlexMediaMapper.detailFromAttributes;
  var seasonFromAttributes = PlexMediaMapper.seasonFromAttributes;
  var preferredSeasonKeyFromAttributes = PlexMediaMapper.preferredSeasonKeyFromAttributes;
  var episodeFromAttributes = PlexMediaMapper.episodeFromAttributes;
  var chaptersFromAttributes = PlexMediaMapper.chaptersFromAttributes;
  var playbackFromAttributes = PlexMediaMapper.playbackFromAttributes;
  var playbackVersionsFromAttributes = PlexMediaMapper.playbackVersionsFromAttributes;
  var watchedFromAttributes = PlexMediaMapper.watchedFromAttributes;
  var attributesFromNode = PlexMediaDocument.attributesFromNode;
  var attributesFromDocument = PlexMediaDocument.attributesFromDocument;
  var parseAttributes = PlexMediaDocument.parseAttributes;
  var parseXmlDocument = PlexMediaDocument.parseXmlDocument;
  var mediaDocumentFromXml = PlexMediaDocument.parse;
  var mediaDocumentFromDocument = PlexMediaDocument.fromDocument;
  var mediaDocumentFromVideoNode = PlexMediaDocument.fromVideoNode;
  var homeDefinitions = PlexHomeModel.homeDefinitions;
  var mergeRecommendedItems = PlexHomeModel.mergeRecommendedItems;
  var recommendationItemsFromXml = PlexHomeModel.recommendationItemsFromXml;
  var recommendationRowsFromXml = PlexHomeModel.recommendationRowsFromXml;

  function pageNextStart(start, itemCount) {
    return Math.max(0, Number(start) || 0) + Math.max(0, Number(itemCount) || 0);
  }

  function pageTotal(rootAttributes, start, itemCount) {
    var total = Number(rootAttributes && rootAttributes.totalSize);
    var absoluteEnd = pageNextStart(start, itemCount);
    if (!isFinite(total) || total < 0) { total = Number(rootAttributes && rootAttributes.size); }
    if (!isFinite(total) || total < 0) { total = 0; }
    return Math.max(total, absoluteEnd);
  }

  function pageHasMore(rootAttributes, start, itemCount, requestedSize) {
    var total = Number(rootAttributes && rootAttributes.totalSize);
    var absoluteEnd = pageNextStart(start, itemCount);
    if (isFinite(total) && total >= absoluteEnd) { return itemCount > 0 && absoluteEnd < total; }
    return itemCount >= Math.max(1, Number(requestedSize) || 1);
  }

  function firstMetadataNode(documentNode) {
    var candidates = documentNode && documentNode.documentElement ? documentNode.documentElement.childNodes : [];
    var index;
    var node;
    for (index = 0; index < candidates.length; index += 1) {
      node = candidates[index];
      if (node && node.nodeType === 1 && (node.nodeName === 'Video' || node.nodeName === 'Directory')) { return node; }
    }
    return null;
  }

  function directChildAttributes(parentNode, nodeName) {
    var children = parentNode ? parentNode.childNodes : [];
    var result = [];
    var index;
    for (index = 0; index < children.length; index += 1) {
      if (children[index] && children[index].nodeType === 1 && children[index].nodeName === nodeName) {
        result.push(attributesFromNode(children[index]));
      }
    }
    return result;
  }

  function decorateDetail(detail, metadataNode, baseUrl, token) {
    var roles = directChildAttributes(metadataNode, 'Role');
    detail.genres = directChildAttributes(metadataNode, 'Genre').map(function (attributes) { return attributes.tag || ''; }).filter(function (value) { return !!value; });
    detail.directors = directChildAttributes(metadataNode, 'Director').map(function (attributes) { return attributes.tag || ''; }).filter(function (value) { return !!value; });
    detail.cast = roles.map(function (attributes) {
      return {
        id: attributes.id || attributes.tagKey || '',
        name: attributes.tag || '',
        role: attributes.role || '',
        thumb: assetUrl(baseUrl, attributes.thumb || '', token)
      };
    }).filter(function (person) { return !!person.name; });
    return detail;
  }

  var searchParser = PlexSearchParser.create({ mediaFromAttributes: mediaFromAttributes });

  function searchItemsFromXml(xmlText, baseUrl, token, query) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var hubs = documentNode.getElementsByTagName('Hub');
    var attributesList = [];
    var hubIndex;
    var childIndex;
    var node;
    if (documentNode.getElementsByTagName('parsererror').length) {
      throw new Error('Invalid Plex search response');
    }
    for (hubIndex = 0; hubIndex < hubs.length; hubIndex += 1) {
      for (childIndex = 0; childIndex < hubs[hubIndex].childNodes.length; childIndex += 1) {
        node = hubs[hubIndex].childNodes[childIndex];
        if (node.nodeType === 1 && (node.nodeName === 'Video' || node.nodeName === 'Directory')) {
          attributesList.push(attributesFromNode(node));
        }
      }
    }
    return searchParser.searchItemsFromAttributes(attributesList, baseUrl, token, query);
  }

  function mediaProfileFromParsedDocument(parsed) {
    var profiles;
    if (!parsed || !parsed.videoNode || !parsed.mediaEntries.length || !MediaProfile) { return null; }
    profiles = MediaProfile.fromVersions(parsed.video, parsed.groups);
    if (!profiles.length) { return null; }
    profiles[0].versions = profiles;
    return profiles[0];
  }

  function touchRecommendationCache(key) {
    var index = recommendationCacheOrder.indexOf(key);
    var evicted;
    if (index !== -1) { recommendationCacheOrder.splice(index, 1); }
    recommendationCacheOrder.push(key);
    while (recommendationCacheOrder.length > RECOMMENDATION_CACHE_LIMIT) {
      evicted = recommendationCacheOrder.shift();
      delete recommendationCache[evicted];
    }
  }

  function cachedRecommendations(key, currentTime) {
    var cached = recommendationCache[key];
    var index;
    if (!cached) { return null; }
    if (currentTime < cached.savedAt || currentTime - cached.savedAt >= 300000) {
      delete recommendationCache[key];
      index = recommendationCacheOrder.indexOf(key);
      if (index !== -1) { recommendationCacheOrder.splice(index, 1); }
      return null;
    }
    touchRecommendationCache(key);
    return cached.items.slice(0);
  }

  function storeRecommendations(key, items, currentTime, loadSequence) {
    var cached = recommendationCache[key];
    if (cached && Number(cached.loadSequence || 0) > Number(loadSequence || 0)) { return false; }
    recommendationCache[key] = { savedAt: currentTime, items: items.slice(0), loadSequence: Number(loadSequence || 0) };
    touchRecommendationCache(key);
    return true;
  }

  function loadRecommendedItems(config, sections, callback) {
    var libraries = (sections || []).filter(function (section) {
      return section.key && (section.type === 'movie' || section.type === 'show');
    });
    var cacheKey = String(config.apiBaseUrl || '') + '|' + String(config.token || '') + '|' + libraries.map(function (section) { return section.key; }).join(',');
    var cached = cachedRecommendations(cacheKey, new Date().getTime());
    var pending = libraries.length;
    var requests = [];
    var itemLists = libraries.map(function () { return []; });
    var items = [];
    var aborted = false;
    var failed = false;
    var loadSequence;
    if (cached) {
      callback(null, cached);
      return { abort: function () { aborted = true; } };
    }
    if (!pending) {
      callback(null, []);
      return { abort: function () { aborted = true; } };
    }
    recommendationLoadSequence += 1;
    loadSequence = recommendationLoadSequence;
    libraries.forEach(function (section, libraryIndex) {
      requests.push(request(buildUrl(config.apiBaseUrl, '/hubs/sections/' + section.key, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': config.itemLimit || 12
      }, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
        if (aborted) { return; }
        if (error) { failed = true; }
        else {
          try {
            itemLists[libraryIndex] = recommendationItemsFromXml(xmlText, config.apiBaseUrl, config.token || '');
            itemLists[libraryIndex].forEach(function (item) {
              if (!item.libraryTitle) { item.libraryTitle = section.title || ''; }
            });
          } catch (parseError) { failed = true; }
        }
        pending -= 1;
        if (!pending) {
          items = mergeRecommendedItems(itemLists, config.itemLimit || 12);
          if (!failed) { storeRecommendations(cacheKey, items, new Date().getTime(), loadSequence); }
          callback(null, items);
        }
      }));
    });
    return {
      abort: function () {
        aborted = true;
        requests.forEach(function (entry) { if (entry && entry.abort) { entry.abort(); } });
      }
    };
  }

  function loadLibraryRecommendations(config, library, callback) {
    return request(buildUrl(config.apiBaseUrl, '/hubs/sections/' + library.key, {
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': config.itemLimit || 12
    }, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
      var rows;
      if (error) { callback(error); return; }
      try { rows = recommendationRowsFromXml(xmlText, config.apiBaseUrl, config.token || ''); }
      catch (parseError) { callback(parseError); return; }
      callback(null, rows);
    });
  }

  function librarySectionsFromAttributes(sections) {
    return (sections || []).filter(function (section) {
      return !!(section && section.key && section.title && (section.type === 'movie' || section.type === 'show'));
    }).map(function (section) {
      return { key: String(section.key), title: String(section.title), type: String(section.type) };
    });
  }

  function navigationDefinitions(sections) {
    /** @type {Array<Object>} */
    var items = [{ title: 'Home', kind: 'home', labelKey: 'nav.home' }];
    librarySectionsFromAttributes(sections).forEach(function (section) {
      items.push({ title: section.title, kind: 'library', key: section.key, type: section.type });
    });
    items.push({ title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' });
    items.push({ title: 'Playlists', kind: 'playlists', labelKey: 'nav.playlists' });
    items.push({ title: 'Cerca', kind: 'search', labelKey: 'nav.search' });
    items.push({ title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' });
    return items;
  }

  function accountProfileFromJson(jsonText) {
    var value = JSON.parse(jsonText);
    return { locale: value.locale || '', profile: value.profile || {} };
  }

  function loadAccountProfile(config, callback) {
    var base = config.accountBaseUrl || 'https://plex.tv';
    var url = buildUrl(base, '/api/v2/user', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, jsonText) {
      var profile;
      if (error) { callback(error); return; }
      try { profile = accountProfileFromJson(jsonText); }
      catch (parseError) { callback(parseError); return; }
      callback(null, profile);
    });
  }

  function loadLibrarySections(config, callback) {
    var url = buildUrl(config.apiBaseUrl, config.sectionsPath || '/library/sections', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var sections;
      if (error) { callback(error); return; }
      try { sections = librarySectionsFromAttributes(parseAttributes(xmlText)); }
      catch (parseError) { callback(parseError); return; }
      callback(null, sections);
    });
  }

  function loadNavigation(config, callback) {
    return loadLibrarySections(config, function (error, sections) {
      if (error) { callback(error); return; }
      callback(null, navigationDefinitions(sections));
    });
  }

  function findByGuid(config, guid, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/all', { guid: guid, includeGuids: 1 }, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var attributes;
      var item;
      if (error) { callback(error); return; }
      try {
        attributes = parseAttributes(xmlText);
        item = attributes.length ? mediaFromAttributes(attributes[0], config.apiBaseUrl, config.token || '') : null;
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, item);
    });
  }

  function requestWithMethod(url, method, timeout, callback, headers) {
    return PlexHttp.request({ XMLHttpRequest: XMLHttpRequest, setTimeout: setTimeout }, {
      method: method,
      url: url,
      timeout: timeout,
      headers: headers || {},
      statusError: function (status) { return new Error('Plex request failed with status ' + status); },
      networkError: 'Plex request failed',
      timeoutError: 'Plex request timed out'
    }, callback);
  }

  function request(url, timeout, callback) {
    return requestWithMethod(url, 'GET', timeout, callback);
  }

  function activityFromValue(value) {
    return {
      id: String(value.uuid || ''),
      type: String(value.type || ''),
      title: String(value.title || ''),
      subtitle: String(value.subtitle || ''),
      progress: isFinite(Number(value.progress)) ? Number(value.progress) : -1,
      cancellable: value.cancellable === true || value.cancellable === 1 || value.cancellable === '1'
    };
  }

  function activityItemsFromJson(jsonText) {
    var parsed = JSON.parse(jsonText);
    var values = parsed && parsed.MediaContainer ? parsed.MediaContainer.Activity : [];
    if (!values) { return []; }
    if (Object.prototype.toString.call(values) !== '[object Array]') { values = [values]; }
    return values.map(activityFromValue).filter(function (activity) { return !!activity.id; });
  }

  function loadActivities(config, callback) {
    var url = buildUrl(config.apiBaseUrl, '/activities', {}, config.token || '');
    return requestWithMethod(url, 'GET', config.requestTimeout || 8000, function (error, jsonText) {
      var activities;
      if (error) { callback(error); return; }
      try { activities = activityItemsFromJson(jsonText); }
      catch (parseError) { callback(parseError); return; }
      callback(null, activities);
    }, { Accept: 'application/json' });
  }

  function activityIdFromResponse(xhr) {
    try { return String(xhr && xhr.getResponseHeader ? xhr.getResponseHeader('X-Plex-Activity') || '' : ''); }
    catch (error) { return ''; }
  }

  function search(config, query, libraries, callback) {
    var aborted = false;
    var url = buildUrl(config.apiBaseUrl, '/hubs/search', {
      query: query,
      limit: config.searchItemLimit || 60
    }, config.token || '');
    var searchRequest = request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var items;
      if (aborted) { return; }
      if (error) { callback(error); return; }
      try {
        items = searchItemsFromXml(xmlText, config.apiBaseUrl, config.token || '', query);
      } catch (parseError) { callback(parseError); return; }
      callback(null, items);
    });
    return {
      abort: function () {
        aborted = true;
        if (searchRequest && searchRequest.abort) { searchRequest.abort(); }
      }
    };
  }


  function libraryFilterOptionsFromXml(xmlText) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var nodes;
    var options = [];
    var index;
    var attributes;
    if (documentNode.getElementsByTagName('parsererror').length) { throw new Error('Invalid Plex filter response'); }
    nodes = documentNode.getElementsByTagName('Directory');
    for (index = 0; index < nodes.length; index += 1) {
      attributes = attributesFromNode(nodes[index]);
      if (attributes.title || attributes.key) {
        options.push({ value: attributes.key || attributes.title, label: attributes.title || attributes.key });
      }
    }
    return options;
  }

  function loadLibraryFilterOptions(config, library, callback) {
    var keys = ['year', 'genre', 'actor', 'director', 'resolution'];
    var pending = keys.length;
    var result = { hdr: [{ value: '1', label: 'HDR' }, { value: '0', label: 'SDR' }] };
    var requests = [];
    var aborted = false;
    var firstError = null;
    keys.forEach(function (key) {
      requests.push(request(buildUrl(config.apiBaseUrl, '/library/sections/' + library.key + '/' + key, {}, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
        if (aborted) { return; }
        if (error && !firstError) { firstError = error; }
        try { result[key] = error ? [] : libraryFilterOptionsFromXml(xmlText); }
        catch (parseError) {
          result[key] = [];
          if (!firstError) { firstError = parseError; }
        }
        pending -= 1;
        if (!pending) { callback(firstError, result); }
      }));
    });
    return {
      abort: function () {
        aborted = true;
        requests.forEach(function (entry) { if (entry && entry.abort) { entry.abort(); } });
      }
    };
  }

  function loadPagedContainer(config, options, callback) {
    var settings = options || {};
    var start = Math.max(0, Number(settings.start || 0));
    var size = Math.max(1, Number(settings.size || 1));
    return request(settings.url, config.requestTimeout || 8000, function (error, xmlText) {
      var documentNode;
      var rootAttributes;
      var attributes;
      var pageItemCount;
      var filteredItemCount;
      var items;
      var page;
      if (error) { callback(error); return; }
      try {
        documentNode = parseXmlDocument(xmlText, settings.errorMessage);
        rootAttributes = attributesFromNode(documentNode.documentElement);
        attributes = attributesFromDocument(documentNode);
        pageItemCount = attributes.length;
        if (settings.attachSourceOffset) {
          attributes.forEach(function (attributesItem, index) {
            attributesItem.__ploffSourceOffset = start + index;
          });
        }
        if (settings.filter) { attributes = attributes.filter(settings.filter); }
        filteredItemCount = pageItemCount - attributes.length;
        if (settings.transform) { attributes = settings.transform(attributes); }
        items = settings.map ? attributes.map(function (attributesItem) {
          var mapped = settings.map(attributesItem);
          if (settings.attachSourceOffset && mapped && typeof mapped === 'object') {
            mapped.plexSourceOffset = Math.max(0, Number(attributesItem.__ploffSourceOffset || 0));
          }
          return mapped;
        }) : attributes;
        page = {
          items: items,
          totalSize: pageTotal(rootAttributes, start, pageItemCount),
          nextStart: pageNextStart(start, pageItemCount),
          hasMore: pageHasMore(rootAttributes, start, pageItemCount, size),
          libraryKey: String(settings.libraryKey || ''),
          localFilteredCount: settings.trackLocalFilter ? filteredItemCount : 0
        };
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, page);
    });
  }

  function loadLibraryPage(config, library, view, options, start, size, callback) {
    var mapItem;
    if (view === 'playlists') { return loadLibraryPlaylists(config, library, start, size, callback); }
    mapItem = function (item) {
      if (view === 'collections') { return containerFromAttributes(item, config.apiBaseUrl, config.token || '', view); }
      return view === 'recent'
        ? recentCardFromAttributes(item, config.apiBaseUrl, config.token || '')
        : mediaFromAttributes(item, config.apiBaseUrl, config.token || '');
    };
    return loadPagedContainer(config, {
      url: buildLibraryBrowseUrl(config, library, view, options, start, size),
      start: start,
      size: size,
      errorMessage: 'Invalid Plex library response',
      filter: view === 'catalog' && options && options.watched === 'unwatched'
        ? function (item) { return watchedFromAttributes(item) !== true; }
        : null,
      transform: view === 'recent' ? groupRecentAttributes : null,
      map: mapItem,
      attachSourceOffset: view === 'catalog',
      trackLocalFilter: view === 'catalog' && options && options.watched === 'unwatched',
      libraryKey: library.key
    }, callback);
  }

  function loadLibraryPlaylists(config, library, start, size, callback) {
    return loadPagedContainer(config, {
      url: buildLibraryBrowseUrl(config, library, 'playlists', {}, start, size),
      start: start,
      size: size,
      errorMessage: 'Invalid Plex playlist response',
      filter: function (item) {
        return !!(item.key || item.ratingKey) && Math.max(0, Number(item.leafCount || item.childCount || 0)) > 0;
      },
      map: function (item) { return containerFromAttributes(item, config.apiBaseUrl, config.token || '', 'playlists'); },
      libraryKey: library.key
    }, callback);
  }

  function loadSettingsBackupPlaylists(config, titlePrefix, marker, callback) {
    return request(buildUrl(config.apiBaseUrl, '/playlists', { playlistType: 'video' }, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
      var items;
      if (error) { callback(error); return; }
      try {
        items = parseAttributes(xmlText).filter(function (item) {
          return String(item.title || '').indexOf(String(titlePrefix || '')) === 0 && String(item.summary || '').indexOf(String(marker || '')) === 0;
        });
      } catch (parseError) { callback(parseError); return; }
      callback(null, items);
    });
  }

  function createSettingsBackupPlaylist(config, title, callback) {
    var requests = [];
    var aborted = false;
    function stop() { return aborted; }
    function track(operation) { requests.push(operation); return operation; }
    function fail(error) { if (!stop()) { callback(error); } }
    function create(identity, ratingKey) {
      var uri = 'server://' + identity.machineIdentifier + '/com.plexapp.plugins.library/library/metadata/' + ratingKey;
      track(requestWithMethod(buildUrl(config.apiBaseUrl, '/playlists', { type: 'video', title: title, smart: 0, uri: uri }, config.token || ''), 'POST', config.requestTimeout || 8000, function (error, xmlText) {
        var playlist;
        if (error) { fail(error); return; }
        try { playlist = parseAttributes(xmlText)[0] || {}; }
        catch (parseError) { fail(parseError); return; }
        if (!playlist.ratingKey) { fail(new Error('Plex did not create the settings backup playlist')); return; }
        track(request(buildUrl(config.apiBaseUrl, '/playlists/' + playlist.ratingKey + '/items', {}, config.token || ''), config.requestTimeout || 8000, function (itemsError, itemsXml) {
          var seed;
          if (itemsError) { fail(itemsError); return; }
          try { seed = parseAttributes(itemsXml)[0] || {}; }
          catch (parseItemsError) { fail(parseItemsError); return; }
          if (!seed.playlistItemID) { fail(new Error('Plex settings backup seed is unavailable')); return; }
          track(requestWithMethod(buildUrl(config.apiBaseUrl, '/playlists/' + playlist.ratingKey + '/items/' + seed.playlistItemID, {}, config.token || ''), 'DELETE', config.requestTimeout || 8000, function (removeError) {
            if (!stop()) { callback(removeError || null, playlist); }
          }));
        }));
      }));
    }
    track(loadServerIdentity(config, function (identityError, identity) {
      if (identityError) { fail(identityError); return; }
      track(request(buildUrl(config.apiBaseUrl, '/library/sections', {}, config.token || ''), config.requestTimeout || 8000, function (sectionsError, sectionsXml) {
        var sections;
        var section;
        var mediaType;
        if (sectionsError) { fail(sectionsError); return; }
        try { sections = parseAttributes(sectionsXml); }
        catch (parseError) { fail(parseError); return; }
        section = sections.filter(function (item) { return item.type === 'movie' || item.type === 'show'; })[0];
        if (!section) { fail(new Error('A playable Plex library is required for settings backup')); return; }
        mediaType = section.type === 'movie' ? 1 : 4;
        track(request(buildUrl(config.apiBaseUrl, '/library/sections/' + section.key + '/all', {
          type: mediaType, 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': 1
        }, config.token || ''), config.requestTimeout || 8000, function (mediaError, mediaXml) {
          var media;
          if (mediaError) { fail(mediaError); return; }
          try { media = parseAttributes(mediaXml)[0] || {}; }
          catch (parseMediaError) { fail(parseMediaError); return; }
          if (!media.ratingKey) { fail(new Error('A playable Plex item is required for settings backup')); return; }
          create(identity, media.ratingKey);
        }));
      }));
    }));
    return { abort: function () { aborted = true; requests.forEach(function (entry) { if (entry && entry.abort) { entry.abort(); } }); } };
  }

  function updateSettingsBackupPlaylist(config, ratingKey, summary, callback) {
    return requestWithMethod(buildUrl(config.apiBaseUrl, '/playlists/' + ratingKey, { summary: summary }, config.token || ''), 'PUT', config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function deleteSettingsBackupPlaylist(config, ratingKey, callback) {
    return requestWithMethod(buildUrl(config.apiBaseUrl, '/playlists/' + ratingKey, {}, config.token || ''), 'DELETE', config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function loadLibraryContainerPage(config, container, start, size, callback) {
    return loadPagedContainer(config, {
      url: buildUrl(config.apiBaseUrl, container.containerKey, {
        'X-Plex-Container-Start': Math.max(0, Number(start || 0)),
        'X-Plex-Container-Size': Math.max(1, Number(size || 60))
      }, config.token || ''),
      start: start,
      size: size,
      map: function (item) { return mediaFromAttributes(item, config.apiBaseUrl, config.token || ''); }
    }, callback);
  }

  function loadRows(config, definitions, callback) {
    var rows = [];
    var remaining = definitions.length;
    var firstError = null;
    var requests = [];
    var aborted = false;

    function abort() {
      if (aborted) { return; }
      aborted = true;
      requests.forEach(function (entry) { if (entry && entry.abort) { entry.abort(); } });
      requests = [];
    }

    if (!remaining) {
      callback(null, []);
      return { abort: abort };
    }

    definitions.forEach(function (definition, index) {
      var url = buildUrl(config.apiBaseUrl, definition.path, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': definition.groupRecent ? (config.recentItemLimit || 30) : (config.itemLimit || 12)
      }, config.token || '');

      requests.push(request(url, config.requestTimeout || 8000, function (error, xmlText) {
        var attributes;
        if (aborted) { return; }
        if (error) {
          firstError = firstError || error;
        } else {
          try {
            attributes = parseAttributes(xmlText);
            if (definition.groupRecent) { attributes = groupRecentAttributes(attributes); }
            rows[index] = {
              title: definition.title,
              titleKey: definition.titleKey || '',
              titleParameters: definition.titleParameters || null,
              kind: definition.kind || '',
              shape: 'poster',
              sectionKey: definition.sectionKey || '',
              sectionTitle: definition.sectionTitle || '',
              showLibraryBadge: definition.showLibraryBadge === true,
              items: attributes.slice(0, config.itemLimit || 12).map(function (item) {
                return mediaFromAttributes(item, config.apiBaseUrl, config.token || '');
              })
            };
          } catch (parseError) {
            firstError = firstError || parseError;
          }
        }
        remaining -= 1;
        if (remaining === 0) {
          rows = rows.filter(function (row) { return !!(row && row.items && row.items.length); });
          requests = [];
          callback(rows.length ? null : firstError, rows);
        }
      }));
    });

    return { abort: abort };
  }

  function loadHome(config, callback) {
    var sectionsUrl = buildUrl(
      config.apiBaseUrl,
      config.sectionsPath || '/library/sections',
      {},
      config.token || ''
    );
    var requests = [];
    var aborted = false;
    var finished = false;
    var baseComplete = false;
    var recommendationsComplete = false;
    var recommendationDeadlineReached = false;
    var recommendationDeadline = null;
    var baseError = null;
    var baseRows = [];
    var recommendedItems = [];

    function track(requestHandle) {
      if (!requestHandle) { return; }
      if (aborted && requestHandle.abort) { requestHandle.abort(); }
      else { requests.push(requestHandle); }
    }

    function finish() {
      if (aborted || finished || !baseComplete || (!recommendationsComplete && !recommendationDeadlineReached)) { return; }
      finished = true;
      if (recommendationDeadline !== null) { clearTimeout(recommendationDeadline); }
      recommendationDeadline = null;
      requests = [];
      if (recommendedItems.length) {
        baseRows.splice(1, 0, { title: 'home.recommended', titleKey: 'home.recommended', kind: 'recommended', recommendation: true, showLibraryBadge: true, shape: 'poster', items: recommendedItems });
      }
      callback(baseRows.length ? null : baseError, baseRows);
    }

    function fail(error) {
      if (aborted || finished) { return; }
      finished = true;
      requests = [];
      callback(error);
    }

    function abort() {
      var active;
      if (aborted || finished) { return; }
      aborted = true;
      finished = true;
      if (recommendationDeadline !== null) { clearTimeout(recommendationDeadline); }
      recommendationDeadline = null;
      active = requests;
      requests = [];
      active.forEach(function (entry) { if (entry && entry.abort) { entry.abort(); } });
    }

    track(request(sectionsUrl, config.requestTimeout || 8000, function (error, xmlText) {
      var sections;
      var definitions;
      if (aborted || finished) { return; }
      if (error) { fail(error); return; }
      try {
        sections = parseAttributes(xmlText);
        definitions = homeDefinitions(sections, config);
      } catch (parseError) {
        fail(parseError);
        return;
      }
      recommendationDeadline = setTimeout(function () {
        if (aborted || finished) { return; }
        recommendationDeadlineReached = true;
        finish();
      }, 400);
      track(loadRows(config, definitions, function (rowsError, rows) {
        if (aborted || finished) { return; }
        baseError = rowsError;
        baseRows = rows || [];
        baseComplete = true;
        finish();
      }));
      track(loadRecommendedItems(config, sections, function (recommendationError, items) {
        if (aborted || finished) { return; }
        recommendedItems = recommendationError ? [] : (items || []);
        recommendationsComplete = true;
        finish();
      }));
    }));

    return { abort: abort };
  }

  function loadMetadata(config, ratingKey, callback) {
    var url = buildUrl(
      config.apiBaseUrl,
      '/library/metadata/' + ratingKey,
      { includeGuids: 1 },
      config.token || ''
    );
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var attributes;
      if (error) {
        callback(error);
        return;
      }
      try {
        var documentNode = parseXmlDocument(xmlText);
        var metadataNode = firstMetadataNode(documentNode);
        var detail;
        var mediaProfile;
        attributes = metadataNode ? attributesFromNode(metadataNode) : null;
        if (!attributes) {
          throw new Error('Plex metadata response is empty');
        }
        detail = decorateDetail(detailFromAttributes(attributes, config.apiBaseUrl, config.token || ''), metadataNode, config.apiBaseUrl, config.token || '');
        mediaProfile = metadataNode.nodeName === 'Video' && mediaDocumentFromDocument ? mediaProfileFromParsedDocument(mediaDocumentFromDocument(documentNode)) : null;
        if (mediaProfile) { detail.mediaProfile = mediaProfile; }
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, detail);
    });
  }

  function loadExtras(config, ratingKey, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey + '/extras', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var items;
      if (error) { callback(error); return; }
      try {
        items = parseAttributes(xmlText).map(function (attributes) {
          var item = mediaFromAttributes(attributes, config.apiBaseUrl, config.token || '');
          item.subtype = attributes.subtype || '';
          item.extraType = attributes.extraType || '';
          return item;
        });
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, items);
    });
  }

  function loadSeasonEpisodes(config, seasonKey, selectedKey, callback, seasonYear) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + seasonKey + '/children', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var episodes = [];
      var selectedFound = false;
      var documentNode;
      var candidates;
      var index;
      var node;
      if (error) {
        callback(error);
        return;
      }
      try {
        documentNode = parseXmlDocument(xmlText);
        candidates = documentNode.documentElement.childNodes;
        for (index = 0; index < candidates.length; index += 1) {
          node = candidates[index];
          if (node.nodeType !== 1 || node.nodeName !== 'Video') { continue; }
          var attributes = attributesFromNode(node);
          var episode = episodeFromAttributes(attributes, config.apiBaseUrl, config.token || '', selectedKey || '', seasonYear);
          var parsed = mediaDocumentFromVideoNode ? mediaDocumentFromVideoNode(node, documentNode) : null;
          var mediaProfile = parsed ? mediaProfileFromParsedDocument(parsed) : null;
          if (mediaProfile) { episode.mediaProfile = mediaProfile; }
          episodes.push(episode);
        }
        episodes.forEach(function (episode) {
          selectedFound = selectedFound || episode.selected;
        });
        if (!selectedFound && episodes.length) {
          episodes.some(function (episode) {
            if (!episode.viewed) {
              episode.selected = true;
              selectedFound = true;
              return true;
            }
            return false;
          });
          if (!selectedFound) {
            episodes[0].selected = true;
          }
        }
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, episodes);
    });
  }

  function loadSeriesContext(config, detail, callback) {
    var showKey = detail.showRatingKey || (detail.type === 'show' ? detail.ratingKey : '');
    var seasonKey = detail.seasonRatingKey;
    var currentRequest = null;
    var aborted = false;
    var url;
    var selectedSeasonYear = null;

    function abort() {
      if (aborted) { return; }
      aborted = true;
      if (currentRequest && currentRequest.abort) { currentRequest.abort(); }
      currentRequest = null;
    }

    if (!showKey) {
      callback(null, null);
      return { abort: abort };
    }
    url = buildUrl(config.apiBaseUrl, '/library/metadata/' + showKey + '/children', {}, config.token || '');
    currentRequest = request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var seasons;
      var seasonAttributes;
      if (aborted) { return; }
      currentRequest = null;
      if (error) {
        callback(error);
        return;
      }
      try {
        seasonAttributes = parseAttributes(xmlText).filter(function (attributes) {
          return !!attributes.ratingKey;
        });
        seasonKey = preferredSeasonKeyFromAttributes(seasonAttributes, seasonKey);
        seasons = seasonAttributes.map(function (attributes) {
          return seasonFromAttributes(attributes, config.apiBaseUrl, config.token || '', seasonKey);
        });
        seasons.some(function (season) {
          if (String(season.ratingKey || '') !== String(seasonKey || '')) { return false; }
          selectedSeasonYear = season.year || null;
          return true;
        });
      } catch (parseError) {
        callback(parseError);
        return;
      }
      if (!seasonKey) {
        callback(null, { seasons: seasons, episodes: [] });
        return;
      }
      currentRequest = loadSeasonEpisodes(config, seasonKey, detail.type === 'episode' ? detail.ratingKey : '', function (episodeError, episodes) {
        if (aborted) { return; }
        currentRequest = null;
        if (episodeError) { callback(episodeError); }
        else { callback(null, { seasons: seasons, episodes: episodes }); }
      }, selectedSeasonYear);
    });
    return { abort: abort };
  }

  function loadPlayback(config, ratingKey, session, preferences, callback) {
    if (typeof preferences === 'function') {
      callback = preferences;
      preferences = null;
    }
    var currentRequest = null;
    var aborted = false;
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey, { includeMarkers: 1, includeChapters: 1 }, config.token || '');

    function abort() {
      if (aborted) { return; }
      aborted = true;
      if (currentRequest && currentRequest.abort) { currentRequest.abort(); }
      currentRequest = null;
    }

    currentRequest = request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parsed;
      var versions;
      var selectedMediaIndex;
      var selectedPartIndex;
      var selectedVersion;
      var mediaEntry;
      var partEntry;
      var markerNodes;
      var markers = [];
      var chapterNodes;
      var chapters = [];
      var index;
      var playback;
      if (aborted) { return; }
      currentRequest = null;
      if (error) {
        callback(error);
        return;
      }
      try {
        parsed = mediaDocumentFromXml(xmlText, 'Invalid Plex playback response');
        versions = playbackVersionsFromAttributes(parsed.groups);
        selectedVersion = VersionSelection && VersionSelection.select(versions, {
          affinity: preferences && preferences.versionAffinity,
          capabilities: preferences && preferences.playbackCapabilities,
          explicitMediaIndex: preferences && preferences.mediaIndex,
          explicitPartIndex: preferences && preferences.partIndex,
          mode: preferences && preferences.playbackMode,
          priorities: preferences && preferences.videoVersionPriorities
        });
        selectedMediaIndex = selectedVersion ? selectedVersion.mediaIndex : (preferences && isFinite(Number(preferences.mediaIndex)) ? Number(preferences.mediaIndex) : 0);
        selectedPartIndex = selectedVersion ? selectedVersion.partIndex : (preferences && isFinite(Number(preferences.partIndex)) ? Number(preferences.partIndex) : 0);
        mediaEntry = parsed.mediaEntries[selectedMediaIndex] || parsed.mediaEntries[0];
        partEntry = mediaEntry ? mediaEntry.parts[selectedPartIndex] || mediaEntry.parts[0] : null;
        if (!parsed.videoNode || !mediaEntry || !partEntry) {
          throw new Error('Plex playback media is incomplete');
        }
        markerNodes = parsed.documentNode.getElementsByTagName('Marker');
        for (index = 0; index < markerNodes.length; index += 1) {
          markers.push(attributesFromNode(markerNodes[index]));
        }
        chapterNodes = parsed.documentNode.getElementsByTagName('Chapter');
        for (index = 0; index < chapterNodes.length; index += 1) {
          chapters.push(attributesFromNode(chapterNodes[index]));
        }
        playback = playbackFromAttributes(
          parsed.video,
          mediaEntry.media,
          partEntry.part,
          session,
          partEntry.streams,
          markers,
          chaptersFromAttributes(chapters, config.apiBaseUrl, config.token || '')
        );
        playback.sourceUrl = hlsUrlFor(playback, config.apiBaseUrl, config.token || '', playback.options);
        playback.hlsUrl = playback.sourceUrl;
        playback.mediaVersions = versions;
        playback.mediaIndex = parsed.mediaEntries[selectedMediaIndex] === mediaEntry ? selectedMediaIndex : 0;
        playback.partIndex = mediaEntry.parts[selectedPartIndex] === partEntry ? selectedPartIndex : 0;
        playback.partKey = partEntry.part.key || '';
        playback.options.mediaIndex = playback.mediaIndex;
        playback.options.partIndex = playback.partIndex;
        if (preferences) {
          playback.options = resolvePlaybackOptions(playback, preferences);
        }
      } catch (parseError) {
        if (!aborted) { callback(parseError); }
        return;
      }
      function ready() {
        if (!aborted) { callback(null, playback); }
      }
      if (preferences && playback.partId) {
        currentRequest = setStreamSelection(config, playback, playback.options, function (selectionError) {
          if (aborted) { return; }
          currentRequest = null;
          if (selectionError) { callback(selectionError); return; }
          ready();
        });
      } else {
        ready();
      }
    });
    return { abort: abort };
  }

  function loadMediaProfile(config, ratingKey, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey, {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parsed;
      var profiles;
      if (error) { callback(error); return; }
      try {
        parsed = mediaDocumentFromXml(xmlText, 'Invalid Plex media profile response');
        if (!parsed.videoNode || !parsed.mediaEntries.length || !parsed.mediaEntries[0].parts.length || !MediaProfile) {
          throw new Error('Plex media profile is incomplete');
        }
        profiles = mediaProfileFromParsedDocument(parsed);
        if (!profiles) { throw new Error('Plex media profile has no playable versions'); }
      } catch (parseError) {
        callback(parseError);
        return;
      }
      callback(null, profiles);
    });
  }

  function sendTimeline(config, playback, state, time, callback) {
    var duration = Number(playback && playback.duration || 0);
    var position = Math.max(0, Number(time || 0));
    if (duration > 0) { position = Math.min(duration, position); }
    var url = buildUrl(config.apiBaseUrl, '/:/timeline', {
      ratingKey: playback.ratingKey,
      key: playback.key,
      state: state,
      time: Math.round(position),
      duration: playback.duration,
      playQueueItemID: playback.ratingKey,
      'X-Plex-Product': 'Ploff',
      'X-Plex-Version': '0.1',
      'X-Plex-Client-Identifier': 'ploff-webos',
      'X-Plex-Session-Identifier': playback.session
    }, config.token || '');
    request(url, config.requestTimeout || 8000, function (error) {
      if (callback) {
        callback(error || null);
      }
    });
  }

  function rotateTranscodeSession(playback, timestamp) {
    transcodeSessionCounter += 1;
    playback.transcodeSession = 'ploff-transcode-' + String(timestamp === undefined ? new Date().getTime() : timestamp)
      + '-' + String(transcodeSessionCounter);
    return playback.transcodeSession;
  }

  function pingTranscode(config, playback, callback) {
    var session = playback && playback.transcodeSession;
    if (!session) {
      if (callback) { callback(new Error('Plex transcode session is missing')); }
      return null;
    }
    return request(buildUrl(config.apiBaseUrl, '/video/:/transcode/universal/ping', {
      session: session
    }, config.token || ''), config.requestTimeout || 8000, function (error) {
      if (callback) { callback(error || null); }
    });
  }



  function preparePlayback(config, playback, options, callback) {
    playback.sourceUrl = buildPlaybackUrl(config, playback, options);
    playback.hlsUrl = playback.sourceUrl;
    if (options.delivery === 'direct-play') {
      playback.playbackMode = 'direct-play';
      callback(null, playback.sourceUrl, playback.playbackMode);
      return null;
    }
    return request(buildDecisionUrl(config, playback, options), config.requestTimeout || 8000, function (error, xmlText) {
      if (!error) {
        try { playback.playbackMode = playbackModeFromXml(xmlText, options.playbackMode); }
        catch (parseError) { playback.playbackMode = options.playbackMode === 'transcode' ? 'transcode-audio-video' : 'unknown'; }
      }
      callback(error || null, playback.sourceUrl, playback.playbackMode);
    });
  }

  function setStreamSelection(config, playback, options, callback) {
    if (!playback.partId) { callback(new Error('Plex media part ID is missing')); return null; }
    return requestWithMethod(
      buildStreamSelectionUrl(config, playback.partId, options.audioStreamID, options.subtitleStreamID),
      'PUT',
      config.requestTimeout || 8000,
      function (error) { callback(error || null); }
    );
  }

  function loadSubtitleText(config, playback, track, callback) {
    var timeout = config.requestTimeout || 8000;
    var external = track && (track.external || track.key);
    var temporaryPlayback;
    var temporaryOptions;
    var activeRequest = null;
    var stopped = false;

    function finish(error, responseText) {
      callback(error || null, error ? '' : responseText);
    }

    function stopTemporarySession() {
      var session;
      if (stopped || !temporaryPlayback) { return; }
      stopped = true;
      session = temporaryPlayback.transcodeSession;
      request(buildUrl(config.apiBaseUrl, '/video/:/transcode/universal/stop', {
        session: session,
        'X-Plex-Session-Identifier': session
      }, config.token || ''), timeout, function () {});
    }

    function fetchEmbedded(sourcePlayback) {
      activeRequest = request(buildSubtitleTranscodeUrl(config, sourcePlayback, track || {}), timeout, function (error, responseText) {
        activeRequest = null;
        try { finish(error, responseText); }
        finally { stopTemporarySession(); }
      });
    }

    if (external) {
      return request(buildSubtitleStreamUrl(config, track), timeout, function (error, responseText) {
        finish(error, responseText);
      });
    }
    if (playback && playback.transcodeSession) {
      fetchEmbedded(playback);
    } else {
      temporaryPlayback = {};
      Object.keys(playback || {}).forEach(function (key) { temporaryPlayback[key] = playback[key]; });
      temporaryOptions = {};
      Object.keys(playback && playback.options || {}).forEach(function (key) { temporaryOptions[key] = playback.options[key]; });
      temporaryOptions.delivery = 'hls';
      temporaryOptions.playbackMode = 'auto';
      temporaryOptions.subtitleStreamID = track && track.id || '';
      temporaryOptions.localSubtitleOverlay = false;
      temporaryPlayback.options = temporaryOptions;
      rotateTranscodeSession(temporaryPlayback);
      activeRequest = request(buildDecisionUrl(config, temporaryPlayback, temporaryOptions), timeout, function (decisionError) {
        activeRequest = null;
        if (decisionError) {
          try { finish(decisionError, ''); }
          finally { stopTemporarySession(); }
          return;
        }
        fetchEmbedded(temporaryPlayback);
      });
    }
    return {
      abort: function () {
        if (activeRequest && activeRequest.abort) { activeRequest.abort(); }
        activeRequest = null;
        stopTemporarySession();
      }
    };
  }

  function setSubtitleOffset(config, streamId, offsetMs, callback) {
    return requestWithMethod(
      buildSubtitleOffsetUrl(config, streamId, offsetMs),
      'PUT',
      config.requestTimeout || 8000,
      function (error) { callback(error || null); }
    );
  }

  function xmlAttribute(source, name) {
    var match = String(source || '').match(new RegExp('\\b' + name + '=(?:"([^"]*)"|\'([^\']*)\')', 'i'));
    var value = match ? (match[1] !== undefined ? match[1] : match[2]) : '';
    return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function serverIdentityFromXml(xmlText) {
    var container = String(xmlText || '').match(/<MediaContainer\b[^>]*>/i);
    if (!container) { throw new Error('Plex server identity is incomplete'); }
    return {
      name: xmlAttribute(container[0], 'friendlyName'),
      version: xmlAttribute(container[0], 'version'),
      machineIdentifier: xmlAttribute(container[0], 'machineIdentifier')
    };
  }

  function loadServerIdentity(config, callback) {
    return request(buildUrl(config.apiBaseUrl, '/identity', {}, ''), config.requestTimeout || 8000, function (error, xmlText) {
      var identity;
      if (error) { callback(error); return; }
      try { identity = serverIdentityFromXml(xmlText); }
      catch (parseError) { callback(parseError); return; }
      callback(null, identity);
    });
  }


  function setWatched(config, ratingKey, watched, callback) {
    return request(buildWatchedUrl(config, ratingKey, watched), config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }


  function removeFromContinueWatching(config, ratingKey, callback) {
    return requestWithMethod(buildRemoveFromContinueWatchingUrl(config, ratingKey), 'PUT', config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }


  function resetProgress(config, ratingKey, callback) {
    return request(buildProgressUrl(config, ratingKey, -1), config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function setWatchedAndReset(config, ratingKey, watched, callback) {
    var currentRequest = null;
    var aborted = false;

    function abort() {
      if (aborted) { return; }
      aborted = true;
      if (currentRequest && currentRequest.abort) { currentRequest.abort(); }
      currentRequest = null;
    }

    currentRequest = setWatched(config, ratingKey, watched, function (watchedError) {
      if (aborted) { return; }
      currentRequest = null;
      if (watchedError) { callback(watchedError, { watchedApplied: false, progressReset: false }); return; }
      currentRequest = resetProgress(config, ratingKey, function (resetError) {
        if (aborted) { return; }
        currentRequest = null;
        callback(resetError || null, { watchedApplied: true, progressReset: !resetError });
      });
    });
    return { abort: abort };
  }


  function refreshLibrary(config, libraryKey, callback) {
    return requestWithMethod(buildLibraryRefreshUrl(config, libraryKey, false), 'POST', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }

  function refreshLibraryMetadata(config, libraryKey, callback) {
    return requestWithMethod(buildLibraryRefreshUrl(config, libraryKey, true), 'POST', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }


  function refreshMetadata(config, ratingKey, callback) {
    return requestWithMethod(buildMetadataRefreshUrl(config, ratingKey), 'PUT', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }

  return {
    rotateTranscodeSession: rotateTranscodeSession,
    pingTranscode: pingTranscode,
    posterUrl: posterUrl,
    loadMetadata: loadMetadata,
    loadExtras: loadExtras,
    loadActivities: loadActivities,
    loadSubtitleText: loadSubtitleText,
    loadServerIdentity: loadServerIdentity,
    loadAccountProfile: loadAccountProfile,
    loadNavigation: loadNavigation,
    findByGuid: findByGuid,
    loadLibraryFilterOptions: loadLibraryFilterOptions,
    loadLibrarySections: loadLibrarySections,
    loadLibraryContainerPage: loadLibraryContainerPage,
    loadLibraryPage: loadLibraryPage,
    loadSettingsBackupPlaylists: loadSettingsBackupPlaylists,
    createSettingsBackupPlaylist: createSettingsBackupPlaylist,
    updateSettingsBackupPlaylist: updateSettingsBackupPlaylist,
    deleteSettingsBackupPlaylist: deleteSettingsBackupPlaylist,
    search: search,
    loadPlayback: loadPlayback,
    loadMediaProfile: loadMediaProfile,
    preparePlayback: preparePlayback,
    loadSeasonEpisodes: loadSeasonEpisodes,
    loadSeriesContext: loadSeriesContext,
    sendTimeline: sendTimeline,
    removeFromContinueWatching: removeFromContinueWatching,
    resetProgress: resetProgress,
    setWatchedAndReset: setWatchedAndReset,
    refreshLibrary: refreshLibrary,
    refreshLibraryMetadata: refreshLibraryMetadata,
    refreshMetadata: refreshMetadata,
    setStreamSelection: setStreamSelection,
    setSubtitleOffset: setSubtitleOffset,
    loadHome: loadHome,
    loadRecommendedItems: loadRecommendedItems,
    loadLibraryRecommendations: loadLibraryRecommendations
  };
}));
