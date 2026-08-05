'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
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
['it', 'es', 'fr', 'de', 'pt', 'ja', 'ko'].forEach(function (locale) {
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
assert.strictEqual(I18n.language('ja-JP'), 'ja', 'Japanese regional locales must resolve to Japanese');
assert.strictEqual(I18n.language('ko-KR'), 'ko', 'Korean regional locales must resolve to Korean');
assert.strictEqual(I18n.t('en', 'nav.settings'), 'Settings', 'English must be the default project language');
assert.strictEqual(I18n.t('it', 'nav.settings'), 'Impostazioni', 'Italian translations must be available');
assert.strictEqual(I18n.t('ja', 'nav.settings'), '設定', 'Japanese translations must be available');
assert.strictEqual(I18n.t('ko', 'nav.settings'), '설정', 'Korean translations must be available');
assert.strictEqual(I18n.t('it', 'missing.key'), 'missing.key', 'missing translations must fail visibly but safely');
assert.strictEqual(I18n.t('it', 'media.episodeCount', { count: 3 }), '3 episodi', 'translations must interpolate values');
assert.strictEqual(I18n.t('en', 'settings.wheelBehavior'), 'Wheel action', 'wheel behavior must have portable English copy');
assert.strictEqual(I18n.t('it', 'settings.wheelItems'), 'Sposta la selezione', 'Italian wheel item mode must use user-friendly copy');
assert.strictEqual(I18n.t('it', 'settings.backgroundMusic'), 'Musica del tema', 'Italian settings must identify Plex theme music explicitly');
assert.strictEqual(I18n.languageName('it', 'ja'), 'Giapponese', 'language names must follow the UI language');
assert.strictEqual(I18n.languageName('ja', 'en'), '英語', 'Japanese language names must be localized');
assert.strictEqual(I18n.languageName('ko', 'en'), '영어', 'language names must be localized in Korean');
assert.strictEqual(I18n.nativeLanguageName('en'), 'English', 'English must identify itself in English');
assert.strictEqual(I18n.nativeLanguageName('it'), 'Italiano', 'Italian must identify itself in Italian');
assert.strictEqual(I18n.nativeLanguageName('ja'), '日本語', 'Japanese must identify itself in Japanese');
assert.strictEqual(I18n.nativeLanguageName('ko'), '한국어', 'Korean must identify itself in Korean');
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
assert.strictEqual(I18n.t('es', 'player.subtitleLoop'), 'Repetir 5 s', 'Spanish subtitle preview copy must use a natural action label');
assert.strictEqual(I18n.t('de', 'player.play'), 'Abspielen', 'German player controls must use an action label');
assert.strictEqual(I18n.t('ko', 'player.directPlay'), '다이렉트 재생', 'Korean Direct Play terminology must be natural for video playback');
assert.strictEqual(I18n.t('en', 'diagnostics.delivery'), 'Playback method', 'diagnostics must identify the effective playback method');
assert.strictEqual(I18n.t('it', 'settings.subtitleSuppression'), 'Nascondi sottotitoli con audio in', 'subtitle suppression must make its language-list semantics clear');
assert.strictEqual(I18n.t('ja', 'player.queueGapTitle'), '再生順に欠落があります', 'Japanese gap copy must use playback terminology instead of technical sequence jargon');
assert.strictEqual(I18n.t('ko', 'player.queueGapStay'), '현재 영상 계속 보기', 'Korean gap cancellation must explain that current playback continues');
assert.ok(englishKeys.indexOf('status.searchPending') === -1, 'obsolete pre-search placeholder copy must not remain in locale dictionaries');
var obsoleteKeys = ['detail.subtitleLanguages', 'detail.noSubtitles', 'detail.video', 'detail.bitrate', 'status.loading', 'library.playlists', 'library.titlesCount', 'library.titlesCount.one', 'library.titlesCount.other', 'library.emptyCollections', 'library.emptyPlaylists', 'settings.manageProfile', 'settings.episodeCount', 'settings.episodeCount.one', 'settings.episodeCount.other', 'setup.serverAccessUnavailable', 'player.subtitleOffset', 'player.nextEpisode', 'player.startsIn', 'player.infoDevice', 'player.deviceUhdHdr', 'player.deviceUhd', 'player.deviceHd', 'state.libraryLoading', 'state.libraryError', 'state.watchlistLoading', 'state.watchlistEmpty', 'state.detailLoading', 'state.detailEmpty'];
obsoleteKeys.forEach(function (key) {
  assert.ok(englishKeys.indexOf(key) === -1, key + ' must not remain in locale dictionaries');
});
assert.strictEqual(I18n.t('en', 'settings.diagnostics'), 'User diagnostics', 'diagnostics must be reachable from portable English settings');
assert.strictEqual(I18n.t('it', 'diagnostics.refresh'), 'Aggiorna', 'diagnostics actions must be translated in Italian');
assert.strictEqual(I18n.t('en', 'diagnostics.noPlayback'), 'No recent playback', 'diagnostics must explain the empty playback state');
assert.strictEqual(I18n.t('en', 'diagnostics.unknownCapabilities'), 'Unknown', 'unknown device capabilities must not be mislabeled as HD');
assert.strictEqual(I18n.t('en', 'diagnostics.localAddress'), 'Local address', 'server diagnostics must label local addresses');
assert.strictEqual(I18n.t('it', 'diagnostics.remoteAddress'), 'Indirizzo remoto', 'server diagnostics must label remote addresses in Italian');
assert.strictEqual(I18n.t('en', 'network.local-only'), 'Local network only', 'network state must have concise portable English copy');
assert.strictEqual(I18n.t('it', 'network.offline'), 'TV offline', 'offline network state must be explicit in Italian');
assert.strictEqual(I18n.t('en', 'settings.networkStatus'), 'Network status', 'network state must be visible in Plex settings');
assert.strictEqual(I18n.t('it', 'diagnostics.internetAvailable'), 'Internet disponibile', 'network diagnostics must label Internet availability');
assert.strictEqual(I18n.t('en', 'setup.disconnectPlex'), 'Disconnect Plex');
assert.strictEqual(I18n.t('it', 'setup.disconnectPlex'), 'Disconnetti Plex');
assert.strictEqual(I18n.t('en', 'settings.privacyPolicy'), 'Privacy policy', 'privacy controls must be available in portable English');
assert.strictEqual(I18n.t('it', 'settings.deleteLocalData'), 'Elimina tutti i dati locali', 'local-data deletion must be translated in Italian');
assert.strictEqual(I18n.t('en', 'profile.offline'), 'Offline Profile', 'offline mode must have portable English profile copy');
assert.strictEqual(I18n.t('it', 'profile.offline'), 'Profilo offline', 'offline mode must have Italian profile copy');
assert.strictEqual(I18n.t('en', 'media.season', { number: 4 }), 'Season 4', 'generated season labels must be localized in English');
assert.strictEqual(I18n.t('it', 'media.movie'), 'Film', 'generated movie labels must be localized in Italian');
assert.strictEqual(I18n.t('en', 'media.episodeCount', { count: 12 }), '12 episodes', 'generated episode counts must be localized in English');
assert.strictEqual(I18n.t('ja', 'media.episodeCount', { count: 12 }), '12話', 'Japanese episode counts must use a natural counter');
assert.strictEqual(I18n.t('it', 'player.play'), 'Riproduci', 'player accessibility labels must be localized');
assert.strictEqual(I18n.t('it', 'player.playNow'), 'Riproduci ora', 'Up Next must use an explicit immediate-play action');
assert.strictEqual(I18n.t('it', 'player.upNextIn', { seconds: 10 }), 'Prossimo episodio tra 10s', 'Up Next countdown copy must describe the next episode');
assert.strictEqual(I18n.t('it', 'network.unknown'), 'Controllo della rete', 'Italian unknown network state must describe the ongoing check');
assert.strictEqual(I18n.t('it', 'settings.remoteDirect'), 'Remoto diretto', 'Italian remote-direct labels must not mix languages');
assert.strictEqual(I18n.t('fr', 'settings.remoteDirect'), 'Accès distant direct', 'French remote-direct labels must be natural and explicit');
assert.strictEqual(I18n.t('de', 'settings.wheelBehavior'), 'Scrollrad-Aktion', 'German wheel settings must use a meaningful term');
assert.strictEqual(I18n.t('pt-BR', 'home.recommended'), 'Recomendado para você', 'Brazilian Portuguese must use Brazilian address forms');
assert.strictEqual(I18n.t('pt-BR', 'diagnostics.connectionType'), 'Tipo de conexão', 'Brazilian Portuguese must not mix European connection terminology');
var portugueseLocale = loadLocale('pt');
var portugueseCopy = Object.keys(portugueseLocale.dictionary).map(function (key) { return portugueseLocale.dictionary[key]; }).join(' ');
assert.ok(!/(?:para si|\bequipa\b|Prima Voltar|\bregressar\b|\bprogramador\b|\bcontacto\b|\bregistos\b|\bpartilha\b|\bdefinições\b|aplicação webOS|Tipo de ligação|A carregar|A verificar)/i.test(portugueseCopy), 'Brazilian Portuguese must not contain known European Portuguese variants');
assert.strictEqual(I18n.t('en', 'player.pause'), 'Pause', 'player accessibility labels must be localized in English');
assert.strictEqual(I18n.t('en', 'media.episodeCount', { count: 1 }), '1 episode', 'English singular counts must be grammatical');
assert.strictEqual(I18n.t('it', 'media.episodeCount', { count: 1 }), '1 episodio', 'Italian singular counts must be grammatical');
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
assert.deepStrictEqual(I18n.supportedLanguages().sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt'], 'the locale registry must expose every selectable UI language');
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
I18n.supportedLanguages().forEach(function (locale) {
  assert.ok(indexHtml.indexOf('locales/' + locale + '.js?v=dev') !== -1, locale + ' locale must be loaded by the TV shell');
});

console.log('i18n checks passed');
