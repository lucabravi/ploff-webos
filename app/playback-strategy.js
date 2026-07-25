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

  function dynamicRange(version) {
    var value = normalized(version && version.videoDynamicRange);
    if (/dolby|dovi|dv/.test(value)) { return 'dolbyVision'; }
    if (/hdr/.test(value)) { return 'hdr10'; }
    return 'sdr';
  }

  function supportsDynamicRange(version, capabilities) {
    var range = dynamicRange(version);
    var device = capabilities || {};
    if (range === 'dolbyVision') { return device.dolbyVision === true; }
    if (range === 'hdr10') { return device.hdr10 === true; }
    return true;
  }

  function compatible(version, capabilities) {
    var source = version || {};
    var device = capabilities || {};
    if (!device.directPlay) { return false; }
    if (source.height > 1080 && !device.uhd) { return false; }
    if (!supportsDynamicRange(source, device)) { return false; }
    if (device.codecs && device.codecs.length && !contains(device.codecs, source.videoCodec)) { return false; }
    if (device.containers && device.containers.length && !contains(device.containers, source.container)) { return false; }
    return true;
  }

  function streamCompatible(version, capabilities) {
    var source = version || {};
    var device = capabilities || {};
    if (!device.directPlay) { return false; }
    if (source.height > 1080 && !device.uhd) { return false; }
    if (!supportsDynamicRange(source, device)) { return false; }
    if (device.codecs && device.codecs.length && !contains(device.codecs, source.videoCodec)) { return false; }
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
    var quality = videoQuality || 'original';
    var result = [];
    if (preference !== 'transcode') {
      if (compatible(requested, capabilities)) { result.push(step('direct-play', requested, 'original')); }
      if (streamCompatible(requested, capabilities)) { result.push(step('direct-stream', requested, quality)); }
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
    dynamicRange: dynamicRange,
    next: next,
    plan: plan,
    selectedVersion: selectedVersion,
    supportsDynamicRange: supportsDynamicRange
  };
}));
