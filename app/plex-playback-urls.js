(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./plex-url')); }
  else { root.PloffPlexPlaybackUrls = factory(root.PloffPlexUrl); }
}(this, function (PlexUrl) {
  'use strict';

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

  function buildStreamSelectionUrl(config, partId, audioStreamID, subtitleStreamID) {
    return PlexUrl.buildUrl(config.apiBaseUrl, '/library/parts/' + partId, {
      audioStreamID: audioStreamID, subtitleStreamID: subtitleStreamID || 0, allParts: 1
    }, config.token || '');
  }

  function subtitleTextFormat(track) {
    var codec = String(track && (track.format || track.codec) || '').toLowerCase();
    return codec === 'ass' || codec === 'ssa' ? 'ass' : 'webvtt';
  }

  function buildSubtitleStreamUrl(config, track) {
    var format = subtitleTextFormat(track);
    var extension = format === 'ass' ? '.ass' : '.vtt';
    var path = track && track.key ? String(track.key) : '/library/streams/' + encodeURIComponent(String(track && track.id || '')) + extension;
    return PlexUrl.buildUrl(config.apiBaseUrl, path, { encoding: 'utf-8', format: format }, config.token || '');
  }

  function buildSubtitleTranscodeUrl(config, playback, track) {
    var options = playback.options || {};
    var format = subtitleTextFormat(track);
    var transcodeSession = String(playback.transcodeSession || '');
    return PlexUrl.buildUrl(config.apiBaseUrl, '/video/:/transcode/universal/subtitles', {
      path: playback.key,
      mediaIndex: options.mediaIndex === undefined ? Number(playback.mediaIndex || 0) : Number(options.mediaIndex),
      partIndex: options.partIndex === undefined ? Number(playback.partIndex || 0) : Number(options.partIndex),
      subtitleStreamID: track.id,
      protocol: 'hls', format: format, advancedSubtitles: 'text',
      session: transcodeSession,
      transcodeSessionId: transcodeSession,
      'X-Plex-Product': 'Ploff', 'X-Plex-Version': '0.1', 'X-Plex-Client-Identifier': 'ploff-webos',
      'X-Plex-Session-Identifier': transcodeSession
    }, config.token || '');
  }

  function buildSubtitleOffsetUrl(config, streamId, offsetMs) {
    return PlexUrl.buildUrl(config.apiBaseUrl, '/library/streams/' + encodeURIComponent(String(streamId || '')), {
      offset: Math.round(Number(offsetMs || 0))
    }, config.token || '');
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
    return PlexUrl.buildUrl(baseUrl, '/video/:/transcode/universal/start.m3u8', parameters, token);
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
    return PlexUrl.buildUrl(baseUrl, version.partKey, {}, token);
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

  return {
    playbackModeFromDecisions: playbackModeFromDecisions,
    playbackModeFromXml: playbackModeFromXml,
    buildStreamSelectionUrl: buildStreamSelectionUrl,
    buildSubtitleStreamUrl: buildSubtitleStreamUrl,
    buildSubtitleTranscodeUrl: buildSubtitleTranscodeUrl,
    buildSubtitleOffsetUrl: buildSubtitleOffsetUrl,
    hlsUrlFor: hlsUrlFor,
    buildPlaybackUrl: buildPlaybackUrl,
    buildDecisionUrl: buildDecisionUrl
  };
}));
