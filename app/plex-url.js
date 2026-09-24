(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlexUrl = factory(); }
}(this, function () {
  'use strict';

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
    if (token) { query.push('X-Plex-Token=' + encodeURIComponent(token)); }
    return url + (query.length ? (url.indexOf('?') === -1 ? '?' : (/[?&]$/.test(url) ? '' : '&')) + query.join('&') : '');
  }

  function assetUrl(baseUrl, path, token) {
    if (!path) { return ''; }
    if (/^https?:\/\//i.test(path)) { return path; }
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
    if (baseUrl && source.indexOf(baseUrl) === 0) { source = source.slice(baseUrl.length) || '/'; }
    if (source.indexOf('/composite/') !== -1) {
      source = replaceQueryParameter(source, 'width', targetWidth);
      source = replaceQueryParameter(source, 'height', targetHeight);
    }
    return buildUrl(baseUrl, '/photo/:/transcode', {
      width: targetWidth, height: targetHeight, minSize: 1, upscale: 0, url: source
    }, config.token || '');
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

  function buildWatchedUrl(config, ratingKey, watched) {
    return buildUrl(config.apiBaseUrl, watched ? '/:/scrobble' : '/:/unscrobble', {
      key: ratingKey,
      identifier: 'com.plexapp.plugins.library'
    }, config.token || '');
  }

  function buildRemoveFromContinueWatchingUrl(config, ratingKey) {
    return buildUrl(config.apiBaseUrl, '/actions/removeFromContinueWatching', {
      ratingKey: ratingKey
    }, config.token || '');
  }

  function buildProgressUrl(config, ratingKey, time) {
    var progressTime = Number(time);
    if (progressTime !== -1) {
      progressTime = Math.max(0, Math.round(progressTime || 0));
    }
    return buildUrl(config.apiBaseUrl, '/:/progress', {
      key: ratingKey,
      time: progressTime,
      state: 'stopped',
      identifier: 'com.plexapp.plugins.library'
    }, config.token || '');
  }

  function buildLibraryRefreshUrl(config, libraryKey, force) {
    return buildUrl(config.apiBaseUrl, '/library/sections/' + libraryKey + '/refresh', force ? { force: 1 } : {}, config.token || '');
  }

  function buildMetadataRefreshUrl(config, ratingKey) {
    return buildUrl(config.apiBaseUrl, '/library/metadata/' + ratingKey + '/refresh', {}, config.token || '');
  }

  return {
    buildUrl: buildUrl,
    assetUrl: assetUrl,
    posterUrl: posterUrl,
    buildLibraryBrowseUrl: buildLibraryBrowseUrl,
    buildWatchedUrl: buildWatchedUrl,
    buildRemoveFromContinueWatchingUrl: buildRemoveFromContinueWatchingUrl,
    buildProgressUrl: buildProgressUrl,
    buildLibraryRefreshUrl: buildLibraryRefreshUrl,
    buildMetadataRefreshUrl: buildMetadataRefreshUrl
  };
}));
