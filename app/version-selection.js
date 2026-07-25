(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./playback-strategy'));
  } else {
    root.PloffVersionSelection = factory(root.PloffPlaybackStrategy);
  }
}(this, function (PlaybackStrategy) {
  'use strict';

  var DEFAULT_PRIORITIES = ['resolution', 'hdr', 'quality', 'directPlay'];
  var CODEC_EFFICIENCY = {
    av1: 1.35,
    hevc: 1.2,
    h265: 1.2,
    vp9: 1.15,
    h264: 1,
    avc: 1
  };

  function normalized(value) {
    return String(value || '').toLowerCase();
  }

  function normalizePriorities(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    var result = [];
    source.concat(DEFAULT_PRIORITIES).forEach(function (value) {
      if (DEFAULT_PRIORITIES.indexOf(value) !== -1 && result.indexOf(value) === -1) { result.push(value); }
    });
    return result;
  }

  function resolution(version) {
    var width = Math.max(0, Number(version && version.width || 0));
    var height = Math.max(0, Number(version && version.height || 0));
    if (!height) {
      height = Number(String(version && version.videoResolution || '').replace(/[^0-9]/g, '')) || 0;
    }
    return width && height ? width * height : height * height * 16 / 9;
  }

  function isPrioritySupported(name, capabilities) {
    var device = capabilities || {};
    if (name !== 'hdr') { return true; }
    if (device.hdrKnown === false) { return true; }
    return device.hdr10 === true || device.dolbyVision === true;
  }

  function effectivePriorities(priorities, capabilities) {
    return normalizePriorities(priorities).filter(function (name) {
      return isPrioritySupported(name, capabilities);
    });
  }

  function hdr(version, capabilities) {
    var range = PlaybackStrategy && PlaybackStrategy.dynamicRange
      ? PlaybackStrategy.dynamicRange(version)
      : (/hdr|dolby|dovi|dv/.test(normalized(version && version.videoDynamicRange)) ? 'hdr10' : 'sdr');
    if (range === 'sdr') { return 0; }
    if (capabilities && capabilities.hdrKnown === false) { return 1; }
    return PlaybackStrategy && PlaybackStrategy.supportsDynamicRange(version, capabilities) ? 1 : 0;
  }

  function quality(version) {
    var codec = normalized(version && version.videoCodec);
    return Math.max(0, Number(version && version.bitrate || 0)) * (CODEC_EFFICIENCY[codec] || 1);
  }

  function directPlay(version, capabilities) {
    return PlaybackStrategy && PlaybackStrategy.compatible(version, capabilities) ? 1 : 0;
  }

  function criterion(version, name, capabilities) {
    if (name === 'resolution') { return resolution(version); }
    if (name === 'hdr') { return hdr(version, capabilities); }
    if (name === 'quality') { return quality(version); }
    if (name === 'directPlay') { return directPlay(version, capabilities); }
    return 0;
  }

  function eligible(versions, capabilities, mode) {
    var source = versions || [];
    if (mode !== 'direct') { return source.slice(); }
    return source.filter(function (version) { return directPlay(version, capabilities); });
  }

  function selectAutomatic(versions, capabilities, mode, priorities) {
    var candidates = eligible(versions, capabilities, mode);
    var order = effectivePriorities(priorities, capabilities);
    if (!candidates.length) { return null; }
    candidates.sort(function (left, right) {
      var index;
      var difference;
      for (index = 0; index < order.length; index += 1) {
        difference = criterion(right, order[index], capabilities) - criterion(left, order[index], capabilities);
        if (difference) { return difference; }
      }
      return Number(left.mediaIndex || 0) - Number(right.mediaIndex || 0);
    });
    return candidates[0];
  }

  function signature(version) {
    if (!version) { return null; }
    return {
      videoCodec: normalized(version.videoCodec),
      container: normalized(version.container),
      width: Math.max(0, Number(version.width || 0)),
      height: Math.max(0, Number(version.height || 0)),
      bitrate: Math.max(0, Number(version.bitrate || 0)),
      hdr: /hdr|dolby|dovi|dv/.test(normalized(version.videoDynamicRange)) ? 1 : 0
    };
  }

  function affinityScore(version, preferred) {
    var current = signature(version);
    var score = 0;
    var largerBitrate;
    if (!current || !preferred) { return 0; }
    if (current.hdr === preferred.hdr) { score += 100; }
    if (current.width === preferred.width && current.height === preferred.height && current.height) { score += 400; }
    if (current.videoCodec && current.videoCodec === preferred.videoCodec) { score += 240; }
    if (current.container && current.container === preferred.container) { score += 80; }
    largerBitrate = Math.max(current.bitrate, preferred.bitrate);
    if (largerBitrate) { score += Math.round(100 * Math.min(current.bitrate, preferred.bitrate) / largerBitrate); }
    return score;
  }

  function selectAffine(versions, preferred, capabilities, mode, priorities) {
    var candidates = eligible(versions, capabilities, mode);
    var best = null;
    var bestScore = 0;
    candidates.forEach(function (version) {
      var score = affinityScore(version, preferred);
      if (score > bestScore) { best = version; bestScore = score; }
    });
    return best && bestScore >= 350
      ? best
      : selectAutomatic(versions, capabilities, mode, priorities);
  }

  function select(versions, options) {
    var values = options || {};
    var requested;
    var index;
    if (values.affinity) {
      return selectAffine(versions, values.affinity, values.capabilities, values.mode, values.priorities);
    }
    if (values.explicitMediaIndex !== null && values.explicitMediaIndex !== undefined && isFinite(Number(values.explicitMediaIndex))) {
      for (index = 0; index < (versions || []).length; index += 1) {
        if (Number(versions[index].mediaIndex) === Number(values.explicitMediaIndex) &&
            (values.explicitPartIndex === null || values.explicitPartIndex === undefined ||
              Number(versions[index].partIndex) === Number(values.explicitPartIndex))) {
          requested = versions[index];
          break;
        }
      }
      if (requested && (values.mode !== 'direct' || directPlay(requested, values.capabilities))) { return requested; }
    }
    return selectAutomatic(versions, values.capabilities, values.mode, values.priorities);
  }

  return {
    DEFAULT_PRIORITIES: DEFAULT_PRIORITIES.slice(),
    affinityScore: affinityScore,
    effectivePriorities: effectivePriorities,
    isPrioritySupported: isPrioritySupported,
    normalizePriorities: normalizePriorities,
    select: select,
    selectAffine: selectAffine,
    selectAutomatic: selectAutomatic,
    signature: signature
  };
}));
