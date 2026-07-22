(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    var registry = factory();
    require('./locales/en')(registry);
    require('./locales/it')(registry);
    require('./locales/es')(registry);
    require('./locales/fr')(registry);
    require('./locales/de')(registry);
    require('./locales/pt')(registry);
    require('./locales/ja')(registry);
    require('./locales/ko')(registry);
    module.exports = registry;
  } else {
    root.PloffI18n = factory();
  }
}(this, function () {
  'use strict';

  var dictionaries = {};
  var languageNames = {};

  function primaryLanguage(value) {
    return String(value || '').toLowerCase().replace(/_/g, '-').split('-')[0];
  }

  function register(locale, dictionary, names) {
    var code = primaryLanguage(locale);
    if (!code) { return; }
    dictionaries[code] = dictionary || {};
    languageNames[code] = names || {};
  }

  function language(value) {
    var primary = primaryLanguage(value);
    return dictionaries[primary] ? primary : 'en';
  }

  function interpolate(value, parameters) {
    return String(value).replace(/\{([^}]+)\}/g, function (match, key) {
      return parameters && parameters[key] !== undefined ? parameters[key] : match;
    });
  }

  function t(locale, key, parameters) {
    var active = language(locale);
    var dictionary = dictionaries[active] || dictionaries.en || {};
    var value = dictionary[key];
    var pluralKey;
    if (parameters && parameters.count !== undefined) {
      pluralKey = key + (Number(parameters.count) === 1 ? '.one' : '.other');
      if (dictionary[pluralKey] !== undefined) { value = dictionary[pluralKey]; }
    }
    if (value === undefined && dictionaries.en) { value = dictionaries.en[key]; }
    return interpolate(value === undefined ? key : value, parameters);
  }

  function languageName(locale, code) {
    var active = language(locale);
    var primary = primaryLanguage(code);
    var names = languageNames[active] || languageNames.en || {};
    return names[primary] || primary.toUpperCase();
  }

  function nativeLanguageName(code) {
    var primary = primaryLanguage(code);
    var names = languageNames[primary] || languageNames.en || {};
    return names[primary] || primary.toUpperCase();
  }

  function supportedLanguages() {
    return Object.keys(dictionaries);
  }

  return {
    language: language,
    languageName: languageName,
    nativeLanguageName: nativeLanguageName,
    register: register,
    supportedLanguages: supportedLanguages,
    t: t
  };
}));
