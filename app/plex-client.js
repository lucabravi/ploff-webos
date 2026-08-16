(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./media-profile'), require('./media-preferences'), require('./version-selection'), require('./plex-url'), require('./plex-search-parser'), require('./plex-playback-urls'), require('./plex-http'));
  } else {
    root.PloffClient = factory(root.PloffMediaProfile, root.PloffMediaPreferences, root.PloffVersionSelection, root.PloffPlexUrl, root.PloffPlexSearchParser, root.PloffPlexPlaybackUrls, root.PloffPlexHttp);
  }
}(this, function (MediaProfile, MediaPreferences, VersionSelection, PlexUrl, PlexSearchParser, PlexPlaybackUrls, PlexHttp) {
  'use strict';

  /**
   * @typedef {Object} RecentGroupRecord
   * @property {string} key
   * @property {number} count
   * @property {number} viewedCount
   * @property {Object<string, *>} seasonItem
   */

  /**
   * @typedef {Object} MediaCardRecord
   * @property {string} title
   * @property {string} meta
   * @property {string} image
   * @property {string} art
   * @property {string=} titleKey
   * @property {string=} metaKey
   * @property {Object<string, *>=} metaParameters
   * @property {string=} libraryTitle
   * @property {(number|string)=} year
   * @property {string=} genre
   * @property {string=} summary
   * @property {string=} tagline
   * @property {string=} contentRating
   * @property {number=} seasonCount
   * @property {string=} guid
   * @property {string=} ratingKey
   * @property {string=} type
   * @property {string=} themeLookupKey
   * @property {string=} detail
   * @property {string=} detailKey
   * @property {Object<string, *>=} detailParameters
   * @property {number=} seasonIndex
   * @property {number=} episodeIndex
   * @property {number=} rating
   * @property {boolean=} viewed
   * @property {number=} duration
   * @property {number=} viewOffset
   * @property {number=} progress
   * @property {string=} themeKey
   * @property {string=} themeUrl
   * @property {RecentGroupRecord=} recentGroup
   */

  /**
   * @typedef {Object} DetailRecord
   * @property {string} ratingKey
   * @property {string} type
   * @property {string} showRatingKey
   * @property {string} seasonRatingKey
   * @property {number} seasonIndex
   * @property {number} episodeIndex
   * @property {boolean} viewed
   * @property {number} viewOffset
   * @property {number} duration
   * @property {string} title
   * @property {string} subtitle
   * @property {string} facts
   * @property {string} summary
   * @property {string} image
   * @property {string} art
   * @property {string=} guid
   * @property {string=} watchlistGuid
   * @property {string=} themeKey
   * @property {string=} themeUrl
   */

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
  var RECOMMENDATION_CACHE_LIMIT = 4;
  var buildUrl = PlexUrl.buildUrl;
  var assetUrl = PlexUrl.assetUrl;
  var posterUrl = PlexUrl.posterUrl;
  var playbackModeFromDecisions = PlexPlaybackUrls.playbackModeFromDecisions;
  var playbackModeFromXml = PlexPlaybackUrls.playbackModeFromXml;
  var buildStreamSelectionUrl = PlexPlaybackUrls.buildStreamSelectionUrl;
  var buildSubtitleStreamUrl = PlexPlaybackUrls.buildSubtitleStreamUrl;
  var buildSubtitleTranscodeUrl = PlexPlaybackUrls.buildSubtitleTranscodeUrl;
  var buildSubtitleOffsetUrl = PlexPlaybackUrls.buildSubtitleOffsetUrl;

  function pad(value) {
    var text = String(value || '0');
    return text.length < 2 ? '0' + text : text;
  }

  function setDynamicProperty(target, key, value) {
    target[key] = value;
  }


  function themeFromAttributes(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var path = attributes.grandparentTheme || attributes.parentTheme || attributes.theme || '';
    var key = '';
    if (!path) {
      return null;
    }
    if (type === 'episode') {
      key = 'show:' + (attributes.grandparentRatingKey || attributes.grandparentTitle || attributes.ratingKey || path);
    } else if (type === 'season') {
      key = 'show:' + (attributes.parentRatingKey || attributes.parentTitle || attributes.ratingKey || path);
    } else {
      key = type + ':' + (attributes.ratingKey || path);
    }
    return { key: key, url: assetUrl(baseUrl, path, token) };
  }

  /** @returns {MediaCardRecord} */
  function mediaFromAttributes(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var title = attributes.title || 'Untitled';
    var meta = type || 'Media';
    var image = assetUrl(baseUrl, attributes.thumb || attributes.art, token);
    var art = assetUrl(baseUrl, attributes.art || attributes.thumb, token);
    var duration = Number(attributes.duration || 0);
    var offset = Number(attributes.viewOffset || 0);
    /** @type {MediaCardRecord} */
    var item;
    var detail = '';
    var theme = themeFromAttributes(attributes, baseUrl, token);
    var metaKey = '';
    var metaParameters = null;
    var detailKey = '';
    var detailParameters = null;
    var titleKey = attributes.title ? '' : 'media.untitled';

    if (type === 'episode') {
      title = attributes.grandparentTitle || title;
      image = assetUrl(
        baseUrl,
        attributes.grandparentThumb || attributes.parentThumb || attributes.thumb || attributes.art,
        token
      );
      art = assetUrl(baseUrl, attributes.grandparentArt || attributes.art || attributes.thumb, token);
      meta = attributes.parentTitle || 'Season ' + Number(attributes.parentIndex || 0);
      if (Number(attributes.parentIndex || 0) > 0) {
        metaKey = 'media.season';
        metaParameters = { number: Number(attributes.parentIndex || 0) };
      }
      detail = 'E' + pad(attributes.index);
      if (attributes.title) {
        detail += ' - ' + attributes.title;
      }
    } else if (type === 'movie') {
      meta = 'Movie' + (attributes.year ? ' - ' + attributes.year : '');
      metaKey = attributes.year ? 'media.movieWithYear' : 'media.movie';
      metaParameters = attributes.year ? { year: attributes.year } : null;
    } else if (type === 'show') {
      meta = 'TV Shows';
      metaKey = 'media.show';
    } else if (type === 'season') {
      title = attributes.parentTitle || title;
      meta = 'Season ' + Number(attributes.index || 0);
      metaKey = 'media.season';
      metaParameters = { number: Number(attributes.index || 0) };
      if (attributes.leafCount) {
        detail = attributes.leafCount + (attributes.leafCount === '1' ? ' episode' : ' episodes');
        detailKey = 'media.episodeCount';
        detailParameters = { count: Number(attributes.leafCount) };
      }
    }

    item = { title: title, meta: meta, image: image, art: art };
    if (titleKey && !attributes.parentTitle && !attributes.grandparentTitle) { item.titleKey = titleKey; }
    if (metaKey) { item.metaKey = metaKey; }
    if (metaParameters) { item.metaParameters = metaParameters; }
    if (attributes.librarySectionTitle) { item.libraryTitle = attributes.librarySectionTitle; }
    if (attributes.year) { item.year = Number(attributes.year) || attributes.year; }
    if (attributes.genre) { item.genre = attributes.genre; }
    if (attributes.summary) { item.summary = attributes.summary; }
    if (attributes.tagline) { item.tagline = attributes.tagline; }
    if (attributes.contentRating) { item.contentRating = attributes.contentRating; }
    if (type === 'show') { item.seasonCount = Math.max(0, Number(attributes.childCount || 0)); }
    if (attributes.guid) { item.guid = attributes.guid; }
    if (attributes.ratingKey) {
      item.ratingKey = attributes.ratingKey;
      item.type = type;
      if (type === 'episode' && attributes.grandparentRatingKey) {
        item.themeLookupKey = 'show:' + attributes.grandparentRatingKey;
      } else if (type === 'season' && attributes.parentRatingKey) {
        item.themeLookupKey = 'show:' + attributes.parentRatingKey;
      } else {
        item.themeLookupKey = type + ':' + attributes.ratingKey;
      }
    }
    if (detail) {
      item.detail = detail;
    }
    if (type === 'episode') {
      item.seasonIndex = Number(attributes.parentIndex || 0);
      item.episodeIndex = Number(attributes.index || 0);
    }
    if (detailKey) { item.detailKey = detailKey; }
    if (detailParameters) { item.detailParameters = detailParameters; }
    if (attributes.audienceRating || attributes.rating) {
      item.rating = Number(attributes.audienceRating || attributes.rating);
    }
    if (Number(attributes.viewCount || 0) > 0 ||
        (Number(attributes.leafCount || 0) > 0 && Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount || 0))) {
      item.viewed = true;
    }
    if (duration > 0) { setDynamicProperty(item, 'duration', duration); }
    if (offset > 0) { setDynamicProperty(item, 'viewOffset', offset); }
    if (duration > 0 && offset > 0) {
      item.progress = Math.max(0, Math.min(100, Math.round(offset / duration * 100)));
    }
    if (theme) {
      item.themeKey = theme.key;
      item.themeUrl = theme.url;
    }
    return item;
  }

  function containerFromAttributes(attributes, baseUrl, token, view) {
    var count = Number(attributes.childCount || attributes.leafCount || 0);
    return {
      title: attributes.title || 'Untitled',
      meta: count + (count === 1 ? ' title' : ' titles'),
      metaKey: 'media.titleCount',
      metaParameters: { count: count },
      image: assetUrl(baseUrl, attributes.thumb || attributes.composite || attributes.art, token),
      art: assetUrl(baseUrl, attributes.art || attributes.thumb || attributes.composite, token),
      ratingKey: attributes.ratingKey || '',
      type: attributes.type || (view === 'playlists' ? 'playlist' : 'collection'),
      containerType: view === 'playlists' ? 'playlist' : 'collection',
      containerKey: attributes.key || (attributes.ratingKey ? '/playlists/' + attributes.ratingKey + '/items' : ''),
      childCount: count
    };
  }

  function attributesFromNode(node) {
    var result = {};
    var index;
    var attribute;
    for (index = 0; index < node.attributes.length; index += 1) {
      attribute = node.attributes[index];
      result[attribute.name] = attribute.value;
    }
    for (index = 0; index < node.childNodes.length; index += 1) {
      if (node.childNodes[index].nodeType === 1 && node.childNodes[index].nodeName === 'Genre') {
        result.genre = node.childNodes[index].getAttribute('tag') || '';
        break;
      }
    }
    return result;
  }

  function parseXmlDocument(xmlText, errorMessage) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    if (documentNode.getElementsByTagName('parsererror').length) {
      throw new Error(errorMessage || 'Invalid Plex XML response');
    }
    return documentNode;
  }

  function attributesFromDocument(documentNode) {
    var candidates = documentNode.documentElement.childNodes;
    var items = [];
    var index;
    var node;
    for (index = 0; index < candidates.length; index += 1) {
      node = candidates[index];
      if (node.nodeType === 1 && (node.nodeName === 'Video' || node.nodeName === 'Directory' || node.nodeName === 'Playlist')) {
        items.push(attributesFromNode(node));
      }
    }
    return items;
  }

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

  function parseAttributes(xmlText) {
    return attributesFromDocument(parseXmlDocument(xmlText));
  }

  function parseItems(xmlText, baseUrl, token) {
    return parseAttributes(xmlText).map(function (attributes) {
      return mediaFromAttributes(attributes, baseUrl, token);
    });
  }

  var searchParser = PlexSearchParser.create({ mediaFromAttributes: mediaFromAttributes });
  var searchItemsFromAttributes = searchParser.searchItemsFromAttributes;

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

  function groupRecentAttributes(items) {
    var counts = {};
    var viewedCounts = {};
    var emitted = {};
    var grouped = [];

    items.forEach(function (item) {
      var key;
      if (item.type === 'episode') {
        key = item.parentRatingKey || item.grandparentTitle + '|' + item.parentIndex;
        counts[key] = (counts[key] || 0) + 1;
        if (Number(item.viewCount || 0) > 0) { viewedCounts[key] = (viewedCounts[key] || 0) + 1; }
      }
    });

    items.forEach(function (item) {
      var key;
      if (item.type !== 'episode') {
        grouped.push(item);
        return;
      }
      key = item.parentRatingKey || item.grandparentTitle + '|' + item.parentIndex;
      if (counts[key] < 2) {
        grouped.push(item);
      } else if (!emitted[key]) {
        emitted[key] = true;
        grouped.push({
          type: 'season',
          ratingKey: item.parentRatingKey,
          title: item.parentTitle || 'Season ' + item.parentIndex,
          parentTitle: item.grandparentTitle,
          index: item.parentIndex,
          leafCount: String(counts[key]),
          viewedLeafCount: String(viewedCounts[key] || 0),
          thumb: item.parentThumb || item.grandparentThumb || item.thumb,
          art: item.grandparentArt || item.art
        });
      }
    });
    return grouped;
  }

  function recentSeasonAttributes(item, count, viewedCount) {
    var season = item.type === 'season';
    return {
      type: 'season',
      ratingKey: season ? item.ratingKey : item.parentRatingKey,
      title: season ? item.title : item.parentTitle,
      parentTitle: season ? item.parentTitle : item.grandparentTitle,
      parentRatingKey: season ? item.parentRatingKey : item.grandparentRatingKey,
      index: season ? item.index : item.parentIndex,
      leafCount: String(count),
      viewedLeafCount: String(viewedCount),
      thumb: season ? (item.thumb || item.art) : (item.parentThumb || item.grandparentThumb || item.thumb),
      art: season ? (item.art || item.thumb) : (item.grandparentArt || item.art),
      theme: season ? item.theme : (item.grandparentTheme || item.theme),
      librarySectionTitle: item.librarySectionTitle
    };
  }

  function recentCardFromAttributes(attributes, baseUrl, token) {
    var card = mediaFromAttributes(attributes, baseUrl, token);
    var key;
    var count;
    var viewedCount;
    var seasonAttributes;
    if (attributes.type !== 'episode' && attributes.type !== 'season') { return card; }
    key = attributes.type === 'season'
      ? String(attributes.ratingKey || '')
      : String(attributes.parentRatingKey || (attributes.grandparentTitle || '') + '|' + (attributes.parentIndex || ''));
    if (!key) { return card; }
    count = attributes.type === 'season' ? Math.max(1, Number(attributes.leafCount || 1)) : 1;
    viewedCount = attributes.type === 'season'
      ? Math.max(0, Number(attributes.viewedLeafCount || 0))
      : (Number(attributes.viewCount || 0) > 0 ? 1 : 0);
    seasonAttributes = recentSeasonAttributes(attributes, count, viewedCount);
    card.recentGroup = {
      key: key,
      count: count,
      viewedCount: viewedCount,
      seasonItem: mediaFromAttributes(seasonAttributes, baseUrl, token)
    };
    return card;
  }


  /** @returns {DetailRecord} */
  function detailFromAttributes(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var title = attributes.title || 'Untitled';
    var subtitle = '';
    var facts = [];
    var minutes;
    var theme = themeFromAttributes(attributes, baseUrl, token);
    /** @type {DetailRecord} */
    var result;

    if (type === 'episode') {
      title = attributes.grandparentTitle || title;
      subtitle = (attributes.parentTitle || 'Season ' + Number(attributes.parentIndex || 0)) +
        ' - E' + pad(attributes.index) + ' - ' + attributes.title;
    } else if (type === 'season') {
      title = attributes.parentTitle || title;
      subtitle = attributes.title || 'Season ' + Number(attributes.index || 0);
    } else if (attributes.tagline) {
      subtitle = attributes.tagline;
    }

    if (attributes.year) {
      facts.push(attributes.year);
    }
    if (attributes.duration) {
      minutes = Math.round(Number(attributes.duration) / 60000);
      if (minutes > 0) {
        facts.push(minutes + ' min');
      }
    }
    if (attributes.contentRating) {
      facts.push(attributes.contentRating);
    }

    result = {
      ratingKey: attributes.ratingKey || '',
      type: type,
      showRatingKey: attributes.grandparentRatingKey || (type === 'season' ? attributes.parentRatingKey || '' : (type === 'show' ? attributes.ratingKey || '' : '')),
      seasonRatingKey: type === 'episode' ? attributes.parentRatingKey || '' : (type === 'season' ? attributes.ratingKey || '' : ''),
      seasonIndex: Number(attributes.parentIndex || (type === 'season' ? attributes.index : 0) || 0),
      episodeIndex: Number(type === 'episode' ? attributes.index || 0 : 0),
      viewed: Number(attributes.viewCount || 0) > 0,
      viewOffset: Math.max(0, Number(attributes.viewOffset || 0)),
      duration: Math.max(0, Number(attributes.duration || 0)),
      title: title,
      subtitle: subtitle,
      facts: facts.join('  |  '),
      summary: attributes.summary || '',
      image: assetUrl(baseUrl, attributes.grandparentThumb || attributes.parentThumb || attributes.thumb || attributes.art, token),
      art: assetUrl(baseUrl, attributes.grandparentArt || attributes.art || attributes.thumb, token)
    };
    if (attributes.guid) { result.guid = attributes.guid; }
    if ((type === 'episode' || type === 'season') && (attributes.grandparentGuid || attributes.parentGuid)) {
      result.watchlistGuid = attributes.grandparentGuid || attributes.parentGuid;
    } else if (attributes.guid) { result.watchlistGuid = attributes.guid; }
    if (theme) {
      result.themeKey = theme.key;
      result.themeUrl = theme.url;
    }
    return result;
  }

  function seasonFromAttributes(attributes, baseUrl, token, selectedKey) {
    var season = {
      ratingKey: attributes.ratingKey || '',
      index: Number(attributes.index || 0),
      title: attributes.title || 'Season ' + Number(attributes.index || 0),
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      leafCount: Number(attributes.leafCount || 0),
      viewedLeafCount: Number(attributes.viewedLeafCount || 0),
      selected: attributes.ratingKey === selectedKey
    };
    if (attributes.year) { season.year = Number(attributes.year) || attributes.year; }
    return season;
  }

  function preferredSeasonKeyFromAttributes(attributesList, requestedKey) {
    var requestedFound = false;
    var firstRegular = '';
    var firstUnwatchedRegular = '';
    var firstAny = '';
    attributesList.forEach(function (attributes) {
      var key = attributes.ratingKey || '';
      var index = Number(attributes.index || 0);
      var leafCount = Number(attributes.leafCount || 0);
      var viewedLeafCount = Number(attributes.viewedLeafCount || 0);
      if (!key) { return; }
      if (!firstAny) { firstAny = key; }
      if (key === requestedKey) { requestedFound = true; }
      if (index > 0 && !firstRegular) { firstRegular = key; }
      if (index > 0 && leafCount > viewedLeafCount && !firstUnwatchedRegular) {
        firstUnwatchedRegular = key;
      }
    });
    if (requestedFound) { return requestedKey; }
    return firstUnwatchedRegular || firstRegular || firstAny;
  }

  function episodeFromAttributes(attributes, baseUrl, token, selectedKey, seasonYear) {
    var duration = Math.max(0, Number(attributes.duration || 0));
    var viewOffset = Math.max(0, Number(attributes.viewOffset || 0));
    var episode = {
      ratingKey: attributes.ratingKey || '',
      type: 'episode',
      seasonIndex: Number(attributes.parentIndex || 0),
      episodeIndex: Number(attributes.index || 0),
      index: Number(attributes.index || 0),
      title: attributes.title || 'Episodio ' + Number(attributes.index || 0),
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      viewed: Number(attributes.viewCount || 0) > 0,
      viewOffset: viewOffset,
      duration: duration,
      progress: duration > 0 && viewOffset > 0 ? Math.max(0, Math.min(100, Math.round(viewOffset / duration * 100))) : 0,
      selected: attributes.ratingKey === selectedKey
    };
    if (attributes.year || seasonYear) { episode.year = Number(attributes.year || seasonYear) || attributes.year || seasonYear; }
    return episode;
  }

  function trackFromAttributes(stream) {
    return MediaProfile.trackFromAttributes(stream);
  }

  function firstTrackByLanguage(tracks, priorities, forcedOnly, sourcePreference) {
    var priorityIndex;
    var trackIndex;
    var candidates;
    var preferExternal = sourcePreference !== 'internal';
    for (priorityIndex = 0; priorityIndex < priorities.length; priorityIndex += 1) {
      candidates = [];
      for (trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        if ((!forcedOnly || tracks[trackIndex].forced) && tracks[trackIndex].languageTag === priorities[priorityIndex]) {
          candidates.push(tracks[trackIndex]);
        }
      }
      if (candidates.length && sourcePreference) {
        for (trackIndex = 0; trackIndex < candidates.length; trackIndex += 1) {
          if (!!candidates[trackIndex].external === preferExternal) { return candidates[trackIndex]; }
        }
      }
      if (candidates.length) { return candidates[0]; }
    }
    if (forcedOnly) {
      for (trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        if (tracks[trackIndex].forced) { return tracks[trackIndex]; }
      }
    }
    return null;
  }

  function selectedTrack(tracks) {
    var index;
    for (index = 0; index < tracks.length; index += 1) {
      if (tracks[index].selected) { return tracks[index]; }
    }
    return null;
  }

  /** @returns {PlaybackOptionsRecord} */
  function resolvePlaybackOptions(playback, preferences) {
    var current = playback.options || {};
    var settings = preferences || {};
    var audioTracks = playback.audioTracks || [];
    var subtitleTracks = playback.subtitleTracks || [];
    var audio = settings.audioTrackPreference && MediaPreferences ? MediaPreferences.findTrack(audioTracks, settings.audioTrackPreference, false) : null;
    var subtitle = settings.subtitleTrackPreference && MediaPreferences ? MediaPreferences.findTrack(subtitleTracks, settings.subtitleTrackPreference, false) : null;
    var mode = settings.subtitleMode || 'audio-mismatch';
    var suppress = settings.subtitleSuppressedForAudio || [];
    var preferredSubtitleLanguage = settings.subtitleLanguages && settings.subtitleLanguages.length ? settings.subtitleLanguages[0] : '';
    /** @type {PlaybackOptionsRecord} */
    var result;

    audio = audio || firstTrackByLanguage(audioTracks, settings.audioLanguages || [], false) || selectedTrack(audioTracks) || audioTracks[0] || null;
    if (audio && suppress.indexOf(audio.languageTag) !== -1) {
      mode = 'off';
    }
    if (mode === 'off') {
      subtitle = null;
    } else if (!subtitle && mode === 'always') {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], false, settings.subtitleSourcePreference || 'external') || selectedTrack(subtitleTracks);
    } else if (!subtitle && mode === 'forced') {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], true, settings.subtitleSourcePreference || 'external');
    } else if (!subtitle && mode === 'audio-mismatch' && (!audio || !preferredSubtitleLanguage || audio.languageTag !== preferredSubtitleLanguage)) {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], false, settings.subtitleSourcePreference || 'external') || selectedTrack(subtitleTracks);
    } else if (mode === 'audio-mismatch' && audio && preferredSubtitleLanguage && audio.languageTag === preferredSubtitleLanguage) {
      subtitle = null;
    }
    result = {
      audioStreamID: audio ? audio.id : '',
      subtitleStreamID: subtitle ? subtitle.id : '',
      subtitleSize: current.subtitleSize || 100,
      offset: current.offset || 0,
      videoQuality: settings.videoQuality || current.videoQuality || 'original',
      playbackMode: settings.playbackMode || current.playbackMode || 'auto'
    };
    if (settings.mediaIndex !== undefined || current.mediaIndex !== undefined) {
      result.mediaIndex = settings.mediaIndex === undefined ? current.mediaIndex : Number(settings.mediaIndex);
      result.partIndex = settings.partIndex === undefined ? Number(current.partIndex || 0) : Number(settings.partIndex);
    }
    return result;
  }

  function hlsUrlFor(playback, baseUrl, token, options) {
    var transcodeSession = playback.transcodeSession || playback.session;
    var profile = options && options.safeTranscode
      ? 'add-transcode-target(type=videoProfile&context=all&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)'
      : 'add-transcode-target(type=videoProfile&context=all&protocol=hls&container=mpegts&videoCodec=h264,hevc,mpeg2video,mpeg4&audioCodec=aac,ac3,eac3,mp2,mp3)';
    profile += '+add-transcode-target-settings(type=videoProfile&context=all&protocol=hls&ForceZeroByteEmptySegment=true)';
    var parameters = {
      hasMDE: 1,
      path: playback.key,
      mediaIndex: options.mediaIndex === undefined ? Number(playback.mediaIndex || 0) : Number(options.mediaIndex),
      partIndex: options.partIndex === undefined ? Number(playback.partIndex || 0) : Number(options.partIndex),
      protocol: 'hls',
      transcodeType: 'video',
      fastSeek: 1,
      directPlay: 0,
      directStream: options.playbackMode === 'transcode' ? 0 : 1,
      directStreamAudio: options.playbackMode === 'transcode' ? 0 : 1,
      autoAdjustQuality: 0,
      location: 'lan',
      mediaBufferSize: 1024000,
      subtitleSize: options.subtitleSize || 100,
      audioBoost: 100,
      videoQuality: 100,
      videoResolution: options.videoResolution || '3840x2160',
      offset: options.offset || 0,
      copyts: 0,
      session: transcodeSession,
      transcodeSessionId: transcodeSession,
      'X-Plex-Product': 'Ploff',
      'X-Plex-Version': '0.1',
      'X-Plex-Client-Identifier': 'ploff-webos',
      'X-Plex-Session-Identifier': transcodeSession,
      'X-Plex-Platform': 'webOS',
      'X-Plex-Platform-Version': '1.0',
      'X-Plex-Device': 'webOS TV',
      'X-Plex-Client-Profile-Name': 'Generic',
      'X-Plex-Client-Profile-Extra': profile
    };
    if (options.videoQuality && options.videoQuality !== 'original') {
      parameters.maxVideoBitrate = options.videoQuality;
    }
    if (options.audioStreamID) {
      parameters.audioStreamID = options.audioStreamID;
    }
    if (options.subtitleStreamID && !options.localSubtitleOverlay) {
      parameters.subtitleStreamID = options.subtitleStreamID;
      parameters.subtitles = 'burn';
      parameters.advancedSubtitles = 'burn';
    } else {
      parameters.subtitles = 'none';
      parameters.advancedSubtitles = 'text';
    }
    return buildUrl(baseUrl, '/video/:/transcode/universal/start.m3u8', parameters, token);
  }

  function selectedPlaybackVersion(playback, options) {
    var versions = playback.mediaVersions || [];
    var mediaIndex = options && options.mediaIndex === undefined ? Number(playback.mediaIndex || 0) : Number(options && options.mediaIndex || 0);
    var partIndex = options && options.partIndex === undefined ? Number(playback.partIndex || 0) : Number(options && options.partIndex || 0);
    var index;
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === mediaIndex && versions[index].partIndex === partIndex) { return versions[index]; }
    }
    return versions[0] || playback;
  }

  function directUrlFor(playback, baseUrl, token, options) {
    var version = selectedPlaybackVersion(playback, options);
    if (!version.partKey) { return ''; }
    return buildUrl(baseUrl, version.partKey, {}, token);
  }

  function markersFromAttributes(values) {
    var markers = [];
    (values || []).forEach(function (value) {
      var type = String(value.type || '').toLowerCase();
      var start = Number(value.startTimeOffset);
      var end = Number(value.endTimeOffset);
      if ((type !== 'intro' && type !== 'credits') || !isFinite(start) || !isFinite(end) || start < 0 || end <= start) { return; }
      markers.push({
        key: type + ':' + start + ':' + end,
        type: type,
        startTimeOffset: start,
        endTimeOffset: end,
        final: value.final === true || value.final === 1 || value.final === '1'
      });
    });
    markers.sort(function (left, right) { return left.startTimeOffset - right.startTimeOffset; });
    return markers;
  }

  function chaptersFromAttributes(values, baseUrl, token) {
    var chapters = [];
    (values || []).forEach(function (value) {
      var start = Number(value.startTimeOffset);
      var end = Number(value.endTimeOffset);
      if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) { return; }
      chapters.push({
        key: String(value.id || value.index || start),
        index: Number(value.index || chapters.length + 1),
        title: String(value.title || value.tag || ''),
        startTimeOffset: start,
        endTimeOffset: end,
        thumb: assetUrl(baseUrl, value.thumb || '', token)
      });
    });
    chapters.sort(function (left, right) { return left.startTimeOffset - right.startTimeOffset; });
    return chapters;
  }

  function playbackVersionsFromAttributes(groups) {
    var versions = [];
    (groups || []).forEach(function (group, mediaIndex) {
      var media = group.media || {};
      (group.parts || []).forEach(function (entry, partIndex) {
        var part = entry.part || {};
        var profile = MediaProfile ? MediaProfile.fromNodes({}, media, part, entry.streams || []) : null;
        versions.push({
          mediaIndex: mediaIndex,
          partIndex: partIndex,
          mediaId: media.id || '',
          partId: part.id || '',
          partKey: part.key || '',
          fileName: String(part.file || part.key || '').split(/[\\/]/).pop(),
          fileSize: Number(part.size || 0),
          duration: Number(part.duration || 0),
          container: String(media.container || part.container || '').toLowerCase(),
          videoCodec: String(media.videoCodec || '').toLowerCase(),
          videoDynamicRange: media.videoDynamicRange || media.dynamicRange || '',
          videoResolution: media.videoResolution || '',
          width: Number(media.width || 0),
          height: Number(media.height || 0),
          bitrate: Number(media.bitrate || 0),
          summary: profile && profile.summary || '',
          profile: profile,
          audioTracks: profile && profile.audioTracks || [],
          subtitleTracks: profile && profile.subtitleTracks || [],
          streams: (entry.streams || []).map(trackFromAttributes)
        });
      });
    });
    return versions;
  }

  /** @returns {PlaybackSessionRecord} */
  function playbackFromAttributes(video, media, part, baseUrl, token, session, streams, markers, chapters) {
    var ratingKey = video.ratingKey || '';
    var audioTracks = [];
    var subtitleTracks = [];
    var resumePosition = Math.floor(Number(video.viewOffset || 0) / 1000);
    var streamOffset = resumePosition;
    /** @type {PlaybackOptionsRecord} */
    var options = { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, offset: streamOffset, videoQuality: 'original', playbackMode: 'auto' };
    /** @type {PlaybackSessionRecord} */
    var playback;
    var mediaProfile = MediaProfile ? MediaProfile.fromNodes(video, media, part, streams || []) : null;

    (streams || []).forEach(function (stream) {
      var track = trackFromAttributes(stream);
      if (stream.streamType === '2') {
        audioTracks.push(track);
        if (track.selected) { options.audioStreamID = track.id; }
      } else if (stream.streamType === '3') {
        subtitleTracks.push(track);
        if (track.selected) { options.subtitleStreamID = track.id; }
      }
    });

    playback = {
      ratingKey: ratingKey,
      key: '/library/metadata/' + ratingKey,
      title: video.title || '',
      duration: Number(part.duration || video.duration || 0),
      session: session,
      partId: part.id || '',
      directPlay: false,
      fileName: String(part.file || part.key || '').split(/[\\/]/).pop(),
      fileSize: Number(part.size || 0),
      playbackMode: 'unknown',
      markers: markersFromAttributes(markers),
      chapters: chapters || [],
      audioTracks: audioTracks,
      subtitleTracks: subtitleTracks,
      options: options,
      resumePosition: resumePosition,
      offsetBase: streamOffset,
      originalContainer: media.container || part.container || '',
      originalVideoCodec: media.videoCodec || '',
      mediaProfile: mediaProfile
    };
    playback.sourceUrl = hlsUrlFor(playback, baseUrl, token, options);
    playback.hlsUrl = playback.sourceUrl;
    return playback;
  }

  function sectionDefinitions(sections) {
    return sections.filter(function (section) {
      return section.key && section.title && (section.type === 'movie' || section.type === 'show');
    }).map(function (section) {
      return {
        title: 'Recentemente aggiunto in ' + section.title,
        path: '/library/sections/' + section.key + '/recentlyAdded',
        kind: 'recent',
        groupRecent: true
      };
    });
  }

  function homeDefinitions(sections, config) {
    return [{
      title: 'Continua a guardare',
      path: config && config.continuePath || '/hubs/continueWatching/items',
      kind: 'continue',
      showLibraryBadge: true
    }].concat(sectionDefinitions(sections));
  }

  function recommendationHubPriority(identifier) {
    var value = String(identifier || '').toLowerCase();
    if (value.indexOf('startwatching') !== -1) { return 1; }
    if (value.indexOf('.genre.') !== -1 || value.indexOf('moreingenre') !== -1) { return 2; }
    if (value.indexOf('by.actor.or.director') !== -1) { return 3; }
    if (value.indexOf('topunwatched') !== -1) { return 4; }
    if (value.indexOf('toprated') !== -1) { return 5; }
    return 0;
  }

  function recommendationItemsFromXml(xmlText, baseUrl, token) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var hubs;
    var candidates = [];
    var seen = {};
    var result = [];
    var hubIndex;
    var childIndex;
    var hub;
    var priority;
    var attributes;
    var child;
    if (documentNode.getElementsByTagName('parsererror').length) { throw new Error('Invalid Plex recommendation response'); }
    hubs = documentNode.getElementsByTagName('Hub');
    for (hubIndex = 0; hubIndex < hubs.length; hubIndex += 1) {
      hub = hubs[hubIndex];
      priority = recommendationHubPriority(hub.getAttribute('hubIdentifier'));
      if (!priority) { continue; }
      for (childIndex = 0; childIndex < hub.childNodes.length; childIndex += 1) {
        child = hub.childNodes[childIndex];
        if (!child || child.nodeType !== 1 || (child.nodeName !== 'Video' && child.nodeName !== 'Directory')) { continue; }
        attributes = attributesFromNode(child);
        if ((attributes.type !== 'movie' && attributes.type !== 'show') || !attributes.ratingKey || Number(attributes.viewCount || 0) > 0) { continue; }
        if (attributes.type === 'show' && Number(attributes.leafCount || 0) > 0 && Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount)) { continue; }
        candidates.push({ priority: priority, order: candidates.length, attributes: attributes });
      }
    }
    candidates.sort(function (left, right) {
      return left.priority === right.priority ? left.order - right.order : left.priority - right.priority;
    });
    candidates.forEach(function (candidate) {
      var key = String(candidate.attributes.ratingKey);
      if (seen[key]) { return; }
      seen[key] = true;
      result.push(mediaFromAttributes(candidate.attributes, baseUrl, token));
    });
    return result;
  }

  function recommendationRowsFromXml(xmlText, baseUrl, token) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var hubs;
    var rows = [];
    var hubIndex;
    var childIndex;
    var hub;
    var priority;
    var attributes;
    var child;
    var items;
    var seen;
    if (documentNode.getElementsByTagName('parsererror').length) { throw new Error('Invalid Plex recommendation response'); }
    hubs = documentNode.getElementsByTagName('Hub');
    for (hubIndex = 0; hubIndex < hubs.length; hubIndex += 1) {
      hub = hubs[hubIndex];
      priority = recommendationHubPriority(hub.getAttribute('hubIdentifier'));
      if (!priority) { continue; }
      items = [];
      seen = {};
      for (childIndex = 0; childIndex < hub.childNodes.length; childIndex += 1) {
        child = hub.childNodes[childIndex];
        if (!child || child.nodeType !== 1 || (child.nodeName !== 'Video' && child.nodeName !== 'Directory')) { continue; }
        attributes = attributesFromNode(child);
        if ((attributes.type !== 'movie' && attributes.type !== 'show') || !attributes.ratingKey || Number(attributes.viewCount || 0) > 0 || seen[attributes.ratingKey]) { continue; }
        if (attributes.type === 'show' && Number(attributes.leafCount || 0) > 0 && Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount)) { continue; }
        seen[attributes.ratingKey] = true;
        items.push(mediaFromAttributes(attributes, baseUrl, token));
      }
      if (items.length) {
        rows.push({
          title: hub.getAttribute('title') || '',
          identifier: hub.getAttribute('hubIdentifier') || '',
          priority: priority,
          items: items
        });
      }
    }
    rows.sort(function (left, right) { return left.priority - right.priority; });
    return rows;
  }

  function mergeRecommendedItems(itemLists, limit) {
    var lists = (itemLists || []).map(function (items) { return items || []; });
    var positions = lists.map(function () { return 0; });
    var seen = {};
    var result = [];
    var progressed = true;
    var index;
    var item;
    while (progressed && result.length < limit) {
      progressed = false;
      for (index = 0; index < lists.length && result.length < limit; index += 1) {
        while (positions[index] < lists[index].length) {
          item = lists[index][positions[index]];
          positions[index] += 1;
          progressed = true;
          if (!item || !item.ratingKey || seen[item.ratingKey]) { continue; }
          seen[item.ratingKey] = true;
          result.push(item);
          break;
        }
      }
    }
    return result;
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

  function storeRecommendations(key, items, currentTime) {
    recommendationCache[key] = { savedAt: currentTime, items: items.slice(0) };
    touchRecommendationCache(key);
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
    if (cached) {
      callback(null, cached);
      return { abort: function () { aborted = true; } };
    }
    if (!pending) {
      callback(null, []);
      return { abort: function () { aborted = true; } };
    }
    libraries.forEach(function (section, libraryIndex) {
      requests.push(request(buildUrl(config.apiBaseUrl, '/hubs/sections/' + section.key, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': config.itemLimit || 12
      }, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
        if (aborted) { return; }
        if (!error) {
          try {
            itemLists[libraryIndex] = recommendationItemsFromXml(xmlText, config.apiBaseUrl, config.token || '');
            itemLists[libraryIndex].forEach(function (item) {
              if (!item.libraryTitle) { item.libraryTitle = section.title || ''; }
            });
          } catch (parseError) {}
        }
        pending -= 1;
        if (!pending) {
          items = mergeRecommendedItems(itemLists, config.itemLimit || 12);
          storeRecommendations(cacheKey, items, new Date().getTime());
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
      if (error) { callback(error); return; }
      try { callback(null, recommendationRowsFromXml(xmlText, config.apiBaseUrl, config.token || '')); }
      catch (parseError) { callback(parseError); }
    });
  }

  function navigationDefinitions(sections) {
    /** @type {Array<Object>} */
    var items = [{ title: 'Home', kind: 'home', labelKey: 'nav.home' }];
    sections.forEach(function (section) {
      if (section.key && section.title && (section.type === 'movie' || section.type === 'show')) {
        items.push({ title: section.title, kind: 'library', key: section.key, type: section.type });
      }
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
      if (error) { callback(error); return; }
      try { callback(null, accountProfileFromJson(jsonText)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function loadNavigation(config, callback) {
    var url = buildUrl(config.apiBaseUrl, config.sectionsPath || '/library/sections', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      if (error) { callback(error); return; }
      try { callback(null, navigationDefinitions(parseAttributes(xmlText))); }
      catch (parseError) { callback(parseError); }
    });
  }

  function loadLibrary(config, navigation, callback) {
    return loadRows(config, [{
      title: navigation.title,
      path: '/library/sections/' + navigation.key + '/all'
    }], callback);
  }

  function findByGuid(config, guid, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/all', { guid: guid, includeGuids: 1 }, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var attributes;
      if (error) { callback(error); return; }
      try {
        attributes = parseAttributes(xmlText);
        callback(null, attributes.length ? mediaFromAttributes(attributes[0], config.apiBaseUrl, config.token || '') : null);
      } catch (parseError) {
        callback(parseError);
      }
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
      if (error) { callback(error); return; }
      try { callback(null, activityItemsFromJson(jsonText)); }
      catch (parseError) { callback(parseError); }
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
        callback(null, items);
      } catch (parseError) { callback(parseError); }
    });
    return {
      abort: function () {
        aborted = true;
        if (searchRequest && searchRequest.abort) { searchRequest.abort(); }
      }
    };
  }

  function buildLibraryBrowseUrl(config, library, view, options, start, size) {
    var path;
    var parameters = {
      'X-Plex-Container-Start': Math.max(0, Number(start || 0)),
      'X-Plex-Container-Size': Math.max(1, Number(size || 60))
    };
    options = options || {};
    if (view === 'continue') {
      path = '/hubs/continueWatching/items';
      parameters.contentDirectoryID = library.key;
    } else if (view === 'recent') {
      path = '/library/sections/' + library.key + '/recentlyAdded';
    } else if (view === 'collections') {
      path = '/library/sections/' + library.key + '/collections';
    } else if (view === 'playlists') {
      path = '/playlists';
      parameters.playlistType = 'video';
    } else {
      path = '/library/sections/' + library.key + '/all';
      parameters.sort = (options.sort === 'audienceRating' ? 'audienceRating' : (options.sort === 'year' ? 'year' : 'titleSort')) + ':' + (options.direction === 'desc' ? 'desc' : 'asc');
      if (options.watched === 'unwatched') { parameters.unwatched = 1; }
      else if (options.watched === 'watched') { parameters.unwatched = 0; }
      if (options.filters) {
        ['year', 'genre', 'actor', 'director', 'resolution', 'hdr'].forEach(function (key) {
          if (options.filters[key] !== undefined && options.filters[key] !== null && options.filters[key] !== '') {
            parameters[key] = options.filters[key];
          }
        });
      }
    }
    return buildUrl(config.apiBaseUrl, path, parameters, config.token || '');
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
    keys.forEach(function (key) {
      requests.push(request(buildUrl(config.apiBaseUrl, '/library/sections/' + library.key + '/' + key, {}, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
        if (aborted) { return; }
        try { result[key] = error ? [] : libraryFilterOptionsFromXml(xmlText); }
        catch (parseError) { result[key] = []; }
        pending -= 1;
        if (!pending) { callback(null, result); }
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
      var items;
      if (error) { callback(error); return; }
      try {
        documentNode = parseXmlDocument(xmlText, settings.errorMessage);
        rootAttributes = attributesFromNode(documentNode.documentElement);
        attributes = attributesFromDocument(documentNode);
        pageItemCount = attributes.length;
        if (settings.filter) { attributes = attributes.filter(settings.filter); }
        if (settings.transform) { attributes = settings.transform(attributes); }
        items = settings.map ? attributes.map(settings.map) : attributes;
        callback(null, {
          items: items,
          totalSize: pageTotal(rootAttributes, start, pageItemCount),
          nextStart: pageNextStart(start, pageItemCount),
          hasMore: pageHasMore(rootAttributes, start, pageItemCount, size),
          libraryKey: String(settings.libraryKey || '')
        });
      } catch (parseError) {
        callback(parseError);
      }
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
      transform: view === 'recent' ? groupRecentAttributes : null,
      map: mapItem,
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
        callback(null, items);
      } catch (parseError) { callback(parseError); }
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
              kind: definition.kind || '',
              shape: 'poster',
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
          rows = rows.filter(function (row) { return !!row; });
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
        baseRows.splice(1, 0, { title: 'Recommended for You', kind: 'recommended', recommendation: true, showLibraryBadge: true, shape: 'poster', items: recommendedItems });
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
        attributes = parseAttributes(xmlText)[0];
        if (!attributes) {
          throw new Error('Plex metadata response is empty');
        }
        callback(null, detailFromAttributes(attributes, config.apiBaseUrl, config.token || ''));
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  function loadSeasonEpisodes(config, seasonKey, selectedKey, callback, seasonYear) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + seasonKey + '/children', {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var episodes;
      var selectedFound = false;
      if (error) {
        callback(error);
        return;
      }
      try {
        episodes = parseAttributes(xmlText).map(function (attributes) {
          return episodeFromAttributes(attributes, config.apiBaseUrl, config.token || '', selectedKey || '', seasonYear);
        });
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
        callback(null, episodes);
      } catch (parseError) {
        callback(parseError);
      }
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

  function mediaDocumentFromXml(xmlText, errorMessage) {
    var documentNode = parseXmlDocument(xmlText, errorMessage);
    var videoNode = documentNode.getElementsByTagName('Video')[0] || null;
    var mediaNodes = videoNode ? videoNode.getElementsByTagName('Media') : [];
    var mediaEntries = [];
    var groups = [];
    var mediaIndex;
    var partIndex;
    var streamIndex;
    for (mediaIndex = 0; mediaIndex < mediaNodes.length; mediaIndex += 1) {
      var mediaEntry = {
        node: mediaNodes[mediaIndex],
        media: attributesFromNode(mediaNodes[mediaIndex]),
        parts: []
      };
      var group = { media: mediaEntry.media, parts: [] };
      var partNodes = mediaNodes[mediaIndex].getElementsByTagName('Part');
      for (partIndex = 0; partIndex < partNodes.length; partIndex += 1) {
        var streams = [];
        var streamNodes = partNodes[partIndex].getElementsByTagName('Stream');
        for (streamIndex = 0; streamIndex < streamNodes.length; streamIndex += 1) {
          streams.push(attributesFromNode(streamNodes[streamIndex]));
        }
        var partEntry = {
          node: partNodes[partIndex],
          part: attributesFromNode(partNodes[partIndex]),
          streams: streams
        };
        mediaEntry.parts.push(partEntry);
        group.parts.push({ part: partEntry.part, streams: streams });
      }
      mediaEntries.push(mediaEntry);
      groups.push(group);
    }
    return {
      documentNode: documentNode,
      videoNode: videoNode,
      video: videoNode ? attributesFromNode(videoNode) : {},
      mediaEntries: mediaEntries,
      groups: groups
    };
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
          config.apiBaseUrl,
          config.token || '',
          session,
          partEntry.streams,
          markers,
          chaptersFromAttributes(chapters, config.apiBaseUrl, config.token || '')
        );
        playback.mediaVersions = versions;
        playback.mediaIndex = parsed.mediaEntries[selectedMediaIndex] === mediaEntry ? selectedMediaIndex : 0;
        playback.partIndex = mediaEntry.parts[selectedPartIndex] === partEntry ? selectedPartIndex : 0;
        playback.partKey = partEntry.part.key || '';
        playback.options.mediaIndex = playback.mediaIndex;
        playback.options.partIndex = playback.partIndex;
        if (preferences) {
          playback.options = resolvePlaybackOptions(playback, preferences);
        }
        function ready() {
          if (!aborted) { callback(null, playback); }
        }
        if (preferences && playback.partId) {
          currentRequest = setStreamSelection(config, playback, playback.options, function () {
            if (aborted) { return; }
            currentRequest = null;
            ready();
          });
        } else {
          ready();
        }
      } catch (parseError) {
        if (!aborted) { callback(parseError); }
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
        profiles = MediaProfile.fromVersions(parsed.video, parsed.groups);
        if (!profiles.length) { throw new Error('Plex media profile has no playable versions'); }
        profiles[0].versions = profiles;
        callback(null, profiles[0]);
      } catch (parseError) {
        callback(parseError);
      }
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

  function buildPlaybackUrl(config, playback, options) {
    if (options && options.delivery === 'direct-play') {
      return directUrlFor(playback, config.apiBaseUrl, config.token || '', options);
    }
    return hlsUrlFor(playback, config.apiBaseUrl, config.token || '', options);
  }

  function buildDecisionUrl(config, playback, options) {
    return buildPlaybackUrl(config, playback, options).replace('/start.m3u8?', '/decision?');
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
    var url = track && (track.external || track.key)
      ? buildSubtitleStreamUrl(config, track)
      : buildSubtitleTranscodeUrl(config, playback, track || {});
    return request(url, config.requestTimeout || 8000, function (error, responseText) {
      callback(error || null, error ? '' : responseText);
    });
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
    var match = String(source || '').match(new RegExp('\\b' + name + '="([^"]*)"', 'i'));
    return match ? match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
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
      if (error) { callback(error); return; }
      try { callback(null, serverIdentityFromXml(xmlText)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function buildWatchedUrl(config, ratingKey, watched) {
    return buildUrl(config.apiBaseUrl, watched ? '/:/scrobble' : '/:/unscrobble', {
      key: ratingKey,
      identifier: 'com.plexapp.plugins.library'
    }, config.token || '');
  }

  function setWatched(config, ratingKey, watched, callback) {
    return request(buildWatchedUrl(config, ratingKey, watched), config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function buildRemoveFromContinueWatchingUrl(config, ratingKey) {
    return buildUrl(config.apiBaseUrl, '/actions/removeFromContinueWatching', {
      ratingKey: ratingKey
    }, config.token || '');
  }

  function removeFromContinueWatching(config, ratingKey, callback) {
    return requestWithMethod(buildRemoveFromContinueWatchingUrl(config, ratingKey), 'PUT', config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function buildProgressUrl(config, ratingKey, time) {
    return buildUrl(config.apiBaseUrl, '/:/progress', {
      key: ratingKey,
      time: Math.max(0, Math.round(Number(time) || 0)),
      identifier: 'com.plexapp.plugins.library'
    }, config.token || '');
  }

  function resetProgress(config, ratingKey, callback) {
    return request(buildProgressUrl(config, ratingKey, 0), config.requestTimeout || 8000, function (error) {
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
      if (watchedError) { callback(watchedError); return; }
      currentRequest = resetProgress(config, ratingKey, function (resetError) {
        if (aborted) { return; }
        currentRequest = null;
        callback(resetError || null);
      });
    });
    return { abort: abort };
  }

  function buildLibraryRefreshUrl(config, libraryKey, force) {
    return buildUrl(config.apiBaseUrl, '/library/sections/' + libraryKey + '/refresh', force ? { force: 1 } : {}, config.token || '');
  }

  function refreshLibrary(config, libraryKey, callback) {
    requestWithMethod(buildLibraryRefreshUrl(config, libraryKey, false), 'POST', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }

  function refreshLibraryMetadata(config, libraryKey, callback) {
    requestWithMethod(buildLibraryRefreshUrl(config, libraryKey, true), 'POST', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }

  function buildMetadataRefreshUrl(config, ratingKey) {
    return buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey + '/refresh', {}, config.token || '');
  }

  function refreshMetadata(config, ratingKey, callback) {
    requestWithMethod(buildMetadataRefreshUrl(config, ratingKey), 'PUT', config.requestTimeout || 8000, function (error, responseText, xhr) {
      callback(error || null, activityIdFromResponse(xhr));
    });
  }

  function refreshMetadataSequence(config, ratingKeys, callback) {
    var keys = (ratingKeys || []).filter(function (key, index, values) {
      return !!key && values.indexOf(key) === index;
    });
    function next(index) {
      if (index >= keys.length) { callback(null); return; }
      refreshMetadata(config, keys[index], function (error) {
        if (error) { callback(error); return; }
        next(index + 1);
      });
    }
    next(0);
  }

  return {
    attributesFromNode: attributesFromNode,
    buildUrl: buildUrl,
    buildDecisionUrl: buildDecisionUrl,
    buildPlaybackUrl: buildPlaybackUrl,
    rotateTranscodeSession: rotateTranscodeSession,
    pingTranscode: pingTranscode,
    buildStreamSelectionUrl: buildStreamSelectionUrl,
    buildSubtitleStreamUrl: buildSubtitleStreamUrl,
    buildSubtitleTranscodeUrl: buildSubtitleTranscodeUrl,
    buildSubtitleOffsetUrl: buildSubtitleOffsetUrl,
    buildWatchedUrl: buildWatchedUrl,
    buildRemoveFromContinueWatchingUrl: buildRemoveFromContinueWatchingUrl,
    buildProgressUrl: buildProgressUrl,
    buildLibraryRefreshUrl: buildLibraryRefreshUrl,
    buildMetadataRefreshUrl: buildMetadataRefreshUrl,
    activityIdFromResponse: activityIdFromResponse,
    activityItemsFromJson: activityItemsFromJson,
    posterUrl: posterUrl,
    searchItemsFromAttributes: searchItemsFromAttributes,
    searchItemsFromXml: searchItemsFromXml,
    accountProfileFromJson: accountProfileFromJson,
    detailFromAttributes: detailFromAttributes,
    episodeFromAttributes: episodeFromAttributes,
    preferredSeasonKeyFromAttributes: preferredSeasonKeyFromAttributes,
    groupRecentAttributes: groupRecentAttributes,
    recommendationHubPriority: recommendationHubPriority,
    recommendationItemsFromXml: recommendationItemsFromXml,
    recommendationRowsFromXml: recommendationRowsFromXml,
    mergeRecommendedItems: mergeRecommendedItems,
    homeDefinitions: homeDefinitions,
    loadMetadata: loadMetadata,
    loadActivities: loadActivities,
    loadSubtitleText: loadSubtitleText,
    loadServerIdentity: loadServerIdentity,
    loadAccountProfile: loadAccountProfile,
    loadNavigation: loadNavigation,
    loadLibrary: loadLibrary,
    findByGuid: findByGuid,
    buildLibraryBrowseUrl: buildLibraryBrowseUrl,
    libraryFilterOptionsFromXml: libraryFilterOptionsFromXml,
    loadLibraryFilterOptions: loadLibraryFilterOptions,
    containerFromAttributes: containerFromAttributes,
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
    playbackFromAttributes: playbackFromAttributes,
    playbackModeFromDecisions: playbackModeFromDecisions,
    playbackVersionsFromAttributes: playbackVersionsFromAttributes,
    resolvePlaybackOptions: resolvePlaybackOptions,
    sendTimeline: sendTimeline,
    setWatched: setWatched,
    removeFromContinueWatching: removeFromContinueWatching,
    resetProgress: resetProgress,
    setWatchedAndReset: setWatchedAndReset,
    refreshLibrary: refreshLibrary,
    refreshLibraryMetadata: refreshLibraryMetadata,
    refreshMetadata: refreshMetadata,
    refreshMetadataSequence: refreshMetadataSequence,
    setStreamSelection: setStreamSelection,
    setSubtitleOffset: setSubtitleOffset,
    serverIdentityFromXml: serverIdentityFromXml,
    trackFromAttributes: trackFromAttributes,
    loadHome: loadHome,
    loadRecommendedItems: loadRecommendedItems,
    loadLibraryRecommendations: loadLibraryRecommendations,
    mediaFromAttributes: mediaFromAttributes,
    markersFromAttributes: markersFromAttributes,
    chaptersFromAttributes: chaptersFromAttributes,
    navigationDefinitions: navigationDefinitions,
    parseAttributes: parseAttributes,
    parseItems: parseItems,
    sectionDefinitions: sectionDefinitions
  };
}));
