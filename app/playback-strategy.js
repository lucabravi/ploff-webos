(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackStrategy = factory();
  }
}(this, function () {
  'use strict';

  function normalized(value) {
    return String(value || '').toLowerCase();
  }

  function contains(values, value) {
    return (values || []).map(normalized).indexOf(normalized(value)) !== -1;
  }

  function isHdr(version) {
    return /hdr|dolby|dv/.test(normalized(version && version.videoDynamicRange));
  }

  function compatible(version, capabilities) {
    var source = version || {};
    var device = capabilities || {};
    if (!device.directPlay) { return false; }
    if (source.height > 1080 && !device.uhd) { return false; }
    if (isHdr(source) && !device.hdr10) { return false; }
    if (device.codecs && device.codecs.length && !contains(device.codecs, source.videoCodec)) { return false; }
    if (device.containers && device.containers.length && !contains(device.containers, source.container)) { return false; }
    return true;
  }

  function selectedVersion(versions, selectedIndex, capabilities, requireCompatible) {
    var source = versions && versions.length ? versions : [{ mediaIndex: 0, partIndex: 0 }];
    var requested = Number(selectedIndex);
    var index;
    if (isFinite(requested) && source[requested] && (!requireCompatible || compatible(source[requested], capabilities))) {
      return source[requested];
    }
    for (index = 0; index < source.length; index += 1) {
      if (!requireCompatible || compatible(source[index], capabilities)) { return source[index]; }
    }
    return source[0];
  }

  function step(kind, version, videoQuality) {
    return {
      kind: kind,
      mediaIndex: Number(version.mediaIndex || 0),
      partIndex: Number(version.partIndex || 0),
      videoQuality: videoQuality || 'original',
      videoResolution: kind === 'safe-transcode' ? '1920x1080' : '3840x2160'
    };
  }

  function plan(mode, capabilities, versions, selectedIndex, videoQuality) {
    var preference = mode === 'direct' || mode === 'transcode' ? mode : 'auto';
    var requested = selectedVersion(versions, selectedIndex, capabilities, false);
    var direct = selectedVersion(versions, selectedIndex, capabilities, true);
    var quality = videoQuality || 'original';
    var result = [];
    if (preference !== 'transcode') {
      if (compatible(direct, capabilities)) { result.push(step('direct-play', direct, 'original')); }
      result.push(step('direct-stream', requested, quality));
    }
    if (preference !== 'direct') {
      result.push(step('transcode', requested, quality));
      result.push(step('safe-transcode', requested, '8000'));
    }
    return result;
  }

  function next(steps, index) {
    return steps && steps[index + 1] || null;
  }

  return {
    compatible: compatible,
    next: next,
    plan: plan,
    selectedVersion: selectedVersion
  };
}));
