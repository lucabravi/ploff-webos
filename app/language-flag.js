(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLanguageFlag = factory(); }
}(this, function () {
  'use strict';

  var ALIASES = {
    eng: 'en', english: 'en', ita: 'it', italian: 'it', italiano: 'it',
    spa: 'es', spanish: 'es', espanol: 'es', fre: 'fr', fra: 'fr', french: 'fr',
    ger: 'de', deu: 'de', german: 'de', por: 'pt', portuguese: 'pt',
    jpn: 'ja', japanese: 'ja', kor: 'ko', korean: 'ko', chi: 'zh', zho: 'zh', chinese: 'zh',
    rus: 'ru', russian: 'ru'
  };
  var SUPPORTED = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru'];
  var TERRITORIES = {
    en: 'gb', it: 'it', es: 'es', fr: 'fr', de: 'de', pt: 'pt',
    ja: 'jp', ko: 'kr', zh: 'cn', ru: 'ru'
  };

  function code(value) {
    var normalized = String(value || '').toLowerCase().replace(/_/g, '-').replace(/^\s+|\s+$/g, '');
    var primary = normalized.split('-')[0].replace(/[^a-z]/g, '');
    primary = ALIASES[primary] || primary;
    return SUPPORTED.indexOf(primary) === -1 ? '' : primary;
  }

  function trackCode(track) {
    var item = track || {};
    return code(item.languageTag || item.languageCode || item.language || item.title || '');
  }

  function asset(value) {
    var normalized = code(value);
    return normalized ? 'assets/flags/' + TERRITORIES[normalized] + '.svg' : '';
  }

  function create(documentRef, value) {
    var normalized = code(value);
    var node;
    if (!normalized || !documentRef || typeof documentRef.createElement !== 'function') { return null; }
    node = documentRef.createElement('img');
    node.className = 'language-flag language-flag-' + normalized;
    node.src = asset(normalized);
    node.alt = '';
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('data-language-code', normalized);
    node.setAttribute('draggable', 'false');
    return node;
  }

  return { asset: asset, code: code, create: create, trackCode: trackCode };
}));
