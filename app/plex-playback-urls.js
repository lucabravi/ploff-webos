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

  function buildSubtitleStreamUrl(config, track) {
    var path = track && track.key ? String(track.key) : '/library/streams/' + encodeURIComponent(String(track && track.id || '')) + '.vtt';
    return PlexUrl.buildUrl(config.apiBaseUrl, path, { encoding: 'utf-8', format: 'webvtt' }, config.token || '');
  }

  function buildSubtitleTranscodeUrl(config, playback, track) {
    var options = playback.options || {};
    return PlexUrl.buildUrl(config.apiBaseUrl, '/video/:/transcode/universal/subtitles', {
      path: playback.key,
      mediaIndex: options.mediaIndex === undefined ? Number(playback.mediaIndex || 0) : Number(options.mediaIndex),
      partIndex: options.partIndex === undefined ? Number(playback.partIndex || 0) : Number(options.partIndex),
      subtitleStreamID: track.id,
      protocol: 'http', format: 'webvtt', advancedSubtitles: 'text',
      transcodeSessionId: String(playback.session || 'ploff') + '-subtitle-' + String(track.id || ''),
      'X-Plex-Product': 'Ploff', 'X-Plex-Version': '0.1', 'X-Plex-Client-Identifier': 'ploff-webos'
    }, config.token || '');
  }

  function buildSubtitleOffsetUrl(config, streamId, offsetMs) {
    return PlexUrl.buildUrl(config.apiBaseUrl, '/library/streams/' + encodeURIComponent(String(streamId || '')), {
      offset: Math.round(Number(offsetMs || 0))
    }, config.token || '');
  }

  return {
    playbackModeFromDecisions: playbackModeFromDecisions,
    playbackModeFromXml: playbackModeFromXml,
    buildStreamSelectionUrl: buildStreamSelectionUrl,
    buildSubtitleStreamUrl: buildSubtitleStreamUrl,
    buildSubtitleTranscodeUrl: buildSubtitleTranscodeUrl,
    buildSubtitleOffsetUrl: buildSubtitleOffsetUrl
  };
}));
