'use strict';

var assert = require('assert');
var I18n = require('../app/i18n');

function loadLocale(locale) {
  var captured = null;
  require('../app/locales/' + locale)({
    register: function (code, dictionary, names) {
      captured = { code: code, dictionary: dictionary, names: names };
    }
  });
  return captured;
}

var englishLocale = loadLocale('en');
var englishKeys = Object.keys(englishLocale.dictionary).sort();
function placeholders(value) {
  var matches = String(value).match(/\{[^}]+\}/g) || [];
  return matches.sort();
}
['it', 'es', 'fr', 'de', 'pt', 'ko'].forEach(function (locale) {
  var loaded = loadLocale(locale);
  var index;
  assert.strictEqual(loaded.code, locale, locale + ' must register with its own locale code');
  assert.deepStrictEqual(Object.keys(loaded.dictionary).sort(), englishKeys, locale + ' must retain the complete English key set');
  assert.ok(Object.keys(loaded.names).length >= 6, locale + ' must register localized language names');
  for (index = 0; index < englishKeys.length; index += 1) {
    assert.deepStrictEqual(
      placeholders(loaded.dictionary[englishKeys[index]]),
      placeholders(englishLocale.dictionary[englishKeys[index]]),
      locale + ' must preserve placeholders for ' + englishKeys[index]
    );
  }
});

assert.strictEqual(I18n.t('en', 'search.typeMore'), 'Type at least 2 characters', 'English search guidance must match the two-character threshold');
assert.strictEqual(I18n.t('it', 'search.typeMore'), 'Inserisci almeno 2 caratteri', 'Italian search guidance must match the two-character threshold');
assert.strictEqual(I18n.t('en', 'library.catalog'), 'Full Catalog', 'English library catalog label must be available');
assert.strictEqual(I18n.t('it', 'library.unwatched'), 'Non visti', 'Italian watched filter labels must be available');
assert.strictEqual(I18n.t('it', 'home.recommended'), 'Consigliati per te', 'the recommended Home row must be localized');
assert.strictEqual(I18n.t('en', 'library.recommended'), 'Recommended', 'the per-library recommendation tab must be localized');

