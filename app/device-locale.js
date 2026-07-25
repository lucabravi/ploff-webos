(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDeviceLocale = factory(); }
}(this, function () {
  'use strict';

  var SETTINGS_URI = 'luna://com.webos.settingsservice';
  var SETTINGS_TIMEOUT = 350;

  function primaryLanguage(value) {
    return String(value || '').toLowerCase().replace(/_/g, '-').split('-')[0];
  }

  function supportedLanguage(value, supported) {
    var language = primaryLanguage(value);
    return (supported || []).indexOf(language) !== -1 ? language : '';
  }

  function fallback(target, supported) {
    return supportedLanguage(target && target.navigator && target.navigator.language, supported) || 'en';
  }

  function detect(target, supported, callback) {
    var environment = target || {};
    var completed = false;
    var timer;
    function done(language) {
      if (completed) { return; }
      completed = true;
      if (timer && environment.clearTimeout) { environment.clearTimeout(timer); }
      callback(supportedLanguage(language, supported) || fallback(environment, supported));
    }
    if (!environment.webOS || !environment.webOS.service || typeof environment.webOS.service.request !== 'function') {
      done('');
      return;
    }
    if (environment.setTimeout) { timer = environment.setTimeout(function () { done(''); }, SETTINGS_TIMEOUT); }
    try {
      environment.webOS.service.request(SETTINGS_URI, {
        method: 'getSystemSettings',
        parameters: { keys: ['localeInfo'] },
        onSuccess: function (response) {
          var localeInfo = response && response.settings && response.settings.localeInfo;
          done(localeInfo && localeInfo.locales && localeInfo.locales.UI);
        },
        onFailure: function () { done(''); }
      });
    } catch (error) { done(''); }
  }

  return { detect: detect, primaryLanguage: primaryLanguage };
}));
