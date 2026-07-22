(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffDeviceCapabilities = factory();
  }
}(this, function () {
  'use strict';

  function truthy(value) {
    return value === true || value === 1 || String(value).toLowerCase() === 'true';
  }

  function fromInfo(info, isWebOS) {
    var source = info || {};
    var screenWidth = Number(source.screenWidth || 0);
    var screenHeight = Number(source.screenHeight || 0);
    var known = source.uhd !== undefined || screenWidth > 0 || screenHeight > 0;
    var uhd = truthy(source.uhd) || screenWidth >= 3840 || screenHeight >= 2160;
    var hdr10 = truthy(source.hdr10) || truthy(source.hdr);
    return {
      directPlay: !!isWebOS,
      codecs: isWebOS ? (uhd ? ['h264', 'hevc'] : ['h264']) : [],
      containers: isWebOS ? ['mp4', 'mkv', 'mpegts', 'ts'] : [],
      known: !!known,
      uhd: !!uhd,
      hdr10: !!hdr10,
      modelName: String(source.modelName || source.model || ''),
      screenWidth: screenWidth,
      screenHeight: screenHeight
    };
  }

  function palmDeviceInfo(palmSystem) {
    var value = palmSystem && palmSystem.deviceInfo;
    if (!value) { return null; }
    if (typeof value === 'object') { return value; }
    try { return JSON.parse(value); } catch (error) { return null; }
  }

  function detect(environment, callback) {
    var target = environment || {};
    var webOS = target.webOS;
    var palmInfo;
    var isWebOS = !!webOS || !!target.PalmSystem;
    var complete = false;
    function done(info) {
      if (complete) { return; }
      complete = true;
      callback(fromInfo(info, isWebOS));
    }
    if (!webOS || typeof webOS.deviceInfo !== 'function') {
      palmInfo = palmDeviceInfo(target.PalmSystem);
      done(palmInfo || {});
      return;
    }
    try {
      webOS.deviceInfo(done);
    } catch (error) {
      done({});
    }
  }

  return { detect: detect, fromInfo: fromInfo };
}));
