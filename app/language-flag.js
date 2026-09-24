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
    rus: 'ru', russian: 'ru', ara: 'ar', arabic: 'ar', 'العربية': 'ar',
    pol: 'pl', polish: 'pl', polski: 'pl',
    nld: 'nl', dut: 'nl', dutch: 'nl', tur: 'tr', turkish: 'tr', swe: 'sv', swedish: 'sv',
    dan: 'da', danish: 'da', nor: 'no', norwegian: 'no', fin: 'fi', finnish: 'fi',
    ces: 'cs', cze: 'cs', czech: 'cs', ell: 'el', gre: 'el', greek: 'el', heb: 'he', hebrew: 'he',
    tha: 'th', thai: 'th', vie: 'vi', vietnamese: 'vi', ind: 'id', indonesian: 'id',
    ukr: 'uk', ukrainian: 'uk', ron: 'ro', rum: 'ro', romanian: 'ro', hun: 'hu', hungarian: 'hu',
    bul: 'bg', bulgarian: 'bg', hrv: 'hr', croatian: 'hr', srp: 'sr', serbian: 'sr',
    slk: 'sk', slo: 'sk', slovak: 'sk', hin: 'hi', hindi: 'hi', fas: 'fa', per: 'fa', persian: 'fa', farsi: 'fa',
    ben: 'bn', bengali: 'bn', msa: 'ms', may: 'ms', malay: 'ms', cat: 'ca', catalan: 'ca',
    isl: 'is', ice: 'is', icelandic: 'is', est: 'et', estonian: 'et', lav: 'lv', latvian: 'lv',
    lit: 'lt', lithuanian: 'lt'
  };
  var SUPPORTED = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar', 'pl',
    'nl', 'tr', 'sv', 'da', 'no', 'fi', 'cs', 'el', 'he', 'th', 'vi', 'id', 'uk', 'ro', 'hu',
    'bg', 'hr', 'sr', 'sk', 'hi', 'fa', 'bn', 'ms', 'ca', 'is', 'et', 'lv', 'lt'];
  var TERRITORIES = {
    en: 'gb', it: 'it', es: 'es', fr: 'fr', de: 'de', pt: 'pt',
    ja: 'jp', ko: 'kr', zh: 'cn', ru: 'ru', ar: 'sa', pl: 'pl',
    nl: 'nl', tr: 'tr', sv: 'se', da: 'dk', no: 'no', fi: 'fi', cs: 'cz', el: 'gr', he: 'il',
    th: 'th', vi: 'vn', id: 'id', uk: 'ua', ro: 'ro', hu: 'hu', bg: 'bg', hr: 'hr', sr: 'rs',
    sk: 'sk', hi: 'in', fa: 'ir', bn: 'bd', ms: 'my', ca: 'es', is: 'is', et: 'ee', lv: 'lv', lt: 'lt'
  };

  function code(value) {
    var normalized = String(value || '').toLowerCase().replace(/_/g, '-').replace(/^\s+|\s+$/g, '');
    var rawPrimary = normalized.split('-')[0];
    var primary = ALIASES[rawPrimary] || rawPrimary.replace(/[^a-z]/g, '');
    primary = ALIASES[primary] || primary;
    return SUPPORTED.indexOf(primary) === -1 ? '' : primary;
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

  return { asset: asset, code: code, create: create };
}));