assert.strictEqual(I18n.language('it-IT'), 'it', 'Italian regional locales must resolve to Italian');
assert.strictEqual(I18n.language('fr-FR'), 'fr', 'French regional locales must resolve to French');
assert.strictEqual(I18n.language('pt-BR'), 'pt', 'Brazilian Portuguese locales must resolve to Portuguese');
assert.strictEqual(I18n.language('ko-KR'), 'ko', 'Korean regional locales must resolve to Korean');
assert.strictEqual(I18n.language('ja-JP'), 'en', 'unsupported interface locales must fall back to English');
assert.strictEqual(I18n.t('en', 'nav.settings'), 'Settings', 'English must be the default project language');
assert.strictEqual(I18n.t('it', 'nav.settings'), 'Impostazioni', 'Italian translations must be available');
assert.strictEqual(I18n.t('ko', 'nav.settings'), '설정', 'Korean translations must be available');
assert.strictEqual(I18n.t('it', 'missing.key'), 'missing.key', 'missing translations must fail visibly but safely');
assert.strictEqual(I18n.t('it', 'settings.episodeCount', { count: 3 }), '3 episodi', 'translations must interpolate values');
assert.strictEqual(I18n.t('en', 'settings.wheelBehavior'), 'Wheel action', 'wheel behavior must have portable English copy');
assert.strictEqual(I18n.t('it', 'settings.wheelItems'), 'Sposta la selezione', 'Italian wheel item mode must use user-friendly copy');
assert.strictEqual(I18n.t('it', 'settings.backgroundMusic'), 'Tema di sottofondo', 'Italian settings must use the same theme terminology throughout');
assert.strictEqual(I18n.languageName('it', 'ja'), 'Giapponese', 'language names must follow the UI language');
assert.strictEqual(I18n.languageName('ko', 'en'), '영어', 'language names must be localized in Korean');
assert.strictEqual(I18n.languageName('en', 'zz'), 'ZZ', 'unknown language tags must remain usable');
assert.strictEqual(I18n.t('en', 'search.loading'), 'Searching...', 'search loading text must be localized in English');
assert.strictEqual(I18n.t('it', 'search.noResults'), 'Nessun risultato', 'search empty state must be localized in Italian');
assert.strictEqual(I18n.t('it', 'search.backspace'), 'Cancella', 'the visible Delete key must be localized');
assert.strictEqual(I18n.t('it', 'player.directShort'), 'Diretto', 'effective Direct Stream mode must have compact Italian copy');
assert.strictEqual(I18n.t('it', 'player.transcodeShort'), 'Trascodifica', 'effective transcoding mode must have compact Italian copy');
assert.strictEqual(I18n.t('en', 'player.resumeFrom', { time: '00:13:13' }), 'Resume from 00:13:13', 'resume copy must expose the absolute saved time');
assert.strictEqual(I18n.t('it', 'player.playFromBeginning'), 'Riproduci dall’inizio', 'restart copy must be available in Italian');
assert.strictEqual(I18n.t('en', 'player.advancedSubtitles'), 'Advanced subtitle settings', 'advanced subtitle settings must have portable English copy');
assert.strictEqual(I18n.t('it', 'player.subtitleUnsupported'), 'Non supportato', 'unsupported subtitle timing must be explained in Italian');
assert.strictEqual(I18n.t('en', 'player.chapters'), 'Chapters', 'chapter navigation must have portable English copy');
assert.strictEqual(I18n.t('it', 'player.chapter'), 'Capitolo', 'individual chapter fallback titles must be localized in Italian');
assert.strictEqual(I18n.t('en', 'player.subtitleLoop'), 'Loop 5s', 'subtitle preview looping must have compact copy');
assert.strictEqual(I18n.t('en', 'settings.diagnostics'), 'User diagnostics', 'diagnostics must be reachable from portable English settings');
assert.strictEqual(I18n.t('it', 'diagnostics.refresh'), 'Aggiorna', 'diagnostics actions must be translated in Italian');
assert.strictEqual(I18n.t('en', 'diagnostics.noPlayback'), 'No recent playback', 'diagnostics must explain the empty playback state');
assert.strictEqual(I18n.t('it', 'detail.subtitleLanguages'), 'Lingue sottotitoli', 'subtitle language metadata must be localized in Italian');
assert.strictEqual(I18n.t('it', 'settings.showMediaInfo'), 'Mostra info media', 'the optional media information setting must be localized in Italian');
assert.strictEqual(I18n.t('en', 'diagnostics.unknownCapabilities'), 'Unknown', 'unknown device capabilities must not be mislabeled as HD');
assert.strictEqual(I18n.t('en', 'diagnostics.localAddress'), 'Local address', 'server diagnostics must label local addresses');
assert.strictEqual(I18n.t('it', 'diagnostics.remoteAddress'), 'Indirizzo remoto', 'server diagnostics must label remote addresses in Italian');
assert.strictEqual(I18n.t('en', 'setup.disconnectPlex'), 'Disconnect Plex');
assert.strictEqual(I18n.t('it', 'setup.disconnectPlex'), 'Disconnetti Plex');
assert.strictEqual(I18n.t('en', 'profile.offline'), 'Offline Profile', 'offline mode must have portable English profile copy');
assert.strictEqual(I18n.t('it', 'profile.offline'), 'Profilo Offline', 'offline mode must have Italian profile copy');
assert.strictEqual(I18n.t('en', 'media.season', { number: 4 }), 'Season 4', 'generated season labels must be localized in English');
assert.strictEqual(I18n.t('it', 'media.movie'), 'Film', 'generated movie labels must be localized in Italian');
assert.strictEqual(I18n.t('en', 'media.episodeCount', { count: 12 }), '12 episodes', 'generated episode counts must be localized in English');
assert.strictEqual(I18n.t('it', 'player.play'), 'Riproduci', 'player accessibility labels must be localized');
assert.strictEqual(I18n.t('en', 'player.pause'), 'Pause', 'player accessibility labels must be localized in English');
assert.strictEqual(I18n.t('en', 'media.episodeCount', { count: 1 }), '1 episode', 'English singular counts must be grammatical');
assert.strictEqual(I18n.t('it', 'media.episodeCount', { count: 1 }), '1 episodio', 'Italian singular counts must be grammatical');
assert.strictEqual(I18n.t('es', 'library.titlesCount', { count: 1 }), '1 t\u00edtulo', 'Spanish singular counts must be grammatical');
assert.strictEqual(I18n.t('fr', 'library.titlesCount', { count: 2 }), '2 titres', 'French plural counts must be grammatical');
assert.strictEqual(I18n.t('de', 'media.episodeCount', { count: 1 }), '1 Folge', 'German singular counts must be grammatical');
assert.strictEqual(I18n.t('pt', 'media.episodeCount', { count: 2 }), '2 epis\u00f3dios', 'Portuguese plural counts must be grammatical');
assert.strictEqual(I18n.t('ko', 'media.episodeCount', { count: 2 }), '에피소드 2개', 'Korean counters must interpolate values');
assert.strictEqual(I18n.t('en', 'status.opening', { title: 'Example' }), 'Opening Example', 'fallback actions must not leak a fixed UI language');
assert.strictEqual(I18n.t('it', 'nav.main'), 'Navigazione principale', 'navigation accessibility labels must be localized');
assert.strictEqual(I18n.t('en', 'player.timeline'), 'Playback position', 'timeline accessibility labels must be localized');
assert.strictEqual(I18n.t('es', 'library.continue'), 'Seguir viendo', 'Spanish must localize the primary library navigation');
assert.strictEqual(I18n.t('fr', 'player.chapters'), 'Chapitres', 'French must localize chapter navigation');
assert.strictEqual(I18n.t('de', 'settings.interfaceLanguage'), 'Sprache der Oberfl\u00e4che', 'German must localize interface settings');
assert.strictEqual(I18n.t('pt-BR', 'player.skipIntro'), 'Pular introdu\u00e7\u00e3o', 'Brazilian Portuguese must localize player actions');
assert.strictEqual(I18n.languageName('fr', 'pt'), 'Portugais (Br\u00e9sil)', 'language names must follow the active interface locale');
assert.deepStrictEqual(I18n.supportedLanguages().sort(), ['de', 'en', 'es', 'fr', 'it', 'ko', 'pt'], 'the locale registry must expose every selectable UI language');

console.log('i18n checks passed');
