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

  return { trimSlash: trimSlash, buildUrl: buildUrl, assetUrl: assetUrl, replaceQueryParameter: replaceQueryParameter, posterUrl: posterUrl };
}));
