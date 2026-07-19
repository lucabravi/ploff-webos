(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffDiagnosticsState = factory();
  }
}(this, function () {
  'use strict';

  function abbreviateIdentifier(value) {
    var text = String(value || '');
    if (text.length <= 10) { return text; }
    return text.slice(0, 4) + '...' + text.slice(-4);
  }

  function sanitizeText(value) {
    var text = value && value.message ? value.message : String(value || '');
    return text
      .replace(/https?:\/\/[^\s]+/gi, '[url]')
      .replace(/(token\s*=\s*)[^\s&]+/gi, '$1[redacted]')
      .replace(/ghp_[A-Za-z0-9]+/g, '[redacted]')
      .replace(/X-Plex-Token\s*[:=]\s*[^\s&]+/gi, 'X-Plex-Token=[redacted]');
  }

  function sanitizeServerUri(value) {
    var match = String(value || '').match(/^(https?:\/\/)(?:[^@/?#]+@)?([^/?#]+)/i);
    return match ? match[1].toLowerCase() + match[2] : '';
  }

  function serverAddresses(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    var result = [];
    var index;
    var uri;
    for (index = 0; index < source.length; index += 1) {
      uri = sanitizeServerUri(source[index] && source[index].uri);
      if (uri) {
        result.push({ kind: source[index].kind === 'local' ? 'local' : 'remote', uri: uri });
      }
    }
    return result;
  }

  function server(value) {
    var source = value || {};
    return {
      name: sanitizeText(source.name),
      version: sanitizeText(source.version),
      machineIdentifier: abbreviateIdentifier(source.machineIdentifier),
      reachable: source.reachable === true,
      addresses: serverAddresses(source.addresses)
    };
  }

  function profile(value) {
    var source = value || {};
    return {
      mode: sanitizeText(source.mode),
      name: sanitizeText(source.name)
    };
  }

  function device(value) {
    var source = value || {};
    return {
      modelName: sanitizeText(source.modelName),
      webOSVersion: sanitizeText(source.webOSVersion),
      viewport: sanitizeText(source.viewport),
      known: source.known === true,
      uhd: source.uhd === true,
      hdr10: source.hdr10 === true
    };
  }

  function playback(value) {
    var source = value || null;
    if (!source) { return null; }
    return {
      fileName: sanitizeText(source.fileName),
      fileSize: Math.max(0, Number(source.fileSize || 0)),
      source: sanitizeText(source.source),
      delivery: sanitizeText(source.delivery),
      strategy: sanitizeText(source.strategy),
      attempts: (source.attempts || []).map(sanitizeText),
      fallback: sanitizeText(source.fallback),
      position: Math.max(0, Number(source.position || 0)),
      duration: Math.max(0, Number(source.duration || 0)),
      buffered: sanitizeText(source.buffered),
      state: sanitizeText(source.state)
    };
  }

  function snapshot(inputs) {
    var source = inputs || {};
    return {
      appVersion: sanitizeText(source.appVersion),
      server: server(source.server),
      profile: profile(source.profile),
      device: device(source.device),
      playback: playback(source.playback),
      error: sanitizeText(source.error)
    };
  }

  return {
    abbreviateIdentifier: abbreviateIdentifier,
    device: device,
    playback: playback,
    profile: profile,
    sanitizeText: sanitizeText,
    sanitizeServerUri: sanitizeServerUri,
    server: server,
    snapshot: snapshot
  };
}));
