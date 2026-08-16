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

  function nativeAttemptable(version, capabilities) {
    var source = version || {};
    var device = capabilities || {};
    // Codec/container lists are conservative hints; only hard device limits block a probe.
    if (!device.directPlay) { return false; }
    if (source.height > 1080 && !device.uhd) { return false; }
    if (!supportsDynamicRange(source, device)) { return false; }
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

  function sourceIsUhd(version) {
    var source = version || {};
    var resolution = normalized(source.videoResolution);
    return Number(source.width || 0) >= 3840 || Number(source.height || 0) >= 2160 || /4k|uhd/.test(resolution);
  }

  function transcodeResolution(kind, version, capabilities) {
    if (kind !== 'transcode' && kind !== 'safe-transcode') { return '3840x2160'; }
    if (kind === 'safe-transcode') { return '1920x1080'; }
    if (sourceIsUhd(version) && capabilities && (capabilities.uhd === true || capabilities.known === false)) { return '3840x2160'; }
    return '1920x1080';
  }

  function step(kind, version, videoQuality, capabilities) {
    var result = {
      kind: kind,
      mediaIndex: Number(version.mediaIndex || 0),
      partIndex: Number(version.partIndex || 0),
      videoQuality: videoQuality || 'original',
      videoResolution: transcodeResolution(kind, version, capabilities)
    };
    if (kind === 'safe-transcode') { result.safeTranscode = true; }
    return result;
  }

  function compatibilitySkip(memory, kind, version, context) {
    if (!memory || typeof memory.shouldSkip !== 'function') { return false; }
    return memory.shouldSkip({
      kind: kind,
      version: version,
      audio: context && context.audio || null,
      subtitles: context && context.subtitles || null,
      context: context || {}
    });
  }

  function addNativeSteps(result, version, quality, compatibilityMemory, compatibilityContext, capabilities) {
    if (!compatibilitySkip(compatibilityMemory, 'direct-play', version, compatibilityContext)) {
      result.push(step('direct-play', version, 'original', capabilities));
    }
    if (!compatibilitySkip(compatibilityMemory, 'direct-stream', version, compatibilityContext)) {
      result.push(step('direct-stream', version, quality, capabilities));
    }
  }

  function plan(mode, capabilities, versions, selectedIndex, videoQuality, compatibilityMemory, compatibilityContext) {
    var preference = mode === 'direct' || mode === 'transcode' ? mode : 'auto';
    var requested = selectedVersion(versions, selectedIndex, capabilities, false);
    var quality = videoQuality || 'original';
    var result = [];
    var native = nativeAttemptable(requested, capabilities);
    var tracksRequireTranscode = capabilities && capabilities.tracksRequireTranscode === true;
    if (preference === 'direct') {
      result.push(step('direct-play', requested, 'original', capabilities));
      result.push(step('direct-stream', requested, quality, capabilities));
    } else if (preference === 'auto') {
      if (native && !tracksRequireTranscode) { addNativeSteps(result, requested, quality, compatibilityMemory, compatibilityContext, capabilities); }
    }
    if (preference !== 'direct') {
      result.push(step('transcode', requested, quality, capabilities));
      result.push(step('safe-transcode', requested, '8000', capabilities));
      if (preference === 'auto' && native && tracksRequireTranscode) {
        addNativeSteps(result, requested, quality, compatibilityMemory, compatibilityContext, capabilities);
      }
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
