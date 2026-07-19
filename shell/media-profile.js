(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaProfile = factory();
  }
}(this, function () {
  'use strict';

  var LANGUAGE_ALIASES = { eng: 'en', ita: 'it', jpn: 'ja', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', kor: 'ko', chi: 'zh', zho: 'zh', rus: 'ru' };

  function normalizedLanguage(stream) {
    var value = String(stream.languageTag || stream.languageCode || '').toLowerCase().replace(/_/g, '-').split('-')[0];
    return LANGUAGE_ALIASES[value] || value;
  }

  function track(stream) {
    var tag = normalizedLanguage(stream);
    return {
      id: stream.id || '',
      language: stream.language || stream.title || stream.languageCode || tag || '',
      languageTag: tag,
      languageCode: tag,
      codec: String(stream.codec || '').toUpperCase(),
      channels: Number(stream.channels || 0),
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

  function resolution(media) {
    var value = String(media.videoResolution || '').toLowerCase();
    var height = Number(media.height || 0);
    if (value === '4k' || height >= 2160) { return '4K'; }
    if (value) { return value.replace(/p$/, '') + 'p'; }
    return height ? height + 'p' : '';
  }

  function formattedSize(bytes) {
    var value = Number(bytes || 0);
    if (!isFinite(value) || value <= 0) { return ''; }
    if (value >= 1073741824) { return (Math.round(value / 1073741824 * 10) / 10) + ' GB'; }
    if (value >= 1048576) { return Math.round(value / 1048576) + ' MB'; }
    return Math.round(value / 1024) + ' KB';
  }

  function fromNodes(videoAttrs, mediaAttrs, partAttrs, streams) {
    var video = videoAttrs || {};
    var media = mediaAttrs || {};
    var part = partAttrs || {};
    var audioTracks = [];
    var subtitleTracks = [];
    var result;
    var summary = [];
    (streams || []).forEach(function (stream) {
      if (stream.streamType === '2') { audioTracks.push(track(stream)); }
      else if (stream.streamType === '3') { subtitleTracks.push(track(stream)); }
    });
    result = {
      ratingKey: video.ratingKey || '',
      partId: part.id || '',
      container: String(media.container || part.container || '').toUpperCase(),
      resolution: resolution(media),
      width: Number(media.width || 0),
      height: Number(media.height || 0),
      size: Number(part.size || 0),
      formattedSize: formattedSize(part.size),
      bitrate: Number(media.bitrate || 0),
      videoCodec: String(media.videoCodec || '').toUpperCase(),
      videoDynamicRange: media.videoDynamicRange || media.dynamicRange || '',
      audioCodec: String(media.audioCodec || '').toUpperCase(),
      audioChannels: Number(media.audioChannels || 0),
      audioTracks: audioTracks,
      subtitleTracks: subtitleTracks,
      summary: ''
    };
    if (result.resolution) { summary.push(result.resolution); }
    if (result.container) { summary.push(result.container); }
    if (result.formattedSize) { summary.push(result.formattedSize); }
    result.summary = summary.join(' \u00b7 ');
    return result;
  }

  function fromVersions(videoAttrs, groups) {
    var result = [];
    (groups || []).forEach(function (group, mediaIndex) {
      (group.parts || []).forEach(function (entry, partIndex) {
        var profile = fromNodes(videoAttrs, group.media || {}, entry.part || {}, entry.streams || []);
        profile.mediaIndex = mediaIndex;
        profile.partIndex = partIndex;
        result.push(profile);
      });
    });
    return result;
  }

  function subtitleLanguages(profile) {
    var tracks = profile && profile.subtitleTracks || [];
    var seen = {};
    var values = [];
    tracks.forEach(function (item) {
      var key = String(item.languageTag || item.languageCode || item.language || '').toLowerCase();
      var label = String(item.language || item.languageTag || item.languageCode || '').trim();
      if (!key || !label || seen[key]) { return; }
      seen[key] = true;
      values.push(label);
    });
    return values;
  }

  function choiceState(profile, versions) {
    var source = profile || {};
    return {
      audio: (source.audioTracks || []).length > 1,
      subtitles: (source.subtitleTracks || []).length > 0,
      versions: (versions || []).length > 1
    };
  }

  return {
    choiceState: choiceState,
    formattedSize: formattedSize,
    fromNodes: fromNodes,
    fromVersions: fromVersions,
    subtitleLanguages: subtitleLanguages
  };
}));
