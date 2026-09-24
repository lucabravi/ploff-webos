(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./plex-url'), require('./media-profile')); }
  else { root.PloffPlexMediaMapper = factory(root.PloffPlexUrl, root.PloffMediaProfile); }
}(this, function (PlexUrl, MediaProfile) {
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
   * @property {string=} subtitleKey
   * @property {Object<string, *>=} subtitleParameters
   * @property {string=} seasonTitleKey
   * @property {Object<string, *>=} seasonTitleParameters
   * @property {string} facts
   * @property {string} summary
   * @property {string} image
   * @property {string} art
   * @property {string=} guid
   * @property {string=} watchlistGuid
   * @property {string=} themeKey
   * @property {string=} themeUrl
   */

  var assetUrl = PlexUrl.assetUrl;
function pad(value) {
    var text = String(value || '0');
    return text.length < 2 ? '0' + text : text;
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

function mediaPresentationFields(attributes, baseUrl, token) {
    var type = attributes.type || '';
    var title = attributes.title || 'Untitled';
    var meta = type || 'Media';
    var image = assetUrl(baseUrl, attributes.thumb || attributes.art, token);
    var art = assetUrl(baseUrl, attributes.art || attributes.thumb, token);
    var detail = '';
    var fields = {};

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
        fields.metaKey = 'media.season';
        fields.metaParameters = { number: Number(attributes.parentIndex || 0) };
      }
      if (attributes.recentlyAdded === '1') {
        detail = 'Episode ' + Number(attributes.index || 0);
        fields.detailKey = 'media.episodeNumber';
        fields.detailParameters = { number: Number(attributes.index || 0) };
      } else {
        detail = 'E' + pad(attributes.index);
        if (attributes.title) { detail += ' - ' + attributes.title; }
      }
      fields.seasonIndex = Number(attributes.parentIndex || 0);
      fields.episodeIndex = Number(attributes.index || 0);
    } else if (type === 'movie') {
      meta = 'Movie' + (attributes.year ? ' - ' + attributes.year : '');
      fields.metaKey = attributes.year ? 'media.movieWithYear' : 'media.movie';
      if (attributes.year) { fields.metaParameters = { year: attributes.year }; }
    } else if (type === 'show') {
      meta = 'TV Shows';
      fields.metaKey = 'media.show';
    } else if (type === 'season') {
      title = attributes.parentTitle || title;
      meta = 'Season ' + Number(attributes.index || 0);
      fields.metaKey = 'media.season';
      fields.metaParameters = { number: Number(attributes.index || 0) };
      if (attributes.recentlyAddedCount) {
        detail = attributes.recentlyAddedCount + (attributes.recentlyAddedCount === '1' ? ' new episode' : ' new episodes');
        fields.detailKey = 'media.newEpisodeCount';
        fields.detailParameters = { count: Number(attributes.recentlyAddedCount) };
      } else if (attributes.leafCount) {
        detail = attributes.leafCount + (attributes.leafCount === '1' ? ' episode' : ' episodes');
        fields.detailKey = 'media.episodeCount';
        fields.detailParameters = { count: Number(attributes.leafCount) };
      }
    }

    fields.title = title;
    fields.meta = meta;
    fields.image = image;
    fields.art = art;
    if (!attributes.title && !attributes.parentTitle && !attributes.grandparentTitle) {
      fields.titleKey = 'media.untitled';
    }
    if (detail) { fields.detail = detail; }
    return fields;
  }

function mediaContextFields(attributes) {
    var fields = {};
    var type = attributes.type || '';
    if (attributes.librarySectionTitle) { fields.libraryTitle = attributes.librarySectionTitle; }
    if (attributes.librarySectionID) { fields.librarySectionID = String(attributes.librarySectionID); }
    if (attributes.year) { fields.year = Number(attributes.year) || attributes.year; }
    if (attributes.genre) { fields.genre = attributes.genre; }
    if (attributes.summary) { fields.summary = attributes.summary; }
    if (attributes.tagline) { fields.tagline = attributes.tagline; }
    if (attributes.contentRating) { fields.contentRating = attributes.contentRating; }
    if (type === 'show') { fields.seasonCount = Math.max(0, Number(attributes.childCount || 0)); }
    if (attributes.guid) { fields.guid = attributes.guid; }
    if (attributes.lastViewedAt) { fields.lastViewedAt = Math.max(0, Number(attributes.lastViewedAt) || 0); }
    if (attributes.updatedAt) { fields.updatedAt = Math.max(0, Number(attributes.updatedAt) || 0); }
    if (attributes.addedAt) { fields.addedAt = Math.max(0, Number(attributes.addedAt) || 0); }
    return fields;
  }

function mediaIdentityFields(attributes, baseUrl, token) {
    var fields = {};
    var type = attributes.type || '';
    var theme = themeFromAttributes(attributes, baseUrl, token);
    if (attributes.ratingKey) {
      fields.ratingKey = attributes.ratingKey;
      fields.type = type;
      if (type === 'episode' && attributes.grandparentRatingKey) {
        fields.themeLookupKey = 'show:' + attributes.grandparentRatingKey;
      } else if (type === 'season' && attributes.parentRatingKey) {
        fields.themeLookupKey = 'show:' + attributes.parentRatingKey;
      } else {
        fields.themeLookupKey = type + ':' + attributes.ratingKey;
      }
    }
    if (theme) {
      fields.themeKey = theme.key;
      fields.themeUrl = theme.url;
    }
    return fields;
  }

function watchedFromAttributes(attributes) {
    var type = String(attributes && attributes.type || '');
    var leafCount;
    var viewedLeafCount;
    if (type === 'show' || type === 'season') {
      leafCount = Math.max(0, Number(attributes.leafCount || 0));
      viewedLeafCount = Math.max(0, Number(attributes.viewedLeafCount || 0));
      return leafCount > 0 && viewedLeafCount >= leafCount;
    }
    return Number(attributes && attributes.viewCount || 0) > 0;
  }

function mediaPlaybackFields(attributes) {
    var fields = {};
    var type = String(attributes.type || '');
    var duration = Number(attributes.duration || 0);
    var offset = Number(attributes.viewOffset || 0);
    if (attributes.audienceRating || attributes.rating) {
      fields.rating = Number(attributes.audienceRating || attributes.rating);
    }
    if (watchedFromAttributes(attributes) ||
        ((type !== 'show' && type !== 'season') && Number(attributes.leafCount || 0) > 0 &&
          Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount || 0))) {
      fields.viewed = true;
    }
    if (duration > 0) { fields.duration = duration; }
    if (offset > 0) { fields.viewOffset = offset; }
    if (duration > 0 && offset > 0) {
      fields.progress = Math.max(0, Math.min(100, Math.round(offset / duration * 100)));
    }
    return fields;
  }

