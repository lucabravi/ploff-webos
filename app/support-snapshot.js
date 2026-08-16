(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./diagnostics-state'));
  } else {
    root.PloffSupportSnapshot = factory(root.PloffDiagnosticsState);
  }
}(this, function (DiagnosticsState) {
  'use strict';

  var SCHEMA = 1;
  var MAX_EVENTS = 24;
  var MAX_JS_ERRORS = 12;
  var MAX_SERIALIZED = 2400;
  var MAX_QR_INPUT = 2700;
  var MAX_FIELD = 180;

  function text(value, limit) {
    var result = DiagnosticsState.sanitizeText(value);
    var maximum = Number(limit || MAX_FIELD);
    result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
    result = result.replace(/[\r\n]+/g, ' ');
    return result.length > maximum ? result.slice(0, maximum - 3) + '...' : result;
  }

  function basename(value) {
    var parts = String(value || '').split(/[\\/]/);
    return text(parts[parts.length - 1] || '', 160);
  }

  function number(value) {
    var result = Number(value || 0);
    return isFinite(result) && result >= 0 ? result : 0;
  }

  function optionalNumber(value) {
    var result;
    if (value === undefined || value === null || value === '') { return null; }
    result = Number(value);
    return isFinite(result) ? result : null;
  }

  function timestamp(value) {
    var date = value ? new Date(value) : new Date();
    if (!isFinite(date.getTime())) { return ''; }
    return date.toISOString ? date.toISOString() : String(date.getTime());
  }

  function boolean(value) {
    return value === true;
  }

  function selectedTrackId(source, kind) {
    var options = source && source.options || {};
    return String(options[kind === 'audio' ? 'audioStreamID' : 'subtitleStreamID'] || '');
  }

  function selectedTrack(source, selectedId) {
    var values = Object.prototype.toString.call(source) === '[object Array]' ? source : [];
    var first = null;
    var index;
    for (index = 0; index < values.length; index += 1) {
      if (!first) { first = values[index]; }
      if (selectedId && String(values[index] && values[index].id || '') === selectedId) { return values[index]; }
      if (!selectedId && values[index] && values[index].selected) { return values[index]; }
    }
    return first;
  }

  function hasTrack(value) {
    return !!(value && (value.id || value.language || value.title || value.codec || value.format || value.selected));
  }

  function track(source, selectedId) {
    var item = source || {};
    var id = String(item.id || '');
    return {
      language: text(item.language || item.title || item.languageTag || item.languageCode),
      languageTag: text(item.languageTag || item.languageCode, 20),
      codec: text(item.codec || item.format, 40),
      format: text(item.format || item.codec, 40),
      channels: number(item.channels),
      bitrate: number(item.bitrate),
      samplingRate: number(item.samplingRate || item.sampleRate),
      bitDepth: number(item.bitDepth),
      profile: text(item.profile || item.audioProfile, 50),
      channelLayout: text(item.channelLayout, 40),
      description: text(item.extendedDisplayTitle || item.displayTitle || item.title, 140),
      offsetMs: optionalNumber(item.offsetMs !== undefined ? item.offsetMs : item.offset),
      external: boolean(item.external),
      forced: boolean(item.forced),
      selected: boolean(item.selected) || (!!selectedId && id === selectedId)
    };
  }

  function safeQueue(value) {
    var source = value || {};
    var sequence = source.sequence || {};
    var queue = source.seriesQueue || source.playlistQueue || null;
    var origin = queue && (queue.kind || queue.type);
    var title = queue && queue.title;
    var index = queue && queue.index !== undefined ? Number(queue.index) : null;
    var total = queue && queue.total !== undefined ? Number(queue.total) : null;
    var provider = sequence.provider || {};
    var result = {};
    if (!origin && sequence.kind) { origin = sequence.kind; }
    if ((!origin || !title) && source.containerOrigin) {
      origin = origin || source.containerOrigin.containerType || source.containerOrigin.kind;
      title = title || source.containerOrigin.title;
    }
    if (index === null && source.drawer && source.drawer.currentIndex !== undefined) { index = Number(source.drawer.currentIndex); }
    if (total === null && provider.knownTotal !== undefined) { total = Number(provider.knownTotal); }
    if (total === null && queue && Object.prototype.toString.call(queue.items) === '[object Array]') { total = queue.items.length; }
    if (origin) { result.origin = text(origin, 40); }
    if (title) { result.title = text(title, 100); }
    if (isFinite(index) && index >= 0) { result.index = index; }
    if (isFinite(total) && total >= 0) { result.total = total; }
    return Object.keys(result).length ? result : null;
  }

  function media(source, playback) {
    var item = source || {};
    var current = playback || {};
    var details = item.videoDetails || {};
    var audioSource = item.audioTracks && item.audioTracks.length ? item.audioTracks : current.audioTracks;
    var subtitleSource = item.subtitleTracks && item.subtitleTracks.length ? item.subtitleTracks : current.subtitleTracks;
    var audioId = selectedTrackId(current, 'audio');
    var subtitleId = selectedTrackId(current, 'subtitle');
    var audioSelected = selectedTrack(audioSource, audioId) || {};
    var subtitleSelected = selectedTrack(subtitleSource, subtitleId) || {};
    var audioValue = track(audioSelected, audioId);
    var subtitleValue = track(subtitleSelected, subtitleId);
    return {
      title: text(current.title || item.title),
      fileName: basename(current.fileName || item.fileName),
      fileSize: number(current.fileSize || item.size),
      duration: number(current.duration || item.duration),
      container: text(item.container || current.originalContainer, 40),
      resolution: text(item.resolution, 30),
      width: number(item.width || current.sourceWidth),
      height: number(item.height || current.sourceHeight),
      bitrate: number(item.bitrate),
      dynamicRange: text(item.videoDynamicRange || current.videoDynamicRange, 40),
      video: {
        codec: text(item.videoCodec || current.originalVideoCodec, 40),
        profile: text(details.profile || item.videoProfile, 60),
        level: text(details.level || item.videoLevel, 30),
        frameRate: text(details.frameRate || item.videoFrameRate, 30),
        bitDepth: text(details.bitDepth || item.videoBitDepth, 20),
        colorRange: text(details.colorRange || item.videoColorRange, 30),
        chromaSubsampling: text(details.chromaSubsampling, 30),
        codedWidth: number(details.codedWidth),
        codedHeight: number(details.codedHeight),
        bitrate: number(details.bitrate || item.bitrate),
        dynamicRange: text(item.videoDynamicRange || current.videoDynamicRange, 40)
      },
      audio: {
        language: text(audioValue.language, 60),
        languageTag: text(audioValue.languageTag, 20),
        codec: text(item.audioCodec || audioValue.codec, 40),
        format: text(audioValue.format, 40),
        channels: number(item.audioChannels || audioValue.channels),
        bitrate: number(item.audioBitrate || audioValue.bitrate),
        samplingRate: number(item.audioSamplingRate || audioValue.samplingRate),
        bitDepth: number(item.audioBitDepth || audioValue.bitDepth),
        profile: text(item.audioProfile || audioValue.profile, 50),
        channelLayout: text(item.audioChannelLayout || audioValue.channelLayout, 40),
        description: text(audioValue.description, 140),
        external: boolean(audioValue.external),
        forced: boolean(audioValue.forced),
        selected: boolean(audioValue.selected)
      },
      subtitle: {
        language: text(subtitleValue.language, 60),
        languageTag: text(subtitleValue.languageTag, 20),
        codec: text(subtitleValue.codec, 40),
        format: text(subtitleValue.format, 40),
        bitrate: number(subtitleValue.bitrate),
        offsetMs: optionalNumber(subtitleValue.offsetMs),
        description: text(subtitleValue.description, 140),
        external: boolean(subtitleValue.external),
        forced: boolean(subtitleValue.forced),
        selected: boolean(subtitleValue.selected)
      },
      audioTracks: hasTrack(audioSelected) ? [audioValue] : [],
      subtitleTracks: hasTrack(subtitleSelected) ? [subtitleValue] : []
    };
  }

  function routeClass(server, playback) {
    var addresses = server && server.addresses || [];
    var index;
    var delivery = String(playback && (playback.route || playback.connectionRoute) || '').toLowerCase();
    if (/relay/.test(delivery)) { return 'relay'; }
    for (index = 0; index < addresses.length; index += 1) {
      if (addresses[index] && addresses[index].kind === 'local') { return 'local'; }
    }
    for (index = 0; index < addresses.length; index += 1) {
      if (addresses[index] && addresses[index].kind === 'remote') { return 'remote'; }
    }
    return 'unknown';
  }

  function safeEvents(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    return source.slice(Math.max(0, source.length - MAX_EVENTS)).map(function (item) {
      var event = item || {};
      return {
        type: text(event.type || event.kind, 40),
        state: text(event.state, 40),
        detail: text(event.detail || event.message, 150),
        at: number(event.at || event.time)
      };
    });
  }

  function safeJsErrors(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    return source.slice(Math.max(0, source.length - MAX_JS_ERRORS)).map(function (item) {
      var error = item || {};
      return {
        type: text(error.type || 'error', 30),
        message: text(error.message, 180),
        source: text(error.source || error.filename, 180),
        line: number(error.line || error.lineno),
        column: number(error.column || error.colno),
        stack: text(error.stack, 220)
      };
    });
  }

  function deliveryLabel(value) {
    var raw = text(value, 50);
    var key = raw.toLowerCase().replace(/[\s_]+/g, '-');
    if (key === 'direct-play') { return 'Direct Play'; }
    if (key === 'direct-stream') { return 'Direct Stream'; }
    if (/transcod/.test(key) && /audio/.test(key) && /video/.test(key)) { return 'Transcoding (audio/video)'; }
    if (/transcod/.test(key) && /audio/.test(key)) { return 'Transcoding (audio)'; }
    if (/transcod/.test(key) && /video/.test(key)) { return 'Transcoding (video)'; }
    if (/transcod/.test(key)) { return 'Transcoding'; }
    return raw;
  }

  function playback(value, sourceLabel, error) {
    var current = value || {};
    var mediaProfile = current.mediaProfile || current.profile || current.media;
    var attempts = Object.prototype.toString.call(current.attempts) === '[object Array]' ? current.attempts : [];
    return {
      source: sourceLabel,
      media: media(mediaProfile, current),
      delivery: text(current.delivery || current.playbackMode || current.strategy, 50),
      requestedMode: text(current.requestedMode || current.requestedPlaybackMode, 40),
      strategy: text(current.strategy, 50),
      attempts: attempts.map(function (item) { return text(item, 40); }),
      fallback: text(current.fallback, 40),
      position: number(current.position),
      duration: number(current.duration || (mediaProfile && mediaProfile.duration)),
      buffered: text(current.buffered, 140),
      state: text(current.state, 40),
      buffering: boolean(current.buffering),
      nativeSeekPending: boolean(current.nativeSeekPending),
      clockRepairCount: number(current.clockRepairCount),
      nativeReadyState: optionalNumber(current.nativeReadyState),
      nativeNetworkState: optionalNumber(current.nativeNetworkState),
      nativeErrorCode: optionalNumber(current.nativeErrorCode),
      subtitleOffsetMs: optionalNumber(current.subtitleOffsetMs),
      subtitleSize: optionalNumber(current.subtitleSize),
      queue: safeQueue(current.queue),
      error: text(error)
    };
  }

  function safeServer(value, playback) {
    var source = value || {};
    return {
      name: text(source.name),
      version: text(source.version, 40),
      reachable: boolean(source.reachable),
      route: routeClass(source, playback)
    };
  }

  function safeProfile(value) {
    var source = value || {};
    return { mode: text(source.mode, 30), name: text(source.name, 80) };
  }

  function safeDevice(value) {
    var source = value || {};
    return {
      model: text(source.modelName, 80),
      webOS: text(source.webOSVersion, 30),
      viewport: text(source.viewport, 30),
      uhd: boolean(source.uhd),
      hdr10: boolean(source.hdr10),
      dolbyVision: boolean(source.dolbyVision),
      hdrKnown: boolean(source.hdrKnown)
    };
  }

  function safeNetwork(value) {
    var source = value || {};
    return {
      status: text(source.status, 20),
      lan: source.lanAvailable === true,
      internet: source.internetAvailable === true,
      type: text(source.connectionType, 30)
    };
  }

  function safeSettings(value) {
    var source = value || {};
    return {
      schemaVersion: number(source.schemaVersion || source.version),
      visualTheme: text(source.visualTheme, 30),
      playbackMode: text(source.playbackMode, 30),
      settingsBackupMode: text(source.settingsBackupMode, 20),
      adaptivePlaybackMemory: source.adaptivePlaybackMemory === true
    };
  }

  function safeCompatibility(value) {
    var source = value || {};
    return {
      schemaVersion: number(source.schemaVersion),
      ruleVersion: number(source.ruleVersion),
      updatedAt: number(source.updatedAt),
      deviceModel: text(source.deviceModel, 80),
      runtime: text(source.runtime, 120),
      appVersion: text(source.appVersion, 40),
      formatRuleCount: number(source.formatRuleCount),
      fileExceptionCount: number(source.fileExceptionCount),
      fileExceptionTtlDays: number(source.fileExceptionTtlDays)
    };
  }

  function put(target, key, value) {
    if (value !== undefined && value !== null && value !== '') { target[key] = value; }
  }

  function compactTrack(item) {
    var result = {};
    put(result, 'l', item.language);
    put(result, 'tag', item.languageTag);
    put(result, 'c', item.codec);
    put(result, 'f', item.format);
    put(result, 'ch', item.channels || 0);
    put(result, 'br', item.bitrate || 0);
    put(result, 'sr', item.samplingRate || 0);
    put(result, 'bd', item.bitDepth || 0);
    put(result, 'p', item.profile);
    put(result, 'layout', item.channelLayout);
    put(result, 'd', item.description);
    put(result, 'o', item.offsetMs);
    if (item.external) { result.external = true; }
    if (item.forced) { result.forced = true; }
    if (item.selected) { result.selected = true; }
    return result;
  }

  function compactMedia(item, trackLimit) {
    var result = {};
    var video = {};
    var audio = {};
    var subtitle = {};
    put(result, 'title', item.title);
    put(result, 'file', item.fileName);
    put(result, 'size', item.fileSize);
    put(result, 'duration', item.duration);
    put(result, 'container', item.container);
    put(result, 'resolution', item.resolution);
    put(result, 'width', item.width || 0);
    put(result, 'height', item.height || 0);
    put(result, 'bitrate', item.bitrate || 0);
    put(result, 'dynamicRange', item.dynamicRange);
    put(video, 'codec', item.video.codec);
    put(video, 'profile', item.video.profile);
    put(video, 'level', item.video.level);
    put(video, 'frameRate', item.video.frameRate);
    put(video, 'bitDepth', item.video.bitDepth);
    put(video, 'colorRange', item.video.colorRange);
    put(video, 'chroma', item.video.chromaSubsampling);
    put(video, 'codedWidth', item.video.codedWidth || 0);
    put(video, 'codedHeight', item.video.codedHeight || 0);
    put(video, 'bitrate', item.video.bitrate || 0);
    put(video, 'dynamicRange', item.video.dynamicRange);
    put(audio, 'codec', item.audio.codec);
    put(audio, 'language', item.audio.language);
    put(audio, 'tag', item.audio.languageTag);
    put(audio, 'format', item.audio.format);
    put(audio, 'channels', item.audio.channels || 0);
    put(audio, 'bitrate', item.audio.bitrate || 0);
    put(audio, 'samplingRate', item.audio.samplingRate || 0);
    put(audio, 'bitDepth', item.audio.bitDepth || 0);
    put(audio, 'profile', item.audio.profile);
    put(audio, 'channelLayout', item.audio.channelLayout);
    put(audio, 'description', item.audio.description);
    if (item.audio.external) { audio.external = true; }
    if (item.audio.forced) { audio.forced = true; }
    if (item.audio.selected) { audio.selected = true; }
    put(subtitle, 'codec', item.subtitle.codec);
    put(subtitle, 'language', item.subtitle.language);
    put(subtitle, 'tag', item.subtitle.languageTag);
    put(subtitle, 'format', item.subtitle.format);
    put(subtitle, 'bitrate', item.subtitle.bitrate || 0);
    put(subtitle, 'offset', item.subtitle.offsetMs);
    put(subtitle, 'description', item.subtitle.description);
    if (item.subtitle.external) { subtitle.external = true; }
    if (item.subtitle.forced) { subtitle.forced = true; }
    if (item.subtitle.selected) { subtitle.selected = true; }
    if (Object.keys(video).length) { result.video = video; }
    if (Object.keys(audio).length) { result.audio = audio; }
    if (Object.keys(subtitle).length) { result.subtitle = subtitle; }
    result.audioTracks = boundedTracks(item.audioTracks, trackLimit).map(compactTrack);
    result.subtitleTracks = boundedTracks(item.subtitleTracks, trackLimit).map(compactTrack);
    return result;
  }

  function boundedTracks(source, limit) {
    var values = source || [];
    var result;
    var index;
    var selectedIndex = -1;
    var maximum = limit < 0 ? values.length : Math.max(0, limit);
    if (limit < 0 || values.length <= maximum) { return values.slice(0); }
    for (index = 0; index < values.length; index += 1) {
      if (values[index] && values[index].selected) { selectedIndex = index; break; }
    }
    result = values.slice(0, maximum);
    if (selectedIndex >= maximum && maximum > 0) { result[maximum - 1] = values[selectedIndex]; }
    return result;
  }

  function payload(report, eventLimit, trackLimit, jsErrorLimit) {
    var result = { v: report.schema, app: report.appVersion, at: report.timestamp };
    var playback = report.playback;
    var mediaValue;
    var playbackValue;
    var native = {};
    var subtitles = {};
    var jsErrors = report.jsErrors || [];
    var jsMaximum = jsErrorLimit === undefined ? MAX_JS_ERRORS : Math.max(0, jsErrorLimit);
    put(result, 'server', { n: report.server.name, v: report.server.version, route: report.server.route });
    put(result, 'profile', { mode: report.profile.mode, name: report.profile.name });
    put(result, 'device', { model: report.device.model, os: report.device.webOS, view: report.device.viewport, uhd: report.device.uhd, hdr10: report.device.hdr10, dv: report.device.dolbyVision, hdrKnown: report.device.hdrKnown });
    put(result, 'network', { status: report.network.status, lan: report.network.lan, internet: report.network.internet, type: report.network.type });
    put(result, 'settings', { v: report.settings.schemaVersion, theme: report.settings.visualTheme, playback: report.settings.playbackMode, save: report.settings.settingsBackupMode, memory: report.settings.adaptivePlaybackMemory });
    put(result, 'compat', { v: report.compatibility.schemaVersion, rule: report.compatibility.ruleVersion, at: report.compatibility.updatedAt, model: report.compatibility.deviceModel, runtime: report.compatibility.runtime, app: report.compatibility.appVersion, formats: report.compatibility.formatRuleCount, files: report.compatibility.fileExceptionCount, ttl: report.compatibility.fileExceptionTtlDays });
    if (playback) {
      mediaValue = compactMedia(playback.media, trackLimit);
      playbackValue = {
        source: playback.source,
        media: mediaValue,
        delivery: playback.delivery,
        method: deliveryLabel(playback.delivery),
        requested: playback.requestedMode,
        strategy: playback.strategy,
        attempts: playback.attempts,
        fallback: playback.fallback,
        position: playback.position,
        duration: playback.duration,
        buffered: playback.buffered,
        state: playback.state,
        buffering: playback.buffering,
        seekPending: playback.nativeSeekPending,
        repairs: playback.clockRepairCount,
        error: playback.error
      };
      if (playback.queue) {
        playbackValue.queue = {
          o: playback.queue.origin,
          t: playback.queue.title,
          i: playback.queue.index,
          n: playback.queue.total
        };
      }
      put(native, 'r', playback.nativeReadyState);
      put(native, 'n', playback.nativeNetworkState);
      put(native, 'e', playback.nativeErrorCode);
      if (Object.keys(native).length) { playbackValue.native = native; }
      put(subtitles, 'o', playback.subtitleOffsetMs);
      put(subtitles, 's', playback.subtitleSize);
      if (Object.keys(subtitles).length) { playbackValue.subtitles = subtitles; }
      result.playback = playbackValue;
    }
    put(result, 'error', report.error);
    result.events = report.events.slice(Math.max(0, report.events.length - eventLimit)).map(function (item) {
      return { t: item.type, s: item.state, d: item.detail, at: item.at };
    });
    result.jsErrors = jsErrors.slice(Math.max(0, jsErrors.length - jsMaximum)).map(function (item) {
      return { t: item.type, m: item.message, s: item.source, l: item.line, c: item.column, k: item.stack };
    });
    return result;
  }

  function addLine(lines, label, value) {
    if (value !== undefined && value !== null && value !== '') { lines.push(label + ': ' + value); }
  }

  function addPart(parts, value, suffix) {
    if (value !== undefined && value !== null && value !== '' && value !== 0) { parts.push(String(value) + (suffix || '')); }
  }

  function textBody(report, eventLimit, trackLimit, jsErrorLimit) {
    var value = payload(report, eventLimit, trackLimit, jsErrorLimit);
    var lines = [];
    var playback = value.playback;
    var mediaValue = playback && playback.media;
    var format = [];
    var video = [];
    var audio = [];
    var subtitle = [];
    var queue = [];
    var native = [];
    var subtitles = [];
    var index;
    addLine(lines, 'v', value.app);
    addLine(lines, 'at', value.at);
    if (value.server) { addLine(lines, 'server', [value.server.n, value.server.v, value.server.route].filter(Boolean).join(' / ')); }
    if (value.profile) { addLine(lines, 'profile', [value.profile.mode, value.profile.name].filter(Boolean).join(' / ')); }
    if (value.device) {
      addLine(lines, 'device', [value.device.model, value.device.os, value.device.view].filter(Boolean).join(' / '));
      addLine(lines, 'caps', [value.device.uhd ? 'UHD' : '', value.device.hdr10 ? 'HDR10' : '', value.device.dv ? 'Dolby Vision' : ''].filter(Boolean).join(' / '));
    }
    if (value.network) {
      addLine(lines, 'net', [value.network.status, 'LAN ' + (value.network.lan ? 'online' : 'offline'), 'internet ' + (value.network.internet ? 'online' : 'offline'), value.network.type].filter(Boolean).join(' / '));
    }
    if (value.settings) {
      addLine(lines, 'settings', ['schema=' + value.settings.v, 'theme=' + value.settings.theme, 'playback=' + value.settings.playback, 'save=' + value.settings.save, 'memory=' + (value.settings.memory ? 'on' : 'off')].join(' / '));
    }
    if (value.compat) {
      addLine(lines, 'compat', ['schema=' + value.compat.v, 'rule=' + value.compat.rule, 'formats=' + value.compat.formats, 'files=' + value.compat.files, 'ttl=' + value.compat.ttl + 'd'].join(' / '));
    }
    if (playback) {
      addLine(lines, 'playback', playback.source);
      if (playback.queue) {
        addPart(queue, playback.queue.o);
        addPart(queue, playback.queue.t);
        if (playback.queue.i !== undefined && playback.queue.n !== undefined) { addPart(queue, (Number(playback.queue.i) + 1) + '/' + playback.queue.n); }
        else if (playback.queue.i !== undefined) { addPart(queue, Number(playback.queue.i) + 1); }
        addLine(lines, 'queue', queue.join(' / '));
      }
      if (mediaValue) {
        addLine(lines, 'media', mediaValue.title);
        addLine(lines, 'file', mediaValue.file);
        addLine(lines, 'size', mediaValue.size);
        addLine(lines, 'duration', mediaValue.duration);
        addPart(format, mediaValue.container);
        addPart(format, mediaValue.resolution);
        if (mediaValue.width && mediaValue.height) { addPart(format, mediaValue.width + 'x' + mediaValue.height); }
        addPart(format, mediaValue.bitrate, 'kbps');
        addPart(format, mediaValue.dynamicRange);
        addLine(lines, 'format', format.join(' / '));
        addPart(video, mediaValue.video.codec);
        addPart(video, mediaValue.video.profile);
        addPart(video, mediaValue.video.level);
        addPart(video, mediaValue.video.frameRate);
        addPart(video, mediaValue.video.bitDepth, 'bit');
        addPart(video, mediaValue.video.colorRange);
        addPart(video, mediaValue.video.chroma);
        if (mediaValue.video.codedWidth && mediaValue.video.codedHeight) { addPart(video, mediaValue.video.codedWidth + 'x' + mediaValue.video.codedHeight); }
        addPart(video, mediaValue.video.bitrate, 'kbps');
        addPart(video, mediaValue.video.dynamicRange);
        addLine(lines, 'video', video.join(' / '));
        addPart(audio, mediaValue.audio.language);
        addPart(audio, mediaValue.audio.codec);
        addPart(audio, mediaValue.audio.channels, 'ch');
        addPart(audio, mediaValue.audio.bitrate, 'kbps');
        addPart(audio, mediaValue.audio.samplingRate, 'Hz');
        addPart(audio, mediaValue.audio.bitDepth, 'bit');
        addPart(audio, mediaValue.audio.profile);
        addPart(audio, mediaValue.audio.channelLayout);
        addPart(audio, mediaValue.audio.description);
        if (mediaValue.audio.external) { audio.push('external'); }
        if (mediaValue.audio.forced) { audio.push('forced'); }
        addLine(lines, 'audio', audio.join(' / '));
        if (mediaValue.subtitle) {
          addPart(subtitle, mediaValue.subtitle.language);
          addPart(subtitle, mediaValue.subtitle.tag);
          addPart(subtitle, mediaValue.subtitle.codec || mediaValue.subtitle.format);
          addPart(subtitle, mediaValue.subtitle.bitrate, 'kbps');
          addPart(subtitle, mediaValue.subtitle.offsetMs, 'ms');
          addPart(subtitle, mediaValue.subtitle.description);
          if (mediaValue.subtitle.external) { subtitle.push('external'); }
          if (mediaValue.subtitle.forced) { subtitle.push('forced'); }
        }
        addLine(lines, 'subtitle', subtitle.length ? subtitle.join(' / ') : 'off');
      }
      addLine(lines, 'method', playback.method || deliveryLabel(playback.delivery));
      addLine(lines, 'delivery', playback.delivery);
      addLine(lines, 'requested', playback.requested);
      addLine(lines, 'strategy', playback.strategy);
      addLine(lines, 'attempts', playback.attempts.join(' > '));
      addLine(lines, 'fallback', playback.fallback);
      addLine(lines, 'position', playback.position + ' / ' + playback.duration);
      addLine(lines, 'buffered', playback.buffered);
      addLine(lines, 'state', playback.state);
      addLine(lines, 'buffering', playback.buffering);
      addLine(lines, 'seek', playback.seekPending);
      addLine(lines, 'repairs', playback.repairs);
      if (playback.native) {
        if (playback.native.r !== undefined) { addPart(native, 'ready=' + playback.native.r); }
        if (playback.native.n !== undefined) { addPart(native, 'network=' + playback.native.n); }
        if (playback.native.e !== undefined) { addPart(native, 'error=' + playback.native.e); }
        addLine(lines, 'native', native.join(' / '));
      }
      if (playback.subtitles) {
        if (playback.subtitles.o !== undefined) { addPart(subtitles, 'offset=' + playback.subtitles.o + 'ms'); }
        if (playback.subtitles.s !== undefined) { addPart(subtitles, 'size=' + playback.subtitles.s + '%'); }
        addLine(lines, 'sub-settings', subtitles.join(' / '));
      }
      addLine(lines, 'error', playback.error);
    }
    if (!playback || !playback.error) { addLine(lines, 'error', value.error); }
    for (index = 0; index < value.jsErrors.length; index += 1) {
      var jsError = value.jsErrors[index];
      var location = [jsError.s, jsError.l ? 'line ' + jsError.l : '', jsError.c ? 'column ' + jsError.c : ''].filter(Boolean).join(':');
      addLine(lines, 'js-error[' + (index + 1) + ']', [jsError.t, jsError.m, location].filter(Boolean).join(' / '));
      addLine(lines, 'js-stack[' + (index + 1) + ']', jsError.k);
    }
    if (!value.jsErrors.length) { addLine(lines, 'js-errors', 'none'); }
    for (index = 0; index < value.events.length; index += 1) {
      addLine(lines, 'event', [value.events[index].t, value.events[index].s, value.events[index].d].filter(Boolean).join(' / '));
    }
    return lines.join('\n');
  }

  function mailto(report, body) {
    return 'mailto:?subject=' + encodeURIComponent('Ploff support report ' + report.appVersion) + '&body=' + encodeURIComponent(body);
  }

  function body(report) {
    var attempts = [
      { events: MAX_EVENTS, tracks: -1, jsErrors: MAX_JS_ERRORS },
      { events: 10, tracks: -1, jsErrors: 8 },
      { events: 6, tracks: 8, jsErrors: 4 },
      { events: 3, tracks: 4, jsErrors: 2 },
      { events: 0, tracks: 2, jsErrors: 2 },
      { events: 0, tracks: 1, jsErrors: 1 },
      { events: 0, tracks: 0, jsErrors: 0 }
    ];
    var value = '';
    var index;
    for (index = 0; index < attempts.length; index += 1) {
      value = textBody(report, attempts[index].events, attempts[index].tracks, attempts[index].jsErrors);
      if (mailto(report, value).length <= MAX_QR_INPUT) { return value; }
    }
    return textBody(report, 0, 0, 0);
  }

  function serialize(report) {
    var attempts = [
      { events: MAX_EVENTS, tracks: -1, jsErrors: MAX_JS_ERRORS },
      { events: 10, tracks: -1, jsErrors: 8 },
      { events: 6, tracks: 4, jsErrors: 4 },
      { events: 3, tracks: 1, jsErrors: 2 },
      { events: 0, tracks: 1, jsErrors: 1 },
      { events: 0, tracks: 0, jsErrors: 0 }
    ];
    var value = '';
    var index;
    for (index = 0; index < attempts.length; index += 1) {
      value = JSON.stringify(payload(report, attempts[index].events, attempts[index].tracks, attempts[index].jsErrors));
      if (value.length <= MAX_SERIALIZED && mailto(report, value).length <= MAX_QR_INPUT) { return value; }
    }
    value = JSON.stringify(payload(report, 0, 0, 0));
    if (value.length <= MAX_SERIALIZED && mailto(report, value).length <= MAX_QR_INPUT) { return value; }
    value = JSON.stringify({
      v: report.schema,
      app: report.appVersion,
      playback: report.playback ? {
        source: report.playback.source,
        media: { title: report.playback.media.title, file: report.playback.media.fileName },
        delivery: report.playback.delivery,
        state: report.playback.state
      } : null,
      error: report.error,
      jsErrors: report.jsErrors.slice(0, 1)
    });
    if (mailto(report, value).length <= MAX_QR_INPUT) { return value; }
    return JSON.stringify({ v: report.schema, app: report.appVersion, error: text(report.error, 120) });
  }

  function create(inputs) {
    var source = inputs || {};
    var error = text(source.error);
    var selected = error && source.failurePlayback ? source.failurePlayback : source.playback;
    var sourceLabel = error && source.failurePlayback ? 'playback-error' : 'last-playback';
    var report = {
      schema: SCHEMA,
      timestamp: timestamp(source.timestamp),
      appVersion: text(source.appVersion, 40),
      server: safeServer(source.server, selected),
      profile: safeProfile(source.profile),
      device: safeDevice(source.device),
      network: safeNetwork(source.network),
      settings: safeSettings(source.settings),
      compatibility: safeCompatibility(source.compatibility),
      playback: selected ? playback(selected, sourceLabel, error) : null,
      error: error,
      events: safeEvents(source.events),
      jsErrors: safeJsErrors(source.jsErrors)
    };
    report.serialized = serialize(report);
    report.body = body(report);
    report.mailto = mailto(report, report.body);
    return report;
  }

  return {
    MAX_EVENTS: MAX_EVENTS,
    MAX_JS_ERRORS: MAX_JS_ERRORS,
    MAX_SERIALIZED: MAX_SERIALIZED,
    MAX_QR_INPUT: MAX_QR_INPUT,
    create: create,
    serialize: serialize
  };
}));
