'use strict';

var assert = require('assert');
var DeviceLocale = require('../app/device-locale');

function detect(environment, supported, callback) {
  DeviceLocale.detect(environment, supported, callback);
}

detect({
  webOS: {
    service: {
      request: function (uri, options) {
        assert.strictEqual(uri, 'luna://com.webos.settingsservice', 'webOS locale detection must use the Settings Service');
        assert.deepStrictEqual(options.parameters.keys, ['localeInfo'], 'webOS locale detection must request locale information only');
        options.onSuccess({ settings: { localeInfo: { locales: { UI: 'it-IT' } } } });
      }
    },
    navigator: { language: 'en-US' }
  }
}, ['en', 'it'], function (language) {
  assert.strictEqual(language, 'it', 'a supported webOS UI locale must take precedence over browser hints');
});

detect({ navigator: { language: 'pt-BR' } }, ['en', 'pt'], function (language) {
  assert.strictEqual(language, 'pt', 'browser locale must seed onboarding when webOS Settings Service is unavailable');
});

detect({
  webOS: {
    service: {
      request: function (uri, options) { options.onFailure({ errorText: 'Unavailable' }); }
    }
  },
  navigator: { language: 'nl-NL' }
}, ['en', 'it'], function (language) {
  assert.strictEqual(language, 'en', 'unsupported or unavailable locales must fall back deterministically to English');
});

console.log('Device locale checks passed');
