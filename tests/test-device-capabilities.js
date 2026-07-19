'use strict';

var assert = require('assert');
var DeviceCapabilities = require('../shell/device-capabilities');

var m4k = DeviceCapabilities.fromInfo({
  modelName: 'OLED55C1',
  screenWidth: 3840,
  screenHeight: 2160,
  uhd: true,
  hdr10: true
}, true);
assert.strictEqual(m4k.directPlay, true, 'webOS devices may use conservative native direct playback');
assert.strictEqual(m4k.uhd, true, 'webOS UHD capability must not be confused with the 1080p UI canvas');
assert.strictEqual(m4k.hdr10, true, 'reported HDR10 support must be retained');
assert.strictEqual(m4k.known, true, 'explicit webOS capability data must be marked as known');
assert.ok(m4k.codecs.indexOf('hevc') !== -1, 'UHD webOS devices must advertise HEVC direct-play support');

var browser = DeviceCapabilities.fromInfo({}, false);
assert.strictEqual(browser.directPlay, false, 'ordinary browser previews must keep Plex streaming as the safe path');
assert.strictEqual(browser.hdr10, false, 'unknown browsers must never claim HDR support');
assert.strictEqual(browser.known, false, 'missing device data must not be presented as an HD capability result');

var callbackResult = null;
DeviceCapabilities.detect({
  webOS: {
    deviceInfo: function (callback) { callback({ uhd: true, hdr10: false, screenWidth: 3840, screenHeight: 2160 }); }
  }
}, function (result) { callbackResult = result; });
assert.strictEqual(callbackResult.uhd, true, 'deviceInfo callback data must initialize capabilities');
assert.strictEqual(callbackResult.hdr10, false, 'missing HDR support must remain conservative');

var palmResult = null;
DeviceCapabilities.detect({
  PalmSystem: {
    deviceInfo: JSON.stringify({ modelName: 'OLED55C9PLA', screenWidth: 3840, screenHeight: 2160 })
  }
}, function (result) { palmResult = result; });
assert.strictEqual(palmResult.modelName, 'OLED55C9PLA', 'older webOS releases must use PalmSystem device information');
assert.strictEqual(palmResult.uhd, true, 'physical panel dimensions from PalmSystem must identify UHD capability');
assert.strictEqual(palmResult.directPlay, true, 'PalmSystem detection must retain the webOS direct-play capability profile');

console.log('Device capability checks passed');