function copySelectedFields(target, source, names) {
    names.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(source, name)) { target[name] = source[name]; }
    });
  }

function mediaFromAttributes(attributes, baseUrl, token) {
    var presentation = mediaPresentationFields(attributes, baseUrl, token);
    var context = mediaContextFields(attributes);
    var identity = mediaIdentityFields(attributes, baseUrl, token);
    var playback = mediaPlaybackFields(attributes);
    /** @type {MediaCardRecord} */
    var item = {
      title: presentation.title,
      meta: presentation.meta,
      image: presentation.image,
      art: presentation.art
    };

    copySelectedFields(item, presentation, ['titleKey', 'metaKey', 'metaParameters']);
    copySelectedFields(item, context, [
      'libraryTitle', 'librarySectionID', 'year', 'genre', 'summary', 'tagline', 'contentRating', 'seasonCount', 'guid',
      'lastViewedAt', 'updatedAt', 'addedAt'
    ]);
    copySelectedFields(item, identity, ['ratingKey', 'type', 'themeLookupKey']);
    copySelectedFields(item, presentation, ['detail', 'seasonIndex', 'episodeIndex', 'detailKey', 'detailParameters']);
    copySelectedFields(item, playback, ['rating', 'viewed', 'duration', 'viewOffset', 'progress']);
    copySelectedFields(item, identity, ['themeKey', 'themeUrl']);
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

function recentSeasonKey(item) {
    if (!item || item.type !== 'episode') { return ''; }
    return String(item.parentRatingKey || (item.grandparentTitle || '') + '|' + (item.parentIndex || ''));
  }

function recentEpisodeAttributes(item) {
    var result = {};
    Object.keys(item || {}).forEach(function (name) { result[name] = item[name]; });
    result.recentlyAdded = '1';
    return result;
  }

function recentSeasonGroupAttributes(items) {
    var first = items[0] || {};
    var viewedCount = 0;
    items.forEach(function (item) {
      if (Number(item.viewCount || 0) > 0) { viewedCount += 1; }
    });
    return {
      type: 'season',
      ratingKey: first.parentRatingKey,
      title: first.parentTitle || 'Season ' + first.parentIndex,
      parentTitle: first.grandparentTitle,
      parentRatingKey: first.grandparentRatingKey,
      index: first.parentIndex,
      leafCount: String(items.length),
      viewedLeafCount: String(viewedCount),
      thumb: first.parentThumb || first.grandparentThumb || first.thumb,
      art: first.grandparentArt || first.art,
      theme: first.grandparentTheme || first.theme,
      librarySectionTitle: first.librarySectionTitle,
      lastViewedAt: first.lastViewedAt,
      updatedAt: first.updatedAt,
      addedAt: first.addedAt,
      recentlyAddedCount: String(items.length)
    };
  }

function groupRecentAttributes(items) {
    var grouped = [];
    var run = [];
    var runKey = '';

    function flushRun() {
      if (!run.length) { return; }
      if (run.length >= 3) {
        grouped.push(recentSeasonGroupAttributes(run));
      } else {
        run.forEach(function (item) { grouped.push(recentEpisodeAttributes(item)); });
      }
      run = [];
      runKey = '';
    }

    (items || []).forEach(function (item) {
      var key;
      if (!item || item.type !== 'episode') {
        flushRun();
        grouped.push(item);
        return;
      }
      key = recentSeasonKey(item);
      if (!key) {
        flushRun();
        grouped.push(recentEpisodeAttributes(item));
        return;
      }
      if (run.length && key !== runKey) { flushRun(); }
      if (!run.length) { runKey = key; }
      run.push(item);
    });
    flushRun();
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
      viewed: watchedFromAttributes(attributes),
      viewOffset: Math.max(0, Number(attributes.viewOffset || 0)),
      duration: Math.max(0, Number(attributes.duration || 0)),
      title: title,
      subtitle: subtitle,
      facts: facts.join('  |  '),
      summary: attributes.summary || '',
      image: assetUrl(baseUrl, attributes.grandparentThumb || attributes.parentThumb || attributes.thumb || attributes.art, token),
      art: assetUrl(baseUrl, attributes.grandparentArt || attributes.art || attributes.thumb, token)
    };
    if (type === 'episode' && !attributes.parentTitle && Number(attributes.parentIndex || 0) > 0) {
      result.seasonTitleKey = 'media.season';
      result.seasonTitleParameters = { number: Number(attributes.parentIndex || 0) };
    }
    if (type === 'season' && !attributes.title && Number(attributes.index || 0) > 0) {
      result.subtitleKey = 'media.season';
      result.subtitleParameters = { number: Number(attributes.index || 0) };
    }
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
    var index = Number(attributes.index || 0);
    var season = {
      ratingKey: attributes.ratingKey || '',
      index: index,
      title: attributes.title || 'Season ' + index,
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      leafCount: Number(attributes.leafCount || 0),
      viewedLeafCount: Number(attributes.viewedLeafCount || 0),
      selected: attributes.ratingKey === selectedKey
    };
    if (!attributes.title && index > 0) {
      season.titleKey = 'media.season';
      season.titleParameters = { number: index };
    }
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
      title: attributes.title || '',
      image: assetUrl(baseUrl, attributes.thumb || attributes.art, token),
      viewed: Number(attributes.viewCount || 0) > 0,
      viewOffset: viewOffset,
      duration: duration,
      progress: duration > 0 && viewOffset > 0 ? Math.max(0, Math.min(100, Math.round(viewOffset / duration * 100))) : 0,
      selected: attributes.ratingKey === selectedKey
    };
    if (!attributes.title) {
      episode.titleKey = 'media.episodeNumber';
      episode.titleParameters = { number: Number(attributes.index || 0) };
    }
    if (attributes.year || seasonYear) { episode.year = Number(attributes.year || seasonYear) || attributes.year || seasonYear; }
    return episode;
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

  function playbackFromAttributes(video, media, part, session, streams, markers, chapters) {
    var ratingKey = video.ratingKey || '';
    var audioTracks = [];
    var subtitleTracks = [];
    var resumePosition = Math.floor(Number(video.viewOffset || 0) / 1000);
    var options = { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, offset: resumePosition, videoQuality: 'original', playbackMode: 'auto' };
    var mediaProfile = MediaProfile ? MediaProfile.fromNodes(video, media, part, streams || []) : null;
    (streams || []).forEach(function (stream) {
      var track = MediaProfile.trackFromAttributes(stream);
      if (stream.streamType === '2') {
        audioTracks.push(track);
        if (track.selected) { options.audioStreamID = track.id; }
      } else if (stream.streamType === '3') {
        subtitleTracks.push(track);
        if (track.selected) { options.subtitleStreamID = track.id; }
      }
    });
    return {
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
      offsetBase: resumePosition,
      originalContainer: media.container || part.container || '',
      originalVideoCodec: media.videoCodec || '',
      mediaProfile: mediaProfile
    };
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
          streams: (entry.streams || []).map(MediaProfile.trackFromAttributes)
        });
      });
    });
    return versions;
  }

  return {
    chaptersFromAttributes: chaptersFromAttributes,
    markersFromAttributes: markersFromAttributes,
    playbackFromAttributes: playbackFromAttributes,
    playbackVersionsFromAttributes: playbackVersionsFromAttributes,
    containerFromAttributes: containerFromAttributes,
    detailFromAttributes: detailFromAttributes,
    episodeFromAttributes: episodeFromAttributes,
    groupRecentAttributes: groupRecentAttributes,
    mediaFromAttributes: mediaFromAttributes,
    preferredSeasonKeyFromAttributes: preferredSeasonKeyFromAttributes,
    recentCardFromAttributes: recentCardFromAttributes,
    seasonFromAttributes: seasonFromAttributes,
    watchedFromAttributes: watchedFromAttributes
  };
}));
