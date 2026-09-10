(function (root, factory) {
  'use strict';
  var library = factory();
  if (typeof module === 'object' && module.exports) { module.exports = library; }
  else { root.PloffTimingProbe = library.create({ root: root }); }
}(this, function () {
  'use strict';

  function rewriteCopyts(url, mode) {
    var source = String(url || '');
    var hashIndex = source.indexOf('#');
    var hash = hashIndex >= 0 ? source.slice(hashIndex) : '';
    var withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    var queryIndex = withoutHash.indexOf('?');
    var base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    var query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
    var parts = query ? query.split('&') : [];
    var result = [];
    var found = false;
    var index;
    var key;
    mode = String(mode || '0');
    for (index = 0; index < parts.length; index += 1) {
      key = String(parts[index] || '').split('=')[0].toLowerCase();
      if (key === 'copyts') {
        found = true;
        if (mode !== 'omit') { result.push('copyts=' + (mode === '1' ? '1' : '0')); }
      } else if (parts[index] !== '') { result.push(parts[index]); }
    }
    if (!found && mode !== 'omit') { result.push('copyts=' + (mode === '1' ? '1' : '0')); }
    return base + (result.length ? '?' + result.join('&') : '') + hash;
  }

  function setQueryValue(url, keyName, value) {
    var source = String(url || '');
    var hashIndex = source.indexOf('#');
    var hash = hashIndex >= 0 ? source.slice(hashIndex) : '';
    var withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    var queryIndex = withoutHash.indexOf('?');
    var base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    var query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
    var parts = query ? query.split('&') : [];
    var result = [];
    var found = false;
    var index;
    var key;
    var encoded = encodeURIComponent(String(value || ''));
    for (index = 0; index < parts.length; index += 1) {
      key = String(parts[index] || '').split('=')[0];
      if (key.toLowerCase() === String(keyName || '').toLowerCase()) {
        result.push(key + '=' + encoded);
        found = true;
      } else if (parts[index] !== '') { result.push(parts[index]); }
    }
    if (!found) { result.push(String(keyName || '') + '=' + encoded); }
    return base + (result.length ? '?' + result.join('&') : '') + hash;
  }

  function rewriteShadowUrl(url, sessionId) {
    var result = rewriteCopyts(url, '1');
    result = setQueryValue(result, 'session', sessionId);
    result = setQueryValue(result, 'transcodeSessionId', sessionId);
    result = setQueryValue(result, 'X-Plex-Session-Identifier', sessionId);
    return result;
  }

  function classifyPayload(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
    if (!bytes.length) { return 'empty'; }
    if (bytes[0] === 0x47) { return 'mpeg-ts'; }
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) { return 'gzip'; }
    if (bytes.length >= 7 && bytes[0] === 0x23 && bytes[1] === 0x45 && bytes[2] === 0x58 && bytes[3] === 0x54 && bytes[4] === 0x4d && bytes[5] === 0x33 && bytes[6] === 0x55) { return 'playlist'; }
    if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) { return 'isobmff'; }
    if (bytes[0] === 0x7b || bytes[0] === 0x5b) { return 'json'; }
    if (bytes[0] === 0x3c) { return 'markup'; }
    return 'unknown';
  }

  function parseAttributeList(source) {
    var result = {};
    var parts = String(source || '').split(',');
    var index;
    var pair;
    var key;
    var value;
    for (index = 0; index < parts.length; index += 1) {
      pair = parts[index].split('=');
      key = String(pair.shift() || '').trim();
      value = pair.join('=').trim();
      if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') { value = value.slice(1, -1); }
      if (key) { result[key] = value; }
    }
    return result;
  }

  function parsePlaylist(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var result = {
      kind: 'unknown',
      mediaSequence: null,
      durations: [],
      discontinuities: 0,
      start: null,
      programDateTime: '',
      firstVariantUri: '',
      firstSegmentUri: '',
      segmentUris: [],
      startSegmentUri: '',
      startSegmentIndex: 0,
      startSegmentOffset: 0
    };
    var expectVariant = false;
    var expectSegment = false;
    var index;
    var line;
    var attrs;
    var value;
    for (index = 0; index < lines.length; index += 1) {
      line = String(lines[index] || '').trim();
      if (!line) { continue; }
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        result.kind = 'master';
        expectVariant = true;
        continue;
      }
      if (line.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) {
        value = Number(line.slice(22));
        result.mediaSequence = isFinite(value) ? value : null;
        continue;
      }
      if (line.indexOf('#EXT-X-START:') === 0) {
        attrs = parseAttributeList(line.slice(13));
        value = Number(attrs['TIME-OFFSET']);
        result.start = {
          timeOffset: isFinite(value) ? value : null,
          precise: String(attrs.PRECISE || '').toUpperCase() === 'YES'
        };
        continue;
      }
      if (line.indexOf('#EXT-X-PROGRAM-DATE-TIME:') === 0) {
        if (!result.programDateTime) { result.programDateTime = line.slice(25); }
        continue;
      }
      if (line === '#EXT-X-DISCONTINUITY') {
        result.discontinuities += 1;
        continue;
      }
      if (line.indexOf('#EXTINF:') === 0) {
        value = Number(line.slice(8).split(',')[0]);
        if (isFinite(value)) { result.durations.push(value); }
        if (result.kind !== 'master') { result.kind = 'media'; }
        expectSegment = true;
        continue;
      }
      if (line.charAt(0) === '#') { continue; }
      if (expectVariant && !result.firstVariantUri) {
        result.firstVariantUri = line;
        expectVariant = false;
        continue;
      }
      if (expectSegment) {
        if (!result.firstSegmentUri) { result.firstSegmentUri = line; }
        result.segmentUris.push(line);
        expectSegment = false;
      }
    }
    if (result.segmentUris.length) {
      var totalDuration = 0;
      var startOffset = 0;
      var segmentOffset = 0;
      var segmentIndex = 0;
      for (index = 0; index < result.durations.length; index += 1) { totalDuration += result.durations[index]; }
      if (result.start && isFinite(Number(result.start.timeOffset))) {
        startOffset = Number(result.start.timeOffset);
        if (startOffset < 0) { startOffset = totalDuration + startOffset; }
        if (startOffset < 0) { startOffset = 0; }
        if (startOffset > totalDuration) { startOffset = totalDuration; }
        for (index = 0; index < result.durations.length; index += 1) {
          if (startOffset < segmentOffset + result.durations[index] || index === result.durations.length - 1) {
            segmentIndex = index;
            break;
          }
          segmentOffset += result.durations[index];
        }
      }
      result.startSegmentIndex = segmentIndex;
      result.startSegmentOffset = segmentOffset;
      result.startSegmentUri = result.segmentUris[segmentIndex] || result.firstSegmentUri;
    }
    return result;
  }


  function sanitizeUrl(url) {
    var source = String(url || '').split('#')[0].split('?')[0];
    var slash = source.lastIndexOf('/');
    var name = slash >= 0 ? source.slice(slash + 1) : source;
    name = name.slice(0, 120).replace(/[^A-Za-z0-9._-]/g, '_');
    return name ? '.../' + name : '.../';
  }

  function findSyncOffset(bytes) {
    var limit = Math.min(188, bytes.length);
    var offset;
    for (offset = 0; offset < limit; offset += 1) {
      if (bytes[offset] !== 0x47) { continue; }
      if (offset + 188 < bytes.length && bytes[offset + 188] !== 0x47) { continue; }
      if (offset + 376 < bytes.length && bytes[offset + 376] !== 0x47) { continue; }
      return offset;
    }
    return -1;
  }

  function packetPayload(bytes, position) {
    var second = bytes[position + 1];
    var third = bytes[position + 2];
    var fourth = bytes[position + 3];
    var adaptationControl = (fourth >> 4) & 3;
    var payloadOffset = position + 4;
    if (bytes[position] !== 0x47 || adaptationControl === 0 || adaptationControl === 2) { return null; }
    if (adaptationControl === 3) {
      payloadOffset += 1 + Number(bytes[payloadOffset] || 0);
    }
    if (payloadOffset >= position + 188 || payloadOffset >= bytes.length) { return null; }
    return {
      pid: ((second & 0x1f) << 8) | third,
      payloadUnitStart: (second & 0x40) !== 0,
      offset: payloadOffset,
      end: Math.min(position + 188, bytes.length)
    };
  }

  function readPsiSection(bytes, syncOffset, pid, tableId, maxPackets) {
    var collected = [];
    var expectedLength = 0;
    var started = false;
    var packetCount = 0;
    var position;
    var info;
    var offset;
    var pointer;
    var index;
    for (position = syncOffset; position + 4 <= bytes.length && packetCount < maxPackets; position += 188) {
      packetCount += 1;
      info = packetPayload(bytes, position);
      if (!info || info.pid !== pid) { continue; }
      offset = info.offset;
      if (info.payloadUnitStart) {
        pointer = Number(bytes[offset] || 0);
        offset += 1 + pointer;
        if (offset >= info.end || bytes[offset] !== tableId) { continue; }
        collected = [];
        expectedLength = 0;
        started = true;
      } else if (!started) { continue; }
      for (index = offset; index < info.end; index += 1) {
        collected.push(bytes[index]);
        if (!expectedLength && collected.length >= 3) {
          expectedLength = 3 + (((collected[1] & 0x0f) << 8) | collected[2]);
        }
        if (expectedLength && collected.length >= expectedLength) {
          return collected.slice(0, expectedLength);
        }
      }
    }
    return null;
  }

  function pmtPidFromPat(section) {
    var end;
    var index;
    var program;
    if (!section || section[0] !== 0x00 || section.length < 12) { return -1; }
    end = section.length - 4;
    for (index = 8; index + 3 < end; index += 4) {
      program = (section[index] << 8) | section[index + 1];
      if (program !== 0) { return ((section[index + 2] & 0x1f) << 8) | section[index + 3]; }
    }
    return -1;
  }

  function videoStreamFromPmt(section) {
    var videoTypes = { 1: true, 2: true, 16: true, 27: true, 36: true };
    var programInfoLength;
    var end;
    var index;
    var streamType;
    var pid;
    var infoLength;
    if (!section || section[0] !== 0x02 || section.length < 16) { return null; }
    programInfoLength = ((section[10] & 0x0f) << 8) | section[11];
    index = 12 + programInfoLength;
    end = section.length - 4;
    while (index + 4 < end) {
      streamType = section[index];
      pid = ((section[index + 1] & 0x1f) << 8) | section[index + 2];
      infoLength = ((section[index + 3] & 0x0f) << 8) | section[index + 4];
      if (videoTypes[streamType]) { return { pid: pid, streamType: streamType }; }
      index += 5 + infoLength;
    }
    return null;
  }

  function decodeTimestamp(bytes, offset) {
    if (!bytes || offset < 0 || offset + 4 >= bytes.length) { return null; }
    return ((bytes[offset] & 0x0e) / 2) * 1073741824 +
      bytes[offset + 1] * 4194304 +
      ((bytes[offset + 2] & 0xfe) / 2) * 32768 +
      bytes[offset + 3] * 128 +
      ((bytes[offset + 4] & 0xfe) / 2);
  }

  function pesTiming(bytes, syncOffset, videoPid, maxPackets) {
    var packetCount = 0;
    var position;
    var info;
    var offset;
    var flags;
    var pts;
    var dts = null;
    for (position = syncOffset; position + 4 <= bytes.length && packetCount < maxPackets; position += 188) {
      packetCount += 1;
      info = packetPayload(bytes, position);
      if (!info || info.pid !== videoPid || !info.payloadUnitStart) { continue; }
      offset = info.offset;
      if (offset + 14 > info.end || bytes[offset] !== 0x00 || bytes[offset + 1] !== 0x00 || bytes[offset + 2] !== 0x01) { continue; }
      flags = (bytes[offset + 7] >> 6) & 3;
      if (flags !== 2 && flags !== 3) { continue; }
      pts = decodeTimestamp(bytes, offset + 9);
      if (pts === null) { continue; }
      if (flags === 3) { dts = decodeTimestamp(bytes, offset + 14); }
      return { pts90k: pts, dts90k: dts };
    }
    return null;
  }

  function parseTransportStreamTiming(input, options) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
    var maxPackets = Math.max(1, Number(options && options.maxPackets) || 8192);
    var syncOffset;
    var pat;
    var pmtPid;
    var pmt;
    var video;
    var timing;
    if (bytes.length < 188) { return { ok: false, reason: 'not-ts' }; }
    syncOffset = findSyncOffset(bytes);
    if (syncOffset < 0) { return { ok: false, reason: 'not-ts' }; }
    pat = readPsiSection(bytes, syncOffset, 0, 0x00, maxPackets);
    if (!pat) { return { ok: false, reason: 'no-pat' }; }
    pmtPid = pmtPidFromPat(pat);
    if (pmtPid < 0) { return { ok: false, reason: 'no-pmt-pid' }; }
    pmt = readPsiSection(bytes, syncOffset, pmtPid, 0x02, maxPackets);
    if (!pmt) { return { ok: false, reason: 'no-pmt' }; }
    video = videoStreamFromPmt(pmt);
    if (!video) { return { ok: false, reason: 'no-video-pid' }; }
    timing = pesTiming(bytes, syncOffset, video.pid, maxPackets);
    if (!timing) { return { ok: false, reason: 'no-video-pts' }; }
    return {
      ok: true,
      packetSize: 188,
      syncOffset: syncOffset,
      pmtPid: pmtPid,
      videoPid: video.pid,
      streamType: video.streamType,
      pts90k: timing.pts90k,
      dts90k: timing.dts90k,
      ptsSeconds: timing.pts90k / 90000,
      dtsSeconds: timing.dts90k === null ? null : timing.dts90k / 90000
    };
  }

  function isUniversalControlUrl(url) {
    return /\/video\/:\/transcode\/universal\/(?:start\.m3u8|decision)(?:\?|$)/.test(String(url || ''));
  }

  function resolveUrl(baseUrl, relativeUrl) {
    var base = String(baseUrl || '');
    var relative = String(relativeUrl || '');
    var match;
    var scheme;
    var host;
    var path;
    var query = '';
    var hash = '';
    var queryIndex;
    var hashIndex;
    var directory;
    var parts;
    var normalized = [];
    var index;
    if (!relative) { return base; }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(relative)) { return relative; }
    match = /^([A-Za-z][A-Za-z0-9+.-]*:)?\/\/([^/]+)(\/[^?#]*)?/.exec(base);
    if (!match) { return relative; }
    scheme = match[1] || '';
    host = match[2];
    path = match[3] || '/';
    if (relative.indexOf('//') === 0) { return scheme + relative; }
    hashIndex = relative.indexOf('#');
    if (hashIndex >= 0) {
      hash = relative.slice(hashIndex);
      relative = relative.slice(0, hashIndex);
    }
    queryIndex = relative.indexOf('?');
    if (queryIndex >= 0) {
      query = relative.slice(queryIndex);
      relative = relative.slice(0, queryIndex);
    }
    if (relative.charAt(0) === '/') { path = relative; }
    else {
      directory = path.slice(0, path.lastIndexOf('/') + 1);
      path = directory + relative;
    }
    parts = path.split('/');
    for (index = 0; index < parts.length; index += 1) {
      if (!parts[index] || parts[index] === '.') { continue; }
      if (parts[index] === '..') { if (normalized.length) { normalized.pop(); } }
      else { normalized.push(parts[index]); }
    }
    return scheme + '//' + host + '/' + normalized.join('/') + query + hash;
  }

  function rangeSnapshot(ranges, maxRanges) {
    var result = [];
    var count;
    var index;
    var start;
    var end;
    if (!ranges || typeof ranges.length !== 'number') { return result; }
    count = Math.min(Number(ranges.length) || 0, maxRanges);
    for (index = 0; index < count; index += 1) {
      try {
        start = Number(ranges.start(index));
        end = Number(ranges.end(index));
        if (isFinite(start) && isFinite(end)) { result.push([start, end]); }
      } catch (ignore) {}
    }
    return result;
  }

  function playlistSummary(parsed, url) {
    if (!parsed) { return null; }
    return {
      kind: parsed.kind,
      uri: sanitizeUrl(url),
      mediaSequence: parsed.mediaSequence,
      durations: parsed.durations.slice(0, 32),
      discontinuities: parsed.discontinuities,
      start: parsed.start ? { timeOffset: parsed.start.timeOffset, precise: parsed.start.precise } : null,
      programDateTime: String(parsed.programDateTime || '').slice(0, 80),
      firstVariantUri: parsed.firstVariantUri ? sanitizeUrl(parsed.firstVariantUri) : '',
      firstSegmentUri: parsed.firstSegmentUri ? sanitizeUrl(parsed.firstSegmentUri) : ''
    };
  }

  function create(options) {
    var values = options || {};
    var root = values.root || {};
    var now = typeof values.now === 'function' ? values.now : function () {
      if (root.performance && typeof root.performance.now === 'function') { return root.performance.now(); }
      return Date.now();
    };
    var wallNow = typeof values.wallNow === 'function' ? values.wallNow : function () { return Date.now(); };
    var MAX_TIMEUPDATES = 8;
    var MAX_EVENT_SAMPLES = 4;
    var MAX_RANGES = 8;
    var MAX_SEGMENT_BYTES = 1048576;
    var MAX_SEGMENT_ATTEMPTS = 4;
    var MAX_CALIBRATION_ATTEMPTS = 4;
    var REQUEST_TIMEOUT_MS = 7000;
    var active = false;
    var mode = '0';
    var client = null;
    var debugCapture = null;
    var Xhr = null;
    var originalPrepare = null;
    var originalOpen = null;
    var originalRecord = null;
    var prepareWrapper = null;
    var openWrapper = null;
    var recordWrapper = null;
    var startedAt = null;
    var stoppedAt = null;
    var startedMonotonic = 0;
    var sources = [];
    var probedSources = {};
    var preparedSources = [];
    var lastPrepareEvent = null;
    var currentSource = null;
    var video = null;
    var mediaListeners = [];
    var pendingRequests = [];
    var runGeneration = 0;
    var shadowSessionCounter = 0;
    var requestText = typeof values.requestText === 'function' ? values.requestText : defaultRequestText;
    var requestBytes = typeof values.requestBytes === 'function' ? values.requestBytes : defaultRequestBytes;

    function elapsed() {
      var value = Number(now()) - startedMonotonic;
      return isFinite(value) ? value : 0;
    }

    function addRequest(handle) {
      if (handle && typeof handle.abort === 'function') { pendingRequests.push(handle); }
      return handle;
    }

    function removeRequest(handle) {
      var index = pendingRequests.indexOf(handle);
      if (index >= 0) { pendingRequests.splice(index, 1); }
    }

    function defaultRequestText(url, callback) {
      var xhr = new root.XMLHttpRequest();
      var finished = false;
      function done(error, text, status) {
        if (finished) { return; }
        finished = true;
        callback(error, text, status);
      }
      try {
        xhr.open('GET', url, true);
        xhr.timeout = REQUEST_TIMEOUT_MS;
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          if (xhr.status >= 200 && xhr.status < 300) { done(null, String(xhr.responseText || ''), xhr.status); }
          else { done('playlist-http', '', Number(xhr.status) || 0); }
        };
        xhr.onerror = function () { done('playlist-network', '', Number(xhr.status) || 0); };
        xhr.ontimeout = function () { done('playlist-timeout', '', Number(xhr.status) || 0); };
        xhr.send();
      } catch (error) { done('playlist-request', '', 0); }
      return { abort: function () { try { xhr.abort(); } catch (ignore) {} } };
    }

    function defaultRequestBytes(url, callback) {
      var xhr = new root.XMLHttpRequest();
      var finished = false;
      function done(error, bytes, status, metadata) {
        if (finished) { return; }
        finished = true;
        callback(error, bytes, status, metadata || {});
      }
      try {
        xhr.open('GET', url, true);
        xhr.timeout = REQUEST_TIMEOUT_MS;
        xhr.responseType = 'arraybuffer';
        try { xhr.setRequestHeader('Range', 'bytes=0-' + (MAX_SEGMENT_BYTES - 1)); } catch (ignoreHeader) {}
        xhr.onprogress = function (event) {
          if (event && event.loaded > MAX_SEGMENT_BYTES) {
            try { xhr.abort(); } catch (ignoreAbort) {}
            done('segment-too-large', null, Number(xhr.status) || 0);
          }
        };
        xhr.onreadystatechange = function () {
          var response;
          var metadata = {};
          if (xhr.readyState !== 4 || finished) { return; }
          if (xhr.status === 200 || xhr.status === 206) {
            response = xhr.response;
            metadata.byteLength = response ? Number(response.byteLength || 0) : 0;
            try { metadata.contentType = String(xhr.getResponseHeader && xhr.getResponseHeader('Content-Type') || '').slice(0, 80); } catch (ignoreType) {}
            try { metadata.contentEncoding = String(xhr.getResponseHeader && xhr.getResponseHeader('Content-Encoding') || '').slice(0, 40); } catch (ignoreEncoding) {}
            try { metadata.responseUri = xhr.responseURL ? sanitizeUrl(xhr.responseURL) : ''; } catch (ignoreUrl) {}
            if (!response || Number(response.byteLength || 0) > MAX_SEGMENT_BYTES) { done('segment-too-large', null, xhr.status, metadata); }
            else { done(null, response, xhr.status, metadata); }
          } else { done('segment-http', null, Number(xhr.status) || 0, metadata); }
        };
        xhr.onerror = function () { done('segment-network', null, Number(xhr.status) || 0); };
        xhr.ontimeout = function () { done('segment-timeout', null, Number(xhr.status) || 0); };
        xhr.send();
      } catch (error) { done('segment-request', null, 0); }
      return { abort: function () { try { xhr.abort(); } catch (ignore) {} } };
    }

    function ensureVideo() {
      var candidate;
      var index;
      var eventNames = ['loadedmetadata', 'durationchange', 'canplay', 'playing', 'timeupdate', 'waiting', 'stalled'];
      if (video) { return video; }
      if (!root.document || typeof root.document.querySelector !== 'function') { return null; }
      candidate = root.document.querySelector('video');
      if (!candidate || typeof candidate.addEventListener !== 'function') { return null; }
      video = candidate;
      for (index = 0; index < eventNames.length; index += 1) {
        (function (eventName) {
          var listener = function () { sampleMedia(eventName); };
          video.addEventListener(eventName, listener, false);
          mediaListeners.push({ name: eventName, listener: listener });
        }(eventNames[index]));
      }
      return video;
    }

    function detachVideo() {
      var index;
      if (video && typeof video.removeEventListener === 'function') {
        for (index = 0; index < mediaListeners.length; index += 1) {
          try { video.removeEventListener(mediaListeners[index].name, mediaListeners[index].listener, false); } catch (ignore) {}
        }
      }
      mediaListeners = [];
      video = null;
    }

    function snapshotMedia(eventName) {
      var item;
      if (!video) { return null; }
      item = {
        event: eventName,
        atMs: elapsed(),
        currentTime: Number(video.currentTime) || 0,
        duration: isFinite(Number(video.duration)) ? Number(video.duration) : null,
        readyState: Number(video.readyState) || 0,
        networkState: Number(video.networkState) || 0,
        playbackRate: isFinite(Number(video.playbackRate)) ? Number(video.playbackRate) : 1,
        paused: !!video.paused,
        seekable: rangeSnapshot(video.seekable, MAX_RANGES),
        buffered: rangeSnapshot(video.buffered, MAX_RANGES),
        played: rangeSnapshot(video.played, MAX_RANGES)
      };
      if (isFinite(Number(video.webkitDecodedFrameCount))) { item.decodedFrames = Number(video.webkitDecodedFrameCount); }
      else if (isFinite(Number(video.mozDecodedFrames))) { item.decodedFrames = Number(video.mozDecodedFrames); }
      if (isFinite(Number(video.webkitDroppedFrameCount))) { item.droppedFrames = Number(video.webkitDroppedFrameCount); }
      else if (isFinite(Number(video.mozDroppedFrames))) { item.droppedFrames = Number(video.mozDroppedFrames); }
      return item;
    }

    function isCurrentProbe(source) { return !!(active && source && source._runGeneration === runGeneration); }

    function updateCalibratedDeltas(source) {
      var timing;
      var transportOffset;
      if (!source || !source.segment || !source.segment.timing || !source.segment.timing.ok ||
          !source.calibration || !source.calibration.timing || !source.calibration.timing.ok) { return; }
      timing = source.segment.timing;
      transportOffset = Number(source.calibration.transportDtsOffset);
      if (!isFinite(transportOffset)) { return; }
      source.segment.calibratedPtsSeconds = timing.ptsSeconds - transportOffset;
      if (isFinite(Number(timing.dtsSeconds))) {
        source.segment.calibratedDtsSeconds = timing.dtsSeconds - transportOffset;
        if (isFinite(Number(source.segment.segmentStartOffset))) {
          source.segment.selectedTransportDtsOffset = timing.dtsSeconds - source.segment.segmentStartOffset;
          source.segment.transportDtsDrift = source.segment.selectedTransportDtsOffset - transportOffset;
        }
      }
      if (isFinite(Number(source.target))) { source.segment.calibratedPtsMinusTarget = source.segment.calibratedPtsSeconds - source.target; }
      if (source._firstAdvance) {
        source.segment.calibratedPtsMinusPloffAtFirstAdvance = source.segment.calibratedPtsSeconds - (source.offsetBase + source._firstAdvance.currentTime);
      }
    }

    function updateFirstAdvanceDeltas(source) {
      var timing;
      if (!source || !source._firstAdvance || !source.segment || !source.segment.timing || !source.segment.timing.ok) { return; }
      timing = source.segment.timing;
      source.segment.firstAdvanceCurrentTime = source._firstAdvance.currentTime;
      source.segment.ploffAbsoluteAtFirstAdvance = source.offsetBase + source._firstAdvance.currentTime;
      source.segment.ptsMinusPloffAtFirstAdvance = timing.ptsSeconds - source.segment.ploffAbsoluteAtFirstAdvance;
      updateCalibratedDeltas(source);
    }

    function segmentOffsetAt(media, segmentIndex) {
      var offset = 0;
      var index;
      for (index = 0; index < segmentIndex && index < media.durations.length; index += 1) { offset += Number(media.durations[index]) || 0; }
      return offset;
    }

    function completeCalibration(source, timing, segmentIndex, segmentStartOffset, segmentUrl, metadata, status) {
      var baseTimestamp;
      if (!source || !timing || !timing.ok) { return; }
      source.calibration.timing = timing;
      source.calibration.error = '';
      source.calibration.httpStatus = Number(status) || 0;
      source.calibration.segmentIndex = segmentIndex;
      source.calibration.segmentStartOffset = segmentStartOffset;
      source.calibration.uri = sanitizeUrl(segmentUrl);
      source.calibration.byteLength = metadata && isFinite(Number(metadata.byteLength)) ? Number(metadata.byteLength) : null;
      source.calibration.contentType = String(metadata && metadata.contentType || '').slice(0, 80);
      baseTimestamp = isFinite(Number(timing.dtsSeconds)) ? Number(timing.dtsSeconds) : Number(timing.ptsSeconds);
      source.calibration.transportDtsOffset = baseTimestamp - segmentStartOffset;
      source.calibration.transportPtsOffset = Number(timing.ptsSeconds) - segmentStartOffset;
      source._calibrationComplete = true;
      updateCalibratedDeltas(source);
    }

    function attemptCalibrationProbe(source) {
      var media;
      var mediaUrl;
      var segmentIndex;
      var segmentUrl;
      var segmentStartOffset;
      var requestHandle = null;
      var completed = false;
      if (!source || source._calibrationComplete || source._calibrationInFlight || mode !== 'shadow1' ||
          source.calibration.attemptCount >= MAX_CALIBRATION_ATTEMPTS) { return; }
      media = source._calibrationMedia;
      mediaUrl = source._calibrationMediaUrl;
      segmentIndex = source._calibrationNextIndex;
      if (!media || !media.segmentUris || segmentIndex >= media.segmentUris.length || segmentIndex >= source.segment.segmentIndex) { return; }
      segmentUrl = resolveUrl(mediaUrl, media.segmentUris[segmentIndex]);
      segmentStartOffset = segmentOffsetAt(media, segmentIndex);
      source.calibration.attemptCount += 1;
      source._calibrationInFlight = true;
      requestHandle = requestBytes(segmentUrl, function (error, bytes, status, metadata) {
        var timing;
        var payload;
        completed = true;
        if (!isCurrentProbe(source)) { return; }
        source._calibrationInFlight = false;
        if (requestHandle) { removeRequest(requestHandle); }
        metadata = metadata || {};
        payload = bytes ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : new Uint8Array(0);
        source.calibration.httpStatus = Number(status) || 0;
        source.calibration.payloadKind = classifyPayload(payload);
        source.calibration.byteLength = isFinite(Number(metadata.byteLength)) ? Number(metadata.byteLength) : payload.length;
        source.calibration.contentType = String(metadata.contentType || '').slice(0, 80);
        source.calibration.segmentIndex = segmentIndex;
        source.calibration.segmentStartOffset = segmentStartOffset;
        source.calibration.uri = sanitizeUrl(segmentUrl);
        if (!error) {
          timing = parseTransportStreamTiming(bytes, { maxPackets: 8192 });
          if (timing.ok) {
            completeCalibration(source, timing, segmentIndex, segmentStartOffset, segmentUrl, metadata, status);
            return;
          }
          source.calibration.error = timing.reason;
        } else { source.calibration.error = String(error).slice(0, 80); }
        source._calibrationNextIndex = segmentIndex + 1;
        attemptCalibrationProbe(source);
      });
      if (!completed) { addRequest(requestHandle); }
    }

    function startCalibrationProbe(source, mediaUrl, media) {
      if (!source || mode !== 'shadow1' || !media || !media.segmentUris || !media.segmentUris.length) { return; }
      if (source.segment.segmentIndex === 0) { return; }
      source._calibrationMedia = media;
      source._calibrationMediaUrl = mediaUrl;
      source._calibrationNextIndex = 0;
      attemptCalibrationProbe(source);
    }

    function sampleMedia(eventName) {
      var source = currentSource;
      var item;
      var count;
      if (!active || !source) { return; }
      if (!video && !ensureVideo()) { return; }
      item = snapshotMedia(eventName);
      if (!item) { return; }
      if (!source._firstAdvance && item.currentTime > source._baselineCurrentTime + 0.01) {
        source._firstAdvance = snapshotMedia('first-advance');
        source.mediaEvents.push(source._firstAdvance);
        updateFirstAdvanceDeltas(source);
      }
      if (eventName === 'canplay' || eventName === 'playing' || eventName === 'timeupdate') { retrySegmentProbe(source); }
      if (eventName === 'timeupdate') {
        if (source._timeupdateCount >= MAX_TIMEUPDATES) { return; }
        source._timeupdateCount += 1;
      } else {
        count = source._eventCounts[eventName] || 0;
        if (count >= MAX_EVENT_SAMPLES) { return; }
        source._eventCounts[eventName] = count + 1;
      }
      source.mediaEvents.push(item);
    }

    function attemptSegmentProbe(source) {
      var requestHandle = null;
      var completed = false;
      if (!source || !source._segmentUrl || source._segmentProbeComplete || source._segmentProbeInFlight ||
          source.segment.attemptCount >= MAX_SEGMENT_ATTEMPTS) { return; }
      source.segment.attemptCount += 1;
      source._segmentProbeInFlight = true;
      requestHandle = requestBytes(source._segmentUrl, function (error, bytes, status, metadata) {
        var timing;
        var payload;
        completed = true;
        if (!isCurrentProbe(source)) { return; }
        source._segmentProbeInFlight = false;
        if (requestHandle) { removeRequest(requestHandle); }
        source.segment.httpStatus = Number(status) || 0;
        metadata = metadata || {};
        payload = bytes ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : new Uint8Array(0);
        source.segment.byteLength = isFinite(Number(metadata.byteLength)) ? Number(metadata.byteLength) : payload.length;
        source.segment.contentType = String(metadata.contentType || '').slice(0, 80);
        source.segment.contentEncoding = String(metadata.contentEncoding || '').slice(0, 40);
        source.segment.responseUri = String(metadata.responseUri || '').slice(0, 140);
        source.segment.payloadKind = classifyPayload(payload);
        if (error) {
          source.segment.error = String(error).slice(0, 80);
          return;
        }
        timing = parseTransportStreamTiming(bytes, { maxPackets: 8192 });
        source.segment.timing = timing;
        if (!timing.ok) {
          source.segment.error = timing.reason;
          return;
        }
        source.segment.error = '';
        source._segmentProbeComplete = true;
        if (isFinite(source.target)) { source.segment.ptsMinusTarget = timing.ptsSeconds - source.target; }
        if (isFinite(source.offsetBase)) { source.segment.ptsMinusOffsetBase = timing.ptsSeconds - source.offsetBase; }
        if (mode === 'shadow1' && source.segment.segmentIndex === 0 && !source._calibrationComplete) {
          completeCalibration(source, timing, 0, 0, source._segmentUrl, metadata, status);
        }
        updateFirstAdvanceDeltas(source);
        updateCalibratedDeltas(source);
      });
      if (!completed) { addRequest(requestHandle); }
    }

    function retrySegmentProbe(source) {
      if (!source || !source._segmentUrl || source._segmentProbeComplete || source._segmentProbeInFlight ||
          source.segment.attemptCount >= MAX_SEGMENT_ATTEMPTS) { return; }
      attemptSegmentProbe(source);
    }

    function probeSegment(source, mediaUrl, media) {
      var segmentUri = media.startSegmentUri || media.firstSegmentUri;
      if (!segmentUri) {
        source.segment.error = 'no-segment-uri';
        return;
      }
      source.segment.playlistStartOffset = media.start && isFinite(Number(media.start.timeOffset)) ? Number(media.start.timeOffset) : null;
      source.segment.segmentStartOffset = isFinite(Number(media.startSegmentOffset)) ? Number(media.startSegmentOffset) : 0;
      source.segment.segmentIndex = isFinite(Number(media.startSegmentIndex)) ? Number(media.startSegmentIndex) : 0;
      source._segmentUrl = resolveUrl(mediaUrl, segmentUri);
      source.segment.uri = sanitizeUrl(source._segmentUrl);
      attemptSegmentProbe(source);
      startCalibrationProbe(source, mediaUrl, media);
    }

    function processMediaPlaylist(source, mediaUrl, media) {
      source.playlist.media = playlistSummary(media, mediaUrl);
      probeSegment(source, mediaUrl, media);
    }

    function probeHls(source, sourceUrl) {
      var firstHandle = null;
      firstHandle = requestText(sourceUrl, function (error, text, status) {
        var parsed;
        var mediaUrl;
        var secondHandle = null;
        if (!isCurrentProbe(source)) { return; }
        if (firstHandle) { removeRequest(firstHandle); }
        source.playlist.masterHttpStatus = Number(status) || 0;
        if (error) {
          source.playlist.error = String(error).slice(0, 80);
          return;
        }
        parsed = parsePlaylist(text);
        if (parsed.kind === 'master') {
          source.playlist.master = playlistSummary(parsed, sourceUrl);
          if (!parsed.firstVariantUri) {
            source.playlist.error = 'no-media-playlist';
            return;
          }
          mediaUrl = resolveUrl(sourceUrl, parsed.firstVariantUri);
          secondHandle = requestText(mediaUrl, function (mediaError, mediaText, mediaStatus) {
            var media;
            if (!isCurrentProbe(source)) { return; }
            if (secondHandle) { removeRequest(secondHandle); }
            source.playlist.mediaHttpStatus = Number(mediaStatus) || 0;
            if (mediaError) {
              source.playlist.error = String(mediaError).slice(0, 80);
              return;
            }
            media = parsePlaylist(mediaText);
            if (media.kind !== 'media') {
              source.playlist.error = 'not-media-playlist';
              return;
            }
            processMediaPlaylist(source, mediaUrl, media);
          });
          addRequest(secondHandle);
        } else if (parsed.kind === 'media') {
          processMediaPlaylist(source, sourceUrl, parsed);
        } else { source.playlist.error = 'unknown-playlist'; }
      });
      addRequest(firstHandle);
    }

    function preparedForApplied(payload) {
      var index;
      var delivery = String(payload && payload.delivery || '');
      for (index = preparedSources.length - 1; index >= 0; index -= 1) {
        if (!delivery || preparedSources[index].delivery === delivery) {
          return preparedSources.splice(index, 1)[0];
        }
      }
      return preparedSources.length ? preparedSources.pop() : null;
    }

    function numeric(value, fallback) {
      value = Number(value);
      return isFinite(value) ? value : fallback;
    }

    function appliedSource(payload) {
      var playbackGeneration = numeric(payload && payload.playbackGeneration, 0);
      var sourceGeneration = numeric(payload && payload.sourceGeneration, 0);
      var key = playbackGeneration + ':' + sourceGeneration;
      var prepared;
      var target;
      var source;
      if (!active || probedSources[key]) { return; }
      probedSources[key] = true;
      prepared = preparedForApplied(payload);
      if (!prepared || !isUniversalControlUrl(prepared.url)) { return; }
      target = numeric(payload && payload.recoveryTarget, null);
      if (target === null && lastPrepareEvent) { target = numeric(lastPrepareEvent.recoveryTarget, null); }
      if (target === null) { target = numeric(prepared.plexOffset, 0); }
      ensureVideo();
      source = {
        playbackGeneration: playbackGeneration,
        sourceGeneration: sourceGeneration,
        recoveryGeneration: numeric(payload && payload.recoveryGeneration, 0),
        target: target,
        plexOffset: numeric(prepared.plexOffset, 0),
        offsetBase: numeric(payload && payload.offsetBase, 0),
        delivery: String(payload && payload.delivery || prepared.delivery || ''),
        action: String(payload && payload.action || ''),
        copytsMode: mode,
        probeCopytsMode: mode === 'shadow1' ? '1' : mode,
        playbackCopytsMode: mode === 'shadow1' ? '0' : mode,
        sourceAppliedAtMs: elapsed(),
        sourceUri: sanitizeUrl(prepared.url),
        probeUri: sanitizeUrl(prepared.probeUrl || prepared.url),
        playlist: { master: null, media: null, error: '' },
        segment: { uri: '', timing: null, error: '', attemptCount: 0 },
        calibration: { uri: '', timing: null, error: '', attemptCount: 0 },
        mediaEvents: [],
        _baselineCurrentTime: video ? numeric(video.currentTime, 0) : 0,
        _firstAdvance: null,
        _timeupdateCount: 0,
        _eventCounts: {},
        _segmentUrl: '',
        _segmentProbeInFlight: false,
        _segmentProbeComplete: false,
        _calibrationMedia: null,
        _calibrationMediaUrl: '',
        _calibrationNextIndex: 0,
        _calibrationInFlight: false,
        _calibrationComplete: false,
        _runGeneration: runGeneration
      };
      sources.push(source);
      currentSource = source;
      if (video) { source.mediaEvents.push(snapshotMedia('source-applied')); }
      probeHls(source, prepared.probeUrl || prepared.url);
    }

    function rememberPrepare(payload) {
      lastPrepareEvent = {
        playbackGeneration: numeric(payload && payload.playbackGeneration, 0),
        sourceGeneration: numeric(payload && payload.sourceGeneration, 0),
        recoveryGeneration: numeric(payload && payload.recoveryGeneration, 0),
        recoveryTarget: numeric(payload && payload.recoveryTarget, null),
        offsetBase: numeric(payload && payload.offsetBase, 0),
        delivery: String(payload && payload.delivery || '')
      };
    }

    function start(copytsMode) {
      var selected = String(copytsMode || '0');
      if (selected !== '0' && selected !== '1' && selected !== 'omit' && selected !== 'shadow1') { return false; }
      if (active) { return false; }
      client = root.PloffClient;
      debugCapture = root.PloffDebugCapture;
      Xhr = root.XMLHttpRequest;
      if (!client || typeof client.preparePlayback !== 'function' || !debugCapture ||
          typeof debugCapture.isActive !== 'function' || !debugCapture.isActive() ||
          !Xhr || !Xhr.prototype || typeof Xhr.prototype.open !== 'function' ||
          typeof debugCapture.record !== 'function') { return false; }
      mode = selected;
      runGeneration += 1;
      shadowSessionCounter = 0;
      sources = [];
      probedSources = {};
      preparedSources = [];
      pendingRequests = [];
      lastPrepareEvent = null;
      currentSource = null;
      startedAt = Number(wallNow()) || null;
      stoppedAt = null;
      startedMonotonic = Number(now()) || 0;
      originalPrepare = client.preparePlayback;
      originalOpen = Xhr.prototype.open;
      originalRecord = debugCapture.record;
      prepareWrapper = function (config, playback, playbackOptions, callback) {
        return originalPrepare.call(client, config, playback, playbackOptions, function (error, sourceUrl, playbackMode) {
          var rewritten = sourceUrl;
          var probeUrl = sourceUrl;
          var offset;
          var delivery;
          var shadowSessionId;
          if (!error && isUniversalControlUrl(sourceUrl)) {
            if (mode === 'shadow1') {
              shadowSessionCounter += 1;
              shadowSessionId = 'ploff-probe-e-' + String(Number(wallNow()) || 0) + '-' + String(shadowSessionCounter);
              probeUrl = rewriteShadowUrl(sourceUrl, shadowSessionId);
            } else {
              rewritten = rewriteCopyts(sourceUrl, mode);
              probeUrl = rewritten;
            }
            offset = numeric(playbackOptions && playbackOptions.offset, 0);
            delivery = String(playbackOptions && playbackOptions.delivery || playbackMode || 'direct-stream');
            preparedSources.push({ url: rewritten, probeUrl: probeUrl, plexOffset: offset, delivery: delivery });
            if (preparedSources.length > 12) { preparedSources.shift(); }
            if (playback) {
              playback.sourceUrl = rewritten;
              playback.hlsUrl = rewritten;
            }
          }
          callback(error, rewritten, playbackMode);
        });
      };
      openWrapper = function (method, url) {
        var args = Array.prototype.slice.call(arguments);
        if (mode !== 'shadow1' && isUniversalControlUrl(url)) { args[1] = rewriteCopyts(url, mode); }
        return originalOpen.apply(this, args);
      };
      recordWrapper = function (category, event, payload) {
        var result = originalRecord.apply(debugCapture, arguments);
        try {
          if (category === 'playback' && event === 'source-prepare-start') { rememberPrepare(payload); }
          else if (category === 'playback' && event === 'source-applied') { appliedSource(payload); }
        } catch (ignoreProbe) {}
        return result;
      };
      client.preparePlayback = prepareWrapper;
      Xhr.prototype.open = openWrapper;
      debugCapture.record = recordWrapper;
      active = true;
      ensureVideo();
      return true;
    }

    function abortRequests() {
      var handles = pendingRequests.slice(0);
      var index;
      pendingRequests = [];
      for (index = 0; index < handles.length; index += 1) {
        try { handles[index].abort(); } catch (ignore) {}
      }
    }

    function stop() {
      if (!active) { return false; }
      if (client && client.preparePlayback === prepareWrapper) { client.preparePlayback = originalPrepare; }
      if (Xhr && Xhr.prototype && Xhr.prototype.open === openWrapper) { Xhr.prototype.open = originalOpen; }
      if (debugCapture && debugCapture.record === recordWrapper) { debugCapture.record = originalRecord; }
      abortRequests();
      detachVideo();
      stoppedAt = Number(wallNow()) || null;
      active = false;
      currentSource = null;
      preparedSources = [];
      return true;
    }

    function projectTiming(timing) {
      if (!timing) { return null; }
      return {
        ok: !!timing.ok,
        reason: String(timing.reason || ''),
        packetSize: timing.packetSize || null,
        syncOffset: timing.syncOffset === undefined ? null : timing.syncOffset,
        pmtPid: timing.pmtPid === undefined ? null : timing.pmtPid,
        videoPid: timing.videoPid === undefined ? null : timing.videoPid,
        streamType: timing.streamType === undefined ? null : timing.streamType,
        pts90k: timing.pts90k === undefined ? null : timing.pts90k,
        dts90k: timing.dts90k === undefined ? null : timing.dts90k,
        ptsSeconds: timing.ptsSeconds === undefined ? null : timing.ptsSeconds,
        dtsSeconds: timing.dtsSeconds === undefined ? null : timing.dtsSeconds
      };
    }

    function cloneMediaEvent(item) {
      var result = {
        event: item.event,
        atMs: item.atMs,
        currentTime: item.currentTime,
        duration: item.duration,
        readyState: item.readyState,
        networkState: item.networkState,
        playbackRate: item.playbackRate,
        paused: item.paused,
        seekable: item.seekable.slice(0),
        buffered: item.buffered.slice(0),
        played: item.played.slice(0)
      };
      if (item.decodedFrames !== undefined) { result.decodedFrames = item.decodedFrames; }
      if (item.droppedFrames !== undefined) { result.droppedFrames = item.droppedFrames; }
      return result;
    }

    function projectSource(source) {
      var playlist = {
        master: source.playlist.master,
        media: source.playlist.media,
        error: source.playlist.error || '',
        masterHttpStatus: source.playlist.masterHttpStatus || 0,
        mediaHttpStatus: source.playlist.mediaHttpStatus || 0
      };
      var segment = {
        uri: source.segment.uri,
        timing: projectTiming(source.segment.timing),
        error: source.segment.error || '',
        httpStatus: source.segment.httpStatus || 0,
        payloadKind: source.segment.payloadKind || '',
        byteLength: source.segment.byteLength === undefined ? null : source.segment.byteLength,
        contentType: source.segment.contentType || '',
        contentEncoding: source.segment.contentEncoding || '',
        responseUri: source.segment.responseUri || '',
        attemptCount: source.segment.attemptCount || 0,
        playlistStartOffset: source.segment.playlistStartOffset === undefined ? null : source.segment.playlistStartOffset,
        segmentStartOffset: source.segment.segmentStartOffset === undefined ? null : source.segment.segmentStartOffset,
        segmentIndex: source.segment.segmentIndex === undefined ? null : source.segment.segmentIndex,
        ptsMinusTarget: source.segment.ptsMinusTarget === undefined ? null : source.segment.ptsMinusTarget,
        ptsMinusOffsetBase: source.segment.ptsMinusOffsetBase === undefined ? null : source.segment.ptsMinusOffsetBase,
        firstAdvanceCurrentTime: source.segment.firstAdvanceCurrentTime === undefined ? null : source.segment.firstAdvanceCurrentTime,
        ploffAbsoluteAtFirstAdvance: source.segment.ploffAbsoluteAtFirstAdvance === undefined ? null : source.segment.ploffAbsoluteAtFirstAdvance,
        ptsMinusPloffAtFirstAdvance: source.segment.ptsMinusPloffAtFirstAdvance === undefined ? null : source.segment.ptsMinusPloffAtFirstAdvance,
        calibratedPtsSeconds: source.segment.calibratedPtsSeconds === undefined ? null : source.segment.calibratedPtsSeconds,
        calibratedDtsSeconds: source.segment.calibratedDtsSeconds === undefined ? null : source.segment.calibratedDtsSeconds,
        calibratedPtsMinusTarget: source.segment.calibratedPtsMinusTarget === undefined ? null : source.segment.calibratedPtsMinusTarget,
        calibratedPtsMinusPloffAtFirstAdvance: source.segment.calibratedPtsMinusPloffAtFirstAdvance === undefined ? null : source.segment.calibratedPtsMinusPloffAtFirstAdvance,
        selectedTransportDtsOffset: source.segment.selectedTransportDtsOffset === undefined ? null : source.segment.selectedTransportDtsOffset,
        transportDtsDrift: source.segment.transportDtsDrift === undefined ? null : source.segment.transportDtsDrift
      };
      var calibration = {
        uri: source.calibration.uri || '',
        timing: projectTiming(source.calibration.timing),
        error: source.calibration.error || '',
        httpStatus: source.calibration.httpStatus || 0,
        payloadKind: source.calibration.payloadKind || '',
        byteLength: source.calibration.byteLength === undefined ? null : source.calibration.byteLength,
        contentType: source.calibration.contentType || '',
        attemptCount: source.calibration.attemptCount || 0,
        segmentIndex: source.calibration.segmentIndex === undefined ? null : source.calibration.segmentIndex,
        segmentStartOffset: source.calibration.segmentStartOffset === undefined ? null : source.calibration.segmentStartOffset,
        transportDtsOffset: source.calibration.transportDtsOffset === undefined ? null : source.calibration.transportDtsOffset,
        transportPtsOffset: source.calibration.transportPtsOffset === undefined ? null : source.calibration.transportPtsOffset
      };
      return {
        playbackGeneration: source.playbackGeneration,
        sourceGeneration: source.sourceGeneration,
        recoveryGeneration: source.recoveryGeneration,
        target: source.target,
        plexOffset: source.plexOffset,
        offsetBase: source.offsetBase,
        delivery: source.delivery,
        action: source.action,
        copytsMode: source.copytsMode,
        probeCopytsMode: source.probeCopytsMode,
        playbackCopytsMode: source.playbackCopytsMode,
        sourceAppliedAtMs: source.sourceAppliedAtMs,
        sourceUri: source.sourceUri,
        probeUri: source.probeUri,
        playlist: playlist,
        segment: segment,
        calibration: calibration,
        mediaEvents: source.mediaEvents.map(cloneMediaEvent)
      };
    }

    function status() {
      return { active: active, copytsMode: mode, sourceCount: sources.length, pendingRequests: pendingRequests.length };
    }

    function exportData() {
      return {
        schema: 1,
        active: active,
        copytsMode: mode,
        startedAt: startedAt,
        stoppedAt: stoppedAt,
        sources: sources.map(projectSource)
      };
    }

    return { start: start, status: status, stop: stop, export: exportData };
  }

  return {
    create: create,
    parsePlaylist: parsePlaylist,
    parseTransportStreamTiming: parseTransportStreamTiming,
    rewriteCopyts: rewriteCopyts,
    rewriteShadowUrl: rewriteShadowUrl,
    classifyPayload: classifyPayload,
    sanitizeUrl: sanitizeUrl
  };
}));
