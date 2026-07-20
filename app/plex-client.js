(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./media-profile'), require('./library-containers'));
  } else {
    root.PloffClient = factory(root.PloffMediaProfile, root.PloffLibraryContainers);
  }
}(this, function (MediaProfile, LibraryContainers) {
  'use strict';

  var transcodeSessionCounter = 0;
  var recommendationCache = {};

  function trimSlash(value, fromStart) {
    return fromStart ? value.replace(/^\/+/, '') : value.replace(/\/+$/, '');
  }

  function buildUrl(baseUrl, path, parameters, token) {
    var url = trimSlash(baseUrl || '', false) + '/' + trimSlash(path || '', true);
    var query = [];
    var key;

    for (key in parameters) {
      if (Object.prototype.hasOwnProperty.call(parameters, key)) {
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key]));
      }
    }
    if (token) {
      query.push('X-Plex-Token=' + encodeURIComponent(token));
    }
    return url + (query.length ? (url.indexOf('?') === -1 ? '?' : (/[?&]$/.test(url) ? '' : '&')) + query.join('&') : '');
  }

  function pad(value) {
    var text = String(value || '0');
    return text.length < 2 ? '0' + text : text;
  }

  function assetUrl(baseUrl, path, token) {
    if (!path) {
      return '';
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return buildUrl(baseUrl, path, {}, token);
  }

  function replaceQueryParameter(url, name, value) {
    var pattern = new RegExp('([?&])' + name + '=[^&]*', 'i');
    if (pattern.test(url)) { return url.replace(pattern, '$1' + name + '=' + value); }
    return url + (url.indexOf('?') === -1 ? '?' : '&') + name + '=' + value;
  }

  function posterUrl(config, sourceUrl, width, height) {
    var baseUrl = String(config.apiBaseUrl || '').replace(/\/$/, '');
    var source = String(sourceUrl || '');
    var targetWidth = Math.max(16, Math.min(1920, Math.round(Number(width || 0))));
    var targetHeight = Math.max(16, Math.min(1080, Math.round(Number(height || 0))));
    if (!source) { return ''; }
    if (baseUrl && source.indexOf(baseUrl) === 0) {
      source = source.slice(baseUrl.length) || '/';
    }
    if (source.indexOf('/composite/') !== -1) {
      source = replaceQueryParameter(source, 'width', targetWidth);
      source = replaceQueryParameter(source, 'height', targetHeight);
    }
    return buildUrl(baseUrl, '/photo/:/transcode', {
      width: targetWidth,
      height: targetHeight,
      minSize: 1,
      upscale: 0,
      url: source
    }, config.token || '');
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

  function mediaFromAttributes(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var title = attributes.title || 'Untitled';
    var meta = type || 'Media';
    var image = assetUrl(baseUrl, attributes.thumb || attributes.art, token);
    var art = assetUrl(baseUrl, attributes.art || attributes.thumb, token);
    var duration = Number(attributes.duration || 0);
    var offset = Number(attributes.viewOffset || 0);
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
    if (detailKey) { item.detailKey = detailKey; }
    if (detailParameters) { item.detailParameters = detailParameters; }
    if (attributes.audienceRating || attributes.rating) {
      item.rating = Number(attributes.audienceRating || attributes.rating);
    }
    if (Number(attributes.viewCount || 0) > 0 ||
        (Number(attributes.leafCount || 0) > 0 && Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount || 0))) {
      item.viewed = true;
    }
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
    return result;
  }

  function parseAttributes(xmlText) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var error = documentNode.getElementsByTagName('parsererror');
    var candidates;
    var items = [];
    var index;
    var node;

    if (error.length) {
      throw new Error('Invalid Plex XML response');
    }
    candidates = documentNode.documentElement.childNodes;
    for (index = 0; index < candidates.length; index += 1) {
      node = candidates[index];
      if (node.nodeType === 1 && (node.nodeName === 'Video' || node.nodeName === 'Directory')) {
        items.push(attributesFromNode(node));
      }
    }
    return items;
  }

  function parseItems(xmlText, baseUrl, token) {
    return parseAttributes(xmlText).map(function (attributes) {
      return mediaFromAttributes(attributes, baseUrl, token);
    });
  }

  function normalizedSearchText(value) {
    return String(value || '').toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function searchAttributesMatch(attributes, query) {
    var terms = normalizedSearchText(query).split(/\s+/).filter(function (term) { return !!term; });
    var searchable;
    if (!terms.length) { return true; }
    searchable = normalizedSearchText([
      attributes.title,
      attributes.originalTitle,
      attributes.titleSort
    ].join(' '));
    return terms.every(function (term) { return searchable.indexOf(term) !== -1; });
  }

  function searchItemsFromAttributes(attributesList, baseUrl, token, query) {
    var seen = {};
    var items = [];
    var attributes;
    var item;
    var index;
    for (index = 0; index < attributesList.length; index += 1) {
      attributes = attributesList[index];
      if ((attributes.type !== 'movie' && attributes.type !== 'show') || !attributes.ratingKey || seen[attributes.ratingKey] || !searchAttributesMatch(attributes, query)) { continue; }
      seen[attributes.ratingKey] = true;
      item = mediaFromAttributes(attributes, baseUrl, token);
      item.libraryTitle = attributes.librarySectionTitle || '';
      items.push(item);
    }
    items.sort(function (left, right) {
      var leftTitle = left.title.toLowerCase();
      var rightTitle = right.title.toLowerCase();
      if (leftTitle < rightTitle) { return -1; }
      if (leftTitle > rightTitle) { return 1; }
      return 0;
    });
    return items;
  }

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
    return searchItemsFromAttributes(attributesList, baseUrl, token, query);
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

  function detailFromAttributes(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var title = attributes.title || 'Untitled';
    var subtitle = '';
    var facts = [];
    var minutes;
    var theme = themeFromAttributes(attributes, baseUrl, token);
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
    return {
      ratingKey: attributes.ratingKey || '',
      index: Number(attributes.index || 0),
      title: attributes.title || 'Season ' + Number(attributes.index || 0),
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      leafCount: Number(attributes.leafCount || 0),
      viewedLeafCount: Number(attributes.viewedLeafCount || 0),
      selected: attributes.ratingKey === selectedKey
    };
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

  function episodeFromAttributes(attributes, baseUrl, token, selectedKey) {
    var duration = Math.max(0, Number(attributes.duration || 0));
    var viewOffset = Math.max(0, Number(attributes.viewOffset || 0));
    return {
      ratingKey: attributes.ratingKey || '',
      index: Number(attributes.index || 0),
      title: attributes.title || 'Episodio ' + Number(attributes.index || 0),
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      viewed: Number(attributes.viewCount || 0) > 0,
      viewOffset: viewOffset,
      duration: duration,
      progress: duration > 0 && viewOffset > 0 ? Math.max(0, Math.min(100, Math.round(viewOffset / duration * 100))) : 0,
      selected: attributes.ratingKey === selectedKey
    };
  }

  function trackFromAttributes(stream) {
    var languageAliases = { eng: 'en', ita: 'it', jpn: 'ja', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', kor: 'ko', chi: 'zh', zho: 'zh', rus: 'ru' };
    var tag = String(stream.languageTag || stream.languageCode || '').toLowerCase().replace(/_/g, '-').split('-')[0];
    tag = languageAliases[tag] || tag;
    return {
      id: stream.id || '',
      language: stream.language || stream.languageCode || 'Sconosciuta',
      languageTag: tag,
      languageCode: languageAliases[String(stream.languageCode || '').toLowerCase()] || tag,
      codec: stream.codec || '',
      forced: stream.forced === '1',
      selected: stream.selected === '1',
      title: stream.title || '',
      index: Number(stream.index || 0),
      key: String(stream.key || ''),
      external: stream.external === '1' || !!stream.key,
      format: String(stream.format || stream.codec || '').toLowerCase(),
      offset: Number(stream.offset || 0)
    };
  }

  function firstTrackByLanguage(tracks, priorities, forcedOnly) {
    var priorityIndex;
    var trackIndex;
    for (priorityIndex = 0; priorityIndex < priorities.length; priorityIndex += 1) {
      for (trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        if ((!forcedOnly || tracks[trackIndex].forced) && tracks[trackIndex].languageTag === priorities[priorityIndex]) {
          return tracks[trackIndex];
        }
      }
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

  function resolvePlaybackOptions(playback, preferences) {
    var current = playback.options || {};
    var settings = preferences || {};
    var audioTracks = playback.audioTracks || [];
    var subtitleTracks = playback.subtitleTracks || [];
    var audio = firstTrackByLanguage(audioTracks, settings.audioLanguages || [], false) || selectedTrack(audioTracks) || audioTracks[0] || null;
    var subtitle = null;
    var mode = settings.subtitleMode || 'audio-mismatch';
    var suppress = settings.subtitleSuppressedForAudio || [];
    var preferredSubtitleLanguage = settings.subtitleLanguages && settings.subtitleLanguages.length ? settings.subtitleLanguages[0] : '';
    var result;

    if (audio && suppress.indexOf(audio.languageTag) !== -1) {
      mode = 'off';
    }
    if (mode === 'always') {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], false) || selectedTrack(subtitleTracks);
    } else if (mode === 'forced') {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], true);
    } else if (mode === 'audio-mismatch' && (!audio || !preferredSubtitleLanguage || audio.languageTag !== preferredSubtitleLanguage)) {
      subtitle = firstTrackByLanguage(subtitleTracks, settings.subtitleLanguages || [], false) || selectedTrack(subtitleTracks);
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
    var profile = 'add-transcode-target(type=videoProfile&context=all&protocol=hls&container=mpegts&videoCodec=h264,hevc,mpeg2video,mpeg4&audioCodec=aac,ac3,eac3,mp2,mp3)'
      + '+add-transcode-target-settings(type=videoProfile&context=all&protocol=hls&ForceZeroByteEmptySegment=true)';
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
          audioTracks: profile && profile.audioTracks || [],
          subtitleTracks: profile && profile.subtitleTracks || [],
          streams: (entry.streams || []).map(trackFromAttributes)
        });
      });
    });
    return versions;
  }

  function playbackFromAttributes(video, media, part, baseUrl, token, session, streams, markers, chapters) {
    var ratingKey = video.ratingKey || '';
    var audioTracks = [];
    var subtitleTracks = [];
    var resumePosition = Math.floor(Number(video.viewOffset || 0) / 1000);
    var streamOffset = resumePosition;
    var options = { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, offset: streamOffset, videoQuality: 'original', playbackMode: 'auto' };
    var playback;

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
      originalVideoCodec: media.videoCodec || ''
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
        groupRecent: true
      };
    });
  }

  function homeDefinitions(sections, config) {
    return [{
      title: 'Continua a guardare',
      path: config && config.continuePath || '/hubs/continueWatching/items'
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

  function loadRecommendedItems(config, sections, callback) {
    var libraries = (sections || []).filter(function (section) {
      return section.key && (section.type === 'movie' || section.type === 'show');
    });
    var cacheKey = String(config.apiBaseUrl || '') + '|' + String(config.token || '') + '|' + libraries.map(function (section) { return section.key; }).join(',');
    var cached = recommendationCache[cacheKey];
    var pending = libraries.length;
    var requests = [];
    var items = [];
    var seen = {};
    var aborted = false;
    if (cached && new Date().getTime() - cached.savedAt < 300000) {
      callback(null, cached.items.slice(0));
      return { abort: function () { aborted = true; } };
    }
    if (!pending) {
      callback(null, []);
      return { abort: function () { aborted = true; } };
    }
    libraries.forEach(function (section) {
      requests.push(request(buildUrl(config.apiBaseUrl, '/hubs/sections/' + section.key, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': config.itemLimit || 12
      }, config.token || ''), config.requestTimeout || 8000, function (error, xmlText) {
        if (aborted) { return; }
        if (!error) {
          try {
            recommendationItemsFromXml(xmlText, config.apiBaseUrl, config.token || '').forEach(function (item) {
              if (!seen[item.ratingKey]) { seen[item.ratingKey] = true; items.push(item); }
            });
          } catch (parseError) {}
        }
        pending -= 1;
        if (!pending) {
          items = items.slice(0, config.itemLimit || 12);
          recommendationCache[cacheKey] = { savedAt: new Date().getTime(), items: items };
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
    var items = [{ title: 'Home', kind: 'home', labelKey: 'nav.home' }];
    sections.forEach(function (section) {
      if (section.key && section.title && (section.type === 'movie' || section.type === 'show')) {
        items.push({ title: section.title, kind: 'library', key: section.key, type: section.type });
      }
    });
    items.push({ title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' });
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
    request(url, config.requestTimeout || 8000, function (error, jsonText) {
      if (error) { callback(error); return; }
      try { callback(null, accountProfileFromJson(jsonText)); }
      catch (parseError) { callback(parseError); }
    });
  }

  function loadNavigation(config, callback) {
    var url = buildUrl(config.apiBaseUrl, config.sectionsPath || '/library/sections', {}, config.token || '');
    request(url, config.requestTimeout || 8000, function (error, xmlText) {
      if (error) { callback(error); return; }
      try { callback(null, navigationDefinitions(parseAttributes(xmlText))); }
      catch (parseError) { callback(parseError); }
    });
  }

  function loadLibrary(config, navigation, callback) {
    loadRows(config, [{
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
    var xhr = new XMLHttpRequest();
    var nativeAbort = xhr.abort;
    var finished = false;
    var header;
    function finish(error, text) {
      if (finished) { return; }
      finished = true;
      callback(error || null, text || '', xhr);
    }
    try {
      xhr.open(method, url, true);
      xhr.timeout = timeout;
      for (header in (headers || {})) {
        if (Object.prototype.hasOwnProperty.call(headers, header) && xhr.setRequestHeader) {
          xhr.setRequestHeader(header, headers[header]);
        }
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) { finish(null, xhr.responseText); }
        else { finish(new Error('Plex request failed with status ' + xhr.status)); }
      };
      xhr.ontimeout = function () { finish(new Error('Plex request timed out')); };
      xhr.onerror = function () { finish(new Error('Plex request failed')); };
      xhr.send();
    } catch (error) {
      setTimeout(function () { finish(error); }, 0);
    }
    return {
      abort: function () {
        if (finished) { return; }
        finished = true;
        if (nativeAbort) { nativeAbort.call(xhr); }
      }
    };
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

  function loadLibraryPage(config, library, view, options, start, size, callback) {
    if (view === 'playlists') { return loadLibraryPlaylists(config, library, start, size, callback); }
    var url = buildLibraryBrowseUrl(config, library, view, options, start, size);
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parser;
      var documentNode;
      var rootAttributes;
      var attributes;
      if (error) { callback(error); return; }
      try {
        parser = new DOMParser();
        documentNode = parser.parseFromString(xmlText, 'application/xml');
        if (documentNode.getElementsByTagName('parsererror').length) { throw new Error('Invalid Plex library response'); }
        rootAttributes = attributesFromNode(documentNode.documentElement);
        attributes = parseAttributes(xmlText);
        if (view === 'recent') { attributes = groupRecentAttributes(attributes); }
        callback(null, {
          items: attributes.map(function (item) {
            return view === 'collections'
              ? containerFromAttributes(item, config.apiBaseUrl, config.token || '', view)
              : mediaFromAttributes(item, config.apiBaseUrl, config.token || '');
          }),
          totalSize: Number(rootAttributes.totalSize || rootAttributes.size || attributes.length),
          libraryKey: String(library.key)
        });
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  function loadLibraryPlaylists(config, library, start, size, callback) {
    var childRequests = [];
    var aborted = false;
    var listRequest = request(buildLibraryBrowseUrl(config, library, 'playlists', {}, start, size), config.requestTimeout || 8000, function (error, xmlText) {
      var attributes;
      var remaining;
      var matches;
      if (aborted) { return; }
      if (error) { callback(error); return; }
      try { attributes = parseAttributes(xmlText).filter(function (item) { return !!(item.key || item.ratingKey); }); }
      catch (parseError) { callback(parseError); return; }
      remaining = attributes.length;
      matches = new Array(remaining);
      if (!remaining) { callback(null, { items: [], totalSize: 0, libraryKey: String(library.key) }); return; }
      attributes.forEach(function (playlist, playlistIndex) {
        var path = playlist.key || '/playlists/' + playlist.ratingKey + '/items';
        childRequests.push(request(buildUrl(config.apiBaseUrl, path, {
          'X-Plex-Container-Start': 0,
          'X-Plex-Container-Size': 1000
        }, config.token || ''), config.requestTimeout || 8000, function (itemError, itemXml) {
          if (aborted) { return; }
          if (!itemError) {
            try {
              if (LibraryContainers.belongsToLibrary(parseAttributes(itemXml), library.key)) { matches[playlistIndex] = playlist; }
            } catch (ignoreParseError) {}
          }
          remaining -= 1;
          if (!remaining) {
            matches = matches.filter(function (item) { return !!item; });
            callback(null, {
              items: matches.map(function (item) { return containerFromAttributes(item, config.apiBaseUrl, config.token || '', 'playlists'); }),
              totalSize: matches.length,
              libraryKey: String(library.key)
            });
          }
        }));
      });
    });
    return {
      abort: function () {
        aborted = true;
        if (listRequest && listRequest.abort) { listRequest.abort(); }
        childRequests.forEach(function (childRequest) { if (childRequest && childRequest.abort) { childRequest.abort(); } });
      }
    };
  }

  function loadLibraryContainerPage(config, container, start, size, callback) {
    var url = buildUrl(config.apiBaseUrl, container.containerKey, {
      'X-Plex-Container-Start': Math.max(0, Number(start || 0)),
      'X-Plex-Container-Size': Math.max(1, Number(size || 60))
    }, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parser;
      var documentNode;
      var rootAttributes;
      var attributes;
      if (error) { callback(error); return; }
      try {
        parser = new DOMParser();
        documentNode = parser.parseFromString(xmlText, 'application/xml');
        rootAttributes = attributesFromNode(documentNode.documentElement);
        attributes = parseAttributes(xmlText);
        callback(null, {
          items: attributes.map(function (item) { return mediaFromAttributes(item, config.apiBaseUrl, config.token || ''); }),
          totalSize: Number(rootAttributes.totalSize || rootAttributes.size || attributes.length),
          libraryKey: ''
        });
      } catch (parseError) { callback(parseError); }
    });
  }

  function loadRows(config, definitions, callback) {
    var rows = [];
    var remaining = definitions.length;
    var firstError = null;

    definitions.forEach(function (definition, index) {
      var url = buildUrl(config.apiBaseUrl, definition.path, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': definition.groupRecent ? (config.recentItemLimit || 30) : (config.itemLimit || 12)
      }, config.token || '');

      request(url, config.requestTimeout || 8000, function (error, xmlText) {
        if (error) {
          firstError = firstError || error;
        } else {
          try {
            var attributes = parseAttributes(xmlText);
            if (definition.groupRecent) {
              attributes = groupRecentAttributes(attributes);
            }
            rows[index] = {
              title: definition.title,
              shape: 'poster',
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
          callback(rows.length ? null : firstError, rows);
        }
      });
    });
  }

  function loadHome(config, callback) {
    var sectionsUrl = buildUrl(
      config.apiBaseUrl,
      config.sectionsPath || '/library/sections',
      {},
      config.token || ''
    );

    request(sectionsUrl, config.requestTimeout || 8000, function (error, xmlText) {
      var sections;
      var definitions;
      var baseComplete = false;
      var recommendationsComplete = false;
      var recommendationDeadlineReached = false;
      var finished = false;
      var recommendationDeadline = null;
      var baseError = null;
      var baseRows = [];
      var recommendedItems = [];
      function finish() {
        if (finished || !baseComplete || (!recommendationsComplete && !recommendationDeadlineReached)) { return; }
        finished = true;
        clearTimeout(recommendationDeadline);
        if (recommendedItems.length) {
          baseRows.splice(1, 0, { title: 'Recommended for You', recommendation: true, shape: 'poster', items: recommendedItems });
        }
        callback(baseRows.length ? null : baseError, baseRows);
      }
      if (error) {
        callback(error);
        return;
      }
      try {
        sections = parseAttributes(xmlText);
        definitions = homeDefinitions(sections, config);
      } catch (parseError) {
        callback(parseError);
        return;
      }
      loadRows(config, definitions, function (rowsError, rows) {
        baseError = rowsError;
        baseRows = rows || [];
        baseComplete = true;
        finish();
      });
      loadRecommendedItems(config, sections, function (recommendationError, items) {
        recommendedItems = recommendationError ? [] : (items || []);
        recommendationsComplete = true;
        finish();
      });
      recommendationDeadline = setTimeout(function () {
        recommendationDeadlineReached = true;
        finish();
      }, 400);
    });
  }

  function loadMetadata(config, ratingKey, callback) {
    var url = buildUrl(
      config.apiBaseUrl,
      '/library/metadata/' + ratingKey,
      { includeGuids: 1 },
      config.token || ''
    );
    request(url, config.requestTimeout || 8000, function (error, xmlText) {
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

  function loadSeasonEpisodes(config, seasonKey, selectedKey, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + seasonKey + '/children', {}, config.token || '');
    request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var episodes;
      var selectedFound = false;
      if (error) {
        callback(error);
        return;
      }
      try {
        episodes = parseAttributes(xmlText).map(function (attributes) {
          return episodeFromAttributes(attributes, config.apiBaseUrl, config.token || '', selectedKey || '');
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
    var url;

    if (!showKey) {
      callback(null, null);
      return;
    }
    url = buildUrl(config.apiBaseUrl, '/library/metadata/' + showKey + '/children', {}, config.token || '');
    request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var seasons;
      if (error) {
        callback(error);
        return;
      }
      try {
        var seasonAttributes = parseAttributes(xmlText).filter(function (attributes) {
          return !!attributes.ratingKey;
        });
        seasonKey = preferredSeasonKeyFromAttributes(seasonAttributes, seasonKey);
        seasons = seasonAttributes.map(function (attributes) {
          return seasonFromAttributes(attributes, config.apiBaseUrl, config.token || '', seasonKey);
        });
      } catch (parseError) {
        callback(parseError);
        return;
      }
      if (!seasonKey) {
        callback(null, { seasons: seasons, episodes: [] });
        return;
      }
      loadSeasonEpisodes(config, seasonKey, detail.type === 'episode' ? detail.ratingKey : '', function (episodeError, episodes) {
        if (episodeError) {
          callback(episodeError);
        } else {
          callback(null, { seasons: seasons, episodes: episodes });
        }
      });
    });
  }

  function loadPlayback(config, ratingKey, session, preferences, callback) {
    if (typeof preferences === 'function') {
      callback = preferences;
      preferences = null;
    }
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey, { includeMarkers: 1, includeChapters: 1 }, config.token || '');
    request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parser;
      var documentNode;
      var video;
      var media;
      var part;
      var mediaNodes;
      var partNodes;
      var versionGroups = [];
      var versions;
      var selectedMediaIndex;
      var selectedPartIndex;
      var streamNodes;
      var streams = [];
      var markerNodes;
      var markers = [];
      var chapterNodes;
      var chapters = [];
      var streamIndex;
      if (error) {
        callback(error);
        return;
      }
      try {
        parser = new DOMParser();
        documentNode = parser.parseFromString(xmlText, 'application/xml');
        video = documentNode.getElementsByTagName('Video')[0];
        mediaNodes = video ? video.getElementsByTagName('Media') : [];
        for (streamIndex = 0; streamIndex < mediaNodes.length; streamIndex += 1) {
          var group = { media: attributesFromNode(mediaNodes[streamIndex]), parts: [] };
          partNodes = mediaNodes[streamIndex].getElementsByTagName('Part');
          for (var partNodeIndex = 0; partNodeIndex < partNodes.length; partNodeIndex += 1) {
            var versionStreams = [];
            var versionStreamNodes = partNodes[partNodeIndex].getElementsByTagName('Stream');
            for (var versionStreamIndex = 0; versionStreamIndex < versionStreamNodes.length; versionStreamIndex += 1) {
              versionStreams.push(attributesFromNode(versionStreamNodes[versionStreamIndex]));
            }
            group.parts.push({ part: attributesFromNode(partNodes[partNodeIndex]), streams: versionStreams });
          }
          versionGroups.push(group);
        }
        versions = playbackVersionsFromAttributes(versionGroups);
        selectedMediaIndex = preferences && isFinite(Number(preferences.mediaIndex)) ? Number(preferences.mediaIndex) : 0;
        selectedPartIndex = preferences && isFinite(Number(preferences.partIndex)) ? Number(preferences.partIndex) : 0;
        media = mediaNodes[selectedMediaIndex] || mediaNodes[0];
        partNodes = media ? media.getElementsByTagName('Part') : [];
        part = partNodes[selectedPartIndex] || partNodes[0];
        if (!video || !media || !part) {
          throw new Error('Plex playback media is incomplete');
        }
        streamNodes = part.getElementsByTagName('Stream');
        for (streamIndex = 0; streamIndex < streamNodes.length; streamIndex += 1) {
          streams.push(attributesFromNode(streamNodes[streamIndex]));
        }
        markerNodes = documentNode.getElementsByTagName('Marker');
        for (streamIndex = 0; streamIndex < markerNodes.length; streamIndex += 1) {
          markers.push(attributesFromNode(markerNodes[streamIndex]));
        }
        chapterNodes = documentNode.getElementsByTagName('Chapter');
        for (streamIndex = 0; streamIndex < chapterNodes.length; streamIndex += 1) {
          chapters.push(attributesFromNode(chapterNodes[streamIndex]));
        }
        var playback = playbackFromAttributes(
          attributesFromNode(video),
          attributesFromNode(media),
          attributesFromNode(part),
          config.apiBaseUrl,
          config.token || '',
          session,
          streams,
          markers,
          chaptersFromAttributes(chapters, config.apiBaseUrl, config.token || '')
        );
        playback.mediaVersions = versions;
        playback.mediaIndex = mediaNodes.length && media === mediaNodes[selectedMediaIndex] ? selectedMediaIndex : 0;
        playback.partIndex = partNodes.length && part === partNodes[selectedPartIndex] ? selectedPartIndex : 0;
        playback.partKey = part.getAttribute('key') || '';
        playback.options.mediaIndex = playback.mediaIndex;
        playback.options.partIndex = playback.partIndex;
        if (preferences) {
          playback.options = resolvePlaybackOptions(playback, preferences);
        }
        function ready() { callback(null, playback); }
        if (preferences && playback.partId) {
          setStreamSelection(config, playback, playback.options, function () { ready(); });
        } else {
          ready();
        }
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  function loadMediaProfile(config, ratingKey, callback) {
    var url = buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey, {}, config.token || '');
    return request(url, config.requestTimeout || 8000, function (error, xmlText) {
      var parser;
      var documentNode;
      var video;
      var media;
      var part;
      var mediaNodes;
      var partNodes;
      var groups = [];
      var profiles;
      var streamNodes;
      var streams = [];
      var index;
      if (error) { callback(error); return; }
      try {
        parser = new DOMParser();
        documentNode = parser.parseFromString(xmlText, 'application/xml');
        video = documentNode.getElementsByTagName('Video')[0];
        mediaNodes = video ? video.getElementsByTagName('Media') : [];
        media = mediaNodes[0];
        part = media ? media.getElementsByTagName('Part')[0] : null;
        if (!video || !media || !part || !MediaProfile) { throw new Error('Plex media profile is incomplete'); }
        for (index = 0; index < mediaNodes.length; index += 1) {
          var group = { media: attributesFromNode(mediaNodes[index]), parts: [] };
          partNodes = mediaNodes[index].getElementsByTagName('Part');
          for (var partIndex = 0; partIndex < partNodes.length; partIndex += 1) {
            streams = [];
            streamNodes = partNodes[partIndex].getElementsByTagName('Stream');
            for (var streamIndex = 0; streamIndex < streamNodes.length; streamIndex += 1) { streams.push(attributesFromNode(streamNodes[streamIndex])); }
            group.parts.push({ part: attributesFromNode(partNodes[partIndex]), streams: streams });
          }
          groups.push(group);
        }
        profiles = MediaProfile.fromVersions(attributesFromNode(video), groups);
        if (!profiles.length) { throw new Error('Plex media profile has no playable versions'); }
        profiles[0].versions = profiles;
        callback(null, profiles[0]);
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  function sendTimeline(config, playback, state, time, callback) {
    var url = buildUrl(config.apiBaseUrl, '/:/timeline', {
      ratingKey: playback.ratingKey,
      key: playback.key,
      state: state,
      time: Math.max(0, Math.round(time || 0)),
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

  function playbackModeFromDecisions(videoDecision, audioDecision) {
    var videoTranscodes = videoDecision === 'transcode' || videoDecision === 'burn';
    var audioTranscodes = audioDecision === 'transcode';
    if (videoTranscodes && audioTranscodes) { return 'transcode-audio-video'; }
    if (videoTranscodes) { return 'transcode-video'; }
    if (audioTranscodes) { return 'transcode-audio'; }
    if (videoDecision === 'copy' && (audioDecision === 'copy' || !audioDecision)) { return 'direct-stream'; }
    return 'unknown';
  }

  function playbackModeFromXml(xmlText, fallbackMode) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    var sessionNode = documentNode.getElementsByTagName('TranscodeSession')[0];
    var mediaNode = documentNode.getElementsByTagName('Media')[0];
    var streamNodes = documentNode.getElementsByTagName('Stream');
    var videoDecision = sessionNode ? sessionNode.getAttribute('videoDecision') || '' : '';
    var audioDecision = sessionNode ? sessionNode.getAttribute('audioDecision') || '' : '';
    var index;
    var streamType;
    if (mediaNode) {
      videoDecision = videoDecision || mediaNode.getAttribute('videoDecision') || '';
      audioDecision = audioDecision || mediaNode.getAttribute('audioDecision') || '';
    }
    for (index = 0; index < streamNodes.length; index += 1) {
      streamType = streamNodes[index].getAttribute('streamType');
      if (streamType === '1' && !videoDecision) { videoDecision = streamNodes[index].getAttribute('decision') || ''; }
      if (streamType === '2' && !audioDecision) { audioDecision = streamNodes[index].getAttribute('decision') || ''; }
    }
    if (!videoDecision && fallbackMode === 'transcode') { videoDecision = 'transcode'; }
    if (!audioDecision && fallbackMode === 'transcode') { audioDecision = 'transcode'; }
    return playbackModeFromDecisions(videoDecision, audioDecision);
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
      return;
    }
    request(buildDecisionUrl(config, playback, options), config.requestTimeout || 8000, function (error, xmlText) {
      if (!error) {
        try { playback.playbackMode = playbackModeFromXml(xmlText, options.playbackMode); }
        catch (parseError) { playback.playbackMode = options.playbackMode === 'transcode' ? 'transcode-audio-video' : 'unknown'; }
      }
      callback(error || null, playback.sourceUrl, playback.playbackMode);
    });
  }

  function buildStreamSelectionUrl(config, partId, audioStreamID, subtitleStreamID) {
    return buildUrl(config.apiBaseUrl, '/library/parts/' + partId, {
      audioStreamID: audioStreamID,
      subtitleStreamID: subtitleStreamID || 0,
      allParts: 1
    }, config.token || '');
  }

  function setStreamSelection(config, playback, options, callback) {
    if (!playback.partId) { callback(new Error('Plex media part ID is missing')); return; }
    requestWithMethod(
      buildStreamSelectionUrl(config, playback.partId, options.audioStreamID, options.subtitleStreamID),
      'PUT',
      config.requestTimeout || 8000,
      function (error) { callback(error || null); }
    );
  }

  function buildSubtitleStreamUrl(config, track) {
    return buildUrl(config.apiBaseUrl, '/library/streams/' + encodeURIComponent(String(track.id || '')) + '.vtt', {
      encoding: 'utf-8',
      format: 'webvtt'
    }, config.token || '');
  }

  function buildSubtitleTranscodeUrl(config, playback, track) {
    var options = playback.options || {};
    return buildUrl(config.apiBaseUrl, '/video/:/transcode/universal/subtitles', {
      path: playback.key,
      mediaIndex: options.mediaIndex === undefined ? Number(playback.mediaIndex || 0) : Number(options.mediaIndex),
      partIndex: options.partIndex === undefined ? Number(playback.partIndex || 0) : Number(options.partIndex),
      subtitleStreamID: track.id,
      protocol: 'http',
      format: 'webvtt',
      advancedSubtitles: 'text',
      transcodeSessionId: String(playback.session || 'ploff') + '-subtitle-' + String(track.id || ''),
      'X-Plex-Product': 'Ploff',
      'X-Plex-Version': '0.1',
      'X-Plex-Client-Identifier': 'ploff-webos'
    }, config.token || '');
  }

  function loadSubtitleText(config, playback, track, callback) {
    var url = track && track.external
      ? buildSubtitleStreamUrl(config, track)
      : buildSubtitleTranscodeUrl(config, playback, track || {});
    return request(url, config.requestTimeout || 8000, function (error, responseText) {
      callback(error || null, error ? '' : responseText);
    });
  }

  function buildSubtitleOffsetUrl(config, streamId, offsetMs) {
    return buildUrl(config.apiBaseUrl, '/library/streams/' + encodeURIComponent(String(streamId || '')) + '.vtt', {
      offset: Math.round(Number(offsetMs || 0))
    }, config.token || '');
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
    request(buildWatchedUrl(config, ratingKey, watched), config.requestTimeout || 8000, function (error) {
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
    request(buildProgressUrl(config, ratingKey, 0), config.requestTimeout || 8000, function (error) {
      callback(error || null);
    });
  }

  function setWatchedAndReset(config, ratingKey, watched, callback) {
    setWatched(config, ratingKey, watched, function (watchedError) {
      if (watchedError) { callback(watchedError); return; }
      resetProgress(config, ratingKey, callback);
    });
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
    parseItems: parseItems,
    sectionDefinitions: sectionDefinitions
  };
}));
