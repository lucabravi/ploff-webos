(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./media-profile'));
  } else {
    root.PloffMediaInfo = factory(root.PloffMediaProfile);
  }
}(this, function (MediaProfile) {
  'use strict';

  function basename(value) {
    var parts = String(value || '').split(/[\\/]/);
    return parts[parts.length - 1] || '';
  }

  function durationLabel(milliseconds) {
    var total = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;
    if (!total) { return ''; }
    return hours ? hours + ':' + (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds : minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  function bitrateLabel(value) {
    var bitrate = Number(value || 0);
    if (!bitrate) { return ''; }
    return bitrate >= 1000 ? (Math.round(bitrate / 100) / 10) + ' Mbps' : bitrate + ' kbps';
  }

  function selectedTrack(tracks, id) {
    var list = tracks || [];
    var key = String(id || '');
    var index;
    for (index = 0; index < list.length; index += 1) {
      if (String(list[index].id || '') === key) { return list[index]; }
    }
    return null;
  }

  function trackLabel(track, externalLabel) {
    return MediaProfile.trackDisplayLabel(track, externalLabel || 'External');
  }

  function add(rows, label, value) {
    if (value !== undefined && value !== null && String(value) !== '') { rows.push({ label: label, value: String(value) }); }
  }

  function create(profile, options, translate) {
    var item = profile || {};
    var settings = options || {};
    var t = typeof translate === 'function' ? translate : function (key) { return key; };
    var details = item.videoDetails || {};
    var fileRows = [];
    var videoRows = [];
    var audioRows = [];
    var subtitleRows = [];
    var audio = selectedTrack(item.audioTracks, settings.audioStreamID);
    var subtitle = selectedTrack(item.subtitleTracks, settings.subtitleStreamID);
    var externalLabel = t('detail.external');
    var sections = [];

    add(fileRows, t('mediaDetails.fileName'), basename(item.fileName));
    add(fileRows, t('mediaDetails.size'), item.formattedSize || item.fileSizeLabel);
    add(fileRows, t('mediaDetails.container'), item.container);
    add(fileRows, t('mediaDetails.duration'), durationLabel(item.duration));
    if (fileRows.length) { sections.push({ title: t('mediaDetails.file'), column: 'left', rows: fileRows }); }

    add(videoRows, t('mediaDetails.resolution'), item.resolution || ((item.width && item.height) ? item.width + 'x' + item.height : ''));
    if (item.width && item.height) { add(videoRows, t('mediaDetails.dimensions'), item.width + 'x' + item.height); }
    add(videoRows, t('mediaDetails.codec'), item.videoCodec);
    add(videoRows, t('mediaDetails.dynamicRange'), item.videoDynamicRange);
    add(videoRows, t('mediaDetails.bitrate'), bitrateLabel(item.bitrate));
    add(videoRows, t('mediaDetails.profile'), details.profile || item.videoProfile);
    add(videoRows, t('mediaDetails.frameRate'), details.frameRate || item.videoFrameRate);
    add(videoRows, t('mediaDetails.bitDepth'), details.bitDepth || item.videoBitDepth);
    add(videoRows, t('mediaDetails.colorRange'), details.colorRange || item.videoColorRange);
    if (videoRows.length) { sections.push({ title: t('mediaDetails.video'), column: 'left', rows: videoRows }); }

    add(audioRows, t('mediaDetails.selectedTrack'), trackLabel(audio, externalLabel));
    if (audioRows.length) { sections.push({ title: t('mediaDetails.audio'), column: 'right', rows: audioRows }); }

    add(subtitleRows, t('mediaDetails.selectedTrack'), subtitle ? trackLabel(subtitle, externalLabel) : t('mediaDetails.off'));
    if (subtitleRows.length) { sections.push({ title: t('mediaDetails.subtitles'), column: 'right', rows: subtitleRows }); }

    if (!sections.length) { sections.push({ title: t('mediaDetails.file'), column: 'left', rows: [{ label: t('mediaDetails.status'), value: t('player.unavailable') }] }); }
    return { sections: sections };
  }

  return { basename: basename, create: create, durationLabel: durationLabel, selectedTrack: selectedTrack, trackLabel: trackLabel };
}));
