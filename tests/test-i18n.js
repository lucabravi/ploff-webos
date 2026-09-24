'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
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
assert.strictEqual(I18n.t('en', 'home.recentInLibrary', { library: 'Anime' }), 'Recently Added in Anime', 'Home Recently Added row headings must interpolate the library name in English');
assert.strictEqual(I18n.t('it', 'home.recentInLibrary', { library: 'Anime' }), 'Aggiunti di recente in Anime', 'Home Recently Added row headings must interpolate the library name in Italian');
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
assert.strictEqual(I18n.t('it', 'media.episodeNumber', { number: 7 }), 'Episodio 7', 'recent episode cards must hide titles behind a localized episode-number label');
assert.strictEqual(I18n.t('en', 'common.unknown'), 'Unknown', 'generic unknown media metadata must be localizable');
assert.strictEqual(I18n.t('es', 'common.unknown'), 'Desconocido', 'generic unknown media metadata must follow the active locale');
assert.strictEqual(I18n.t('it', 'media.newEpisodeCount', { count: 3 }), '3 nuovi episodi', 'Italian recent groups must describe newly added episodes');
assert.strictEqual(I18n.t('en', 'media.newEpisodeCount', { count: 3 }), '3 new episodes', 'English recent groups must describe newly added episodes');
assert.strictEqual(I18n.t('en', 'settings.wheelBehavior'), 'Wheel action', 'wheel behavior must have portable English copy');
assert.strictEqual(I18n.t('it', 'settings.wheelItems'), 'Sposta la selezione', 'Italian wheel item mode must use user-friendly copy');
assert.strictEqual(I18n.t('it', 'settings.backgroundMusic'), 'Musica del tema', 'Italian settings must identify Plex theme music explicitly');
var subtitleOriginLabels = {
  en: ['Prefer external files', 'Prefer embedded'],
  it: ['Preferisci file esterni', 'Preferisci incorporati'],
  es: ['Preferir archivos externos', 'Preferir integrados'],
  fr: ['Préférer les fichiers externes', 'Préférer les sous-titres intégrés'],
  de: ['Externe Dateien bevorzugen', 'Eingebettete Untertitel bevorzugen'],
  pt: ['Preferir arquivos externos', 'Preferir legendas incorporadas'],
  ja: ['外部ファイルを優先', '埋め込み字幕を優先'],
  ko: ['외부 파일 우선', '내장 자막 우선']
};
Object.keys(subtitleOriginLabels).forEach(function (locale) {
  assert.strictEqual(I18n.t(locale, 'settings.preferExternalSubtitles'), subtitleOriginLabels[locale][0], locale + ' external subtitle preference must describe external files');
  assert.strictEqual(I18n.t(locale, 'settings.preferInternalSubtitles'), subtitleOriginLabels[locale][1], locale + ' embedded subtitle preference must use embedded terminology');
});
var homeStateLocales = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko'];
homeStateLocales.forEach(function (locale) {
  var homeOrderLabel = I18n.t(locale, 'settings.homeRows');
  assert.ok(I18n.t(locale, 'state.homeRowsHidden').length > 10, locale + ' hidden Home state must remain informative');
  assert.ok(I18n.t(locale, 'state.homeRowsUnavailable').length > 10, locale + ' unavailable Home state must remain informative');
  assert.ok(I18n.t(locale, 'state.homeRowsHidden').indexOf(homeOrderLabel) !== -1, locale + ' hidden Home state must point to Home item order');
  assert.ok(I18n.t(locale, 'state.homeRowsUnavailable').indexOf(homeOrderLabel) !== -1, locale + ' unavailable Home state must point to Home item order');
});
var simplifiedHomeLibraryLabels = {
  en: ['Navigation bar style', 'Servers & libraries', 'Home item order', 'Name', 'Library name', 'Server name'],
  it: ['Stile barra di navigazione', 'Server e librerie', 'Ordine elementi Home', 'Nome', 'Nome libreria', 'Nome server'],
  es: ['Estilo de la barra de navegación', 'Servidores y bibliotecas', 'Orden de elementos de Inicio', 'Nombre', 'Nombre de biblioteca', 'Nombre del servidor'],
  fr: ['Style de la barre de navigation', 'Serveurs et bibliothèques', 'Ordre des éléments de l’accueil', 'Nom', 'Nom de la bibliothèque', 'Nom du serveur'],
  de: ['Stil der Navigationsleiste', 'Server und Bibliotheken', 'Reihenfolge der Home-Elemente', 'Name', 'Bibliotheksname', 'Servername'],
  pt: ['Estilo da barra de navegação', 'Servidores e bibliotecas', 'Ordem dos itens da tela inicial', 'Nome', 'Nome da biblioteca', 'Nome do servidor'],
  ja: ['ナビゲーションバーのスタイル', 'サーバーとライブラリ', 'ホーム項目の順序', '名前', 'ライブラリ名', 'サーバー名'],
  ko: ['탐색 모음 스타일', '서버 및 라이브러리', '홈 항목 순서', '이름', '라이브러리 이름', '서버 이름']
};
Object.keys(simplifiedHomeLibraryLabels).forEach(function (locale) {
  var labels = simplifiedHomeLibraryLabels[locale];
  assert.strictEqual(I18n.t(locale, 'settings.libraryDisplayMode'), labels[0], locale + ' Navigation bar style label must be explicit');
  assert.strictEqual(I18n.t(locale, 'settings.libraryTabs.title'), labels[1], locale + ' Servers and libraries label must be explicit');
  assert.strictEqual(I18n.t(locale, 'settings.homeRows'), labels[2], locale + ' Home item order label must be explicit');
  assert.strictEqual(I18n.t(locale, 'settings.libraryTabs.alias'), labels[3], locale + ' library customization must use Name instead of Alias');
  assert.strictEqual(I18n.t(locale, 'settings.libraryTabs.aliasTitle'), labels[4], locale + ' library name editor must avoid Alias terminology');
  assert.strictEqual(I18n.t(locale, 'settings.libraryTabs.serverAliasTitle'), labels[5], locale + ' server name editor must avoid Alias terminology');
});
assert.strictEqual(I18n.t('it', 'settings.backup.title'), 'Impostazioni Ploff salvate', 'Italian saved-settings title must describe the stored result rather than the save action');
assert.strictEqual(I18n.t('it', 'settings.backup.chooseSave'), 'Scegli le impostazioni salvate', 'Italian load flow must consistently refer to saved settings');
assert.strictEqual(I18n.t('it', 'settings.backup.loadOtherDeviceHint'), 'Le impostazioni verranno copiate su questa TV senza modificarne l’identità del dispositivo.', 'Italian cross-device copy hint must use natural device-identity wording');
assert.strictEqual(I18n.t('ja', 'settings.backup.title'), '保存した Ploff 設定', 'Japanese saved-settings title must describe stored settings consistently');
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
assert.strictEqual(I18n.t('it', 'detail.mediaOptions'), 'Opzioni media', 'Italian detail media options must be localized');
['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko'].forEach(function (locale) {
  ['detail.preferenceEpisode', 'detail.preferenceSeason', 'detail.preferenceMedia'].forEach(function (key) {
    assert.ok(!/^\(.*\)$/.test(I18n.t(locale, key)), locale + ' preference provenance pills must not duplicate their rounded border with wrapping parentheses');
  });
});
assert.strictEqual(I18n.t('en', 'detail.markSeasonWatched'), 'Mark season as watched', 'season bulk watched action must have portable English copy');
assert.strictEqual(I18n.t('it', 'detail.markSeasonUnwatched'), 'Segna stagione come non vista', 'season bulk unwatched action must be localized in Italian');
assert.strictEqual(I18n.t('it', 'detail.markSeasonWatchedConfirm', { count: 10 }), 'Segnare come visti tutti i 10 episodi della stagione?', 'season bulk confirmation must expose the affected episode count');
assert.strictEqual(I18n.t('it', 'detail.seasonBulkPartial', { count: 2 }), '2 episodi non sono stati aggiornati', 'partial season bulk failures must be localized and quantified');
assert.strictEqual(I18n.t('en', 'detail.moreDetails'), 'More details', 'extended media details must have portable English copy');
assert.strictEqual(I18n.t('it', 'detail.moreDetails'), 'Altri dettagli', 'the lower detail affordance must be localized in Italian');
assert.strictEqual(I18n.t('it', 'detail.genres'), 'Generi', 'extended genre metadata must be localized in Italian');
assert.strictEqual(I18n.t('it', 'detail.directors'), 'Regia', 'extended director metadata must use natural Italian copy');
assert.strictEqual(I18n.t('it', 'detail.extrasLoading'), 'Caricamento extra...', 'lazy extras loading must remain localized without blocking focus');
assert.strictEqual(I18n.t('it', 'mediaDetails.versionTitle'), 'Versione media', 'integrated version details title must be localized');
assert.strictEqual(I18n.t('it', 'mediaDetails.versionHint'), 'Sinistra e Destra cambiano anteprima. Giù apre i dettagli.', 'version browser navigation hint must be localized');
assert.strictEqual(I18n.t('it', 'mediaDetails.active'), 'Attiva', 'active version state must be localized');
assert.strictEqual(I18n.t('it', 'mediaDetails.preview'), 'Anteprima', 'preview version state must be localized');
assert.strictEqual(I18n.t('it', 'mediaDetails.useVersion'), 'Usa questa versione', 'version confirmation action must be localized');
assert.strictEqual(I18n.t('en', 'player.advancedSubtitles'), 'Advanced subtitle settings', 'advanced subtitle settings must have portable English copy');
assert.strictEqual(I18n.t('en', 'player.automatic'), 'Automatic', 'Player automatic selectors must use canonical Automatic copy');
assert.strictEqual(I18n.t('it', 'player.automatic'), 'Automatico', 'Italian Player automatic selectors must use canonical Automatico copy');
assert.strictEqual(I18n.t('en', 'player.subtitleScopeGlobal'), 'Global defaults', 'advanced subtitle scope status must identify global inheritance');
assert.strictEqual(I18n.t('it', 'player.subtitleScopeSeason'), 'Preferenze stagione', 'advanced subtitle scope status must identify season inheritance in Italian');
assert.strictEqual(I18n.t('it', 'player.subtitleScopeEpisode'), 'Personalizzato per questa puntata', 'episode-scoped subtitle preferences must be explicit in Italian');
assert.strictEqual(I18n.t('en', 'player.subtitleScopeUnsaved'), 'Unsaved changes', 'advanced subtitle editor must label draft-only changes');
assert.strictEqual(I18n.t('it', 'player.subtitleReset'), 'Ripristina preferenze sottotitoli', 'subtitle reset dialog title must be localized in Italian');
assert.strictEqual(I18n.t('it', 'player.subtitleResetEpisode'), 'Ripristina questa puntata', 'episode subtitle reset must be localized in Italian');
assert.strictEqual(I18n.t('it', 'player.subtitleResetSeason'), 'Ripristina questa stagione', 'season subtitle reset must be localized in Italian');
assert.strictEqual(I18n.t('it', 'player.subtitleUnsupported'), 'Non supportato', 'unsupported subtitle timing must be explained in Italian');
assert.strictEqual(I18n.t('en', 'player.chapters'), 'Chapters', 'chapter navigation must have portable English copy');
assert.strictEqual(I18n.t('it', 'player.chapter'), 'Capitolo', 'individual chapter fallback titles must be localized in Italian');
assert.strictEqual(I18n.t('en', 'player.subtitleLoop'), 'Loop 5s', 'subtitle preview looping must have compact copy');
assert.strictEqual(I18n.t('es', 'player.subtitleLoop'), 'Repetir 5 s', 'Spanish subtitle preview copy must use a natural action label');
assert.strictEqual(I18n.t('de', 'player.play'), 'Abspielen', 'German player controls must use an action label');
assert.strictEqual(I18n.t('ko', 'player.directPlay'), '다이렉트 재생', 'Korean Direct Play terminology must be natural for video playback');
assert.strictEqual(I18n.t('en', 'diagnostics.delivery'), 'Playback method', 'diagnostics must identify the effective playback method');
assert.strictEqual(I18n.t('it', 'settings.subtitleSuppression'), 'Nascondi sottotitoli con audio in', 'subtitle suppression must make its language-list semantics clear');
assert.strictEqual(I18n.t('it', 'settings.uiTextScale'), 'Dimensione testo interfaccia', 'Italian text scaling must be explicit that it affects the interface');
assert.strictEqual(I18n.t('en', 'settings.lanVideoQuality'), 'Default LAN video quality', 'global LAN quality must be labeled as a default');
assert.strictEqual(I18n.t('it', 'settings.remoteVideoQuality'), 'Qualità video remota predefinita', 'global remote quality must be labeled as a default in Italian');
assert.strictEqual(I18n.t('it', 'settings.playbackMode'), 'Modalità riproduzione predefinita', 'global playback mode must be labeled as a default in Italian');
assert.strictEqual(I18n.t('en', 'player.videoQuality'), 'Video quality', 'player quality must remain a current-playback override label');
assert.strictEqual(I18n.t('it', 'player.playbackMode'), 'Modalità riproduzione', 'player playback mode must remain distinct from the global default label');
assert.strictEqual(I18n.t('it', 'settings.subtitleEdge.double-outline-shadow'), 'Contorno doppio + ombra', 'the stronger subtitle edge mode must be localized in Italian');
assert.strictEqual(I18n.t('en', 'settings.subtitleEdge.double-outline-shadow'), 'Double outline + shadow', 'the stronger subtitle edge mode must have portable English copy');
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
assert.strictEqual(I18n.t('it', 'settings.sectionMultiServer'), 'Multi-Server', 'cross-server controls must expose the Italian Multi-Server subsection title');
assert.strictEqual(I18n.t('it', 'settings.aggregateLibraries'), 'Unisci tab di librerie omonime', 'Italian library merge copy must describe the visible tabs');
assert.strictEqual(I18n.t('it', 'settings.aggregateLibrariesDescription'), 'Mostra come un unico tab le librerie con lo stesso nome e tipo presenti su server Plex diversi, unendone i contenuti.');
assert.strictEqual(I18n.t('it', 'settings.aggregateHomeLibraries'), 'Unisci librerie omonime nella Home', 'Italian Home merge copy must describe the whole Home-library behavior');
assert.strictEqual(I18n.t('it', 'settings.aggregateHomeLibrariesDescription'), 'Combina nella Home le librerie con lo stesso nome e tipo presenti su server Plex diversi e semplifica i relativi badge di provenienza.');
assert.strictEqual(I18n.t('it', 'settings.libraryTabs.disableServer'), 'Disabilita', 'server actions must use the requested concise Italian Disable copy');
assert.strictEqual(I18n.t('it', 'settings.libraryTabs.enableServer'), 'Abilita', 'disabled servers must expose a matching Enable action');
assert.strictEqual(I18n.t('en', 'player.timeline'), 'Playback position', 'timeline accessibility labels must be localized');
assert.strictEqual(I18n.t('es', 'library.continue'), 'Seguir viendo', 'Spanish must localize the primary library navigation');
assert.strictEqual(I18n.t('fr', 'player.chapters'), 'Chapitres', 'French must localize chapter navigation');
assert.strictEqual(I18n.t('de', 'settings.interfaceLanguage'), 'Sprache der Oberfl\u00e4che', 'German must localize interface settings');
assert.strictEqual(I18n.t('pt-BR', 'player.skipIntro'), 'Pular introdu\u00e7\u00e3o', 'Brazilian Portuguese must localize player actions');
assert.strictEqual(I18n.languageName('fr', 'pt'), 'Portugais (Br\u00e9sil)', 'language names must follow the active interface locale');
assert.deepStrictEqual(I18n.supportedLanguages().sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt'], 'the locale registry must expose every selectable UI language');
assert.strictEqual(typeof I18n.has, 'function', 'the locale registry must expose registration checks for lazy production locales');
assert.strictEqual(I18n.has('it'), true, 'CommonJS development registry must report registered locales');

(function browserRegistryKeepsCanonicalLanguagesWithoutPreloadedDictionaries() {
  var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'i18n.js'), 'utf8');
  var context = {};
  vm.runInNewContext(source, context, { filename: 'i18n.js' });
  assert.strictEqual(context.PloffI18n.supportedLanguages().slice().sort().join(','), 'de,en,es,fr,it,ja,ko,pt',
    'browser registry must expose every selectable language before any lazy locale file registers');
  assert.strictEqual(context.PloffI18n.has('it'), false, 'browser registry must distinguish supported languages from dictionaries loaded so far');
  assert.strictEqual(context.PloffI18n.nativeLanguageName('en'), 'English', 'lazy production registry must know the English native name before loading its dictionary');
  assert.strictEqual(context.PloffI18n.nativeLanguageName('it'), 'Italiano', 'lazy production registry must know the Italian native name before loading its dictionary');
  assert.strictEqual(context.PloffI18n.nativeLanguageName('ja'), '日本語', 'lazy production registry must know the Japanese native name before loading its dictionary');
  assert.strictEqual(context.PloffI18n.nativeLanguageName('ko'), '한국어', 'lazy production registry must know the Korean native name before loading its dictionary');
}());
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
assert.ok(indexHtml.indexOf('locale-bootstrap.js?v=dev') !== -1, 'the TV shell must select its startup locale');
I18n.supportedLanguages().forEach(function (locale) {
  var localePath = path.join(__dirname, '..', 'app', 'locales', locale + '.js');
  assert.ok(fs.statSync(localePath).size > 0, locale + ' must remain loadable when selected');
  assert.strictEqual(indexHtml.indexOf('locales/' + locale + '.js?v=dev'), -1,
    locale + ' must not be loaded before it is selected');
});

console.log('i18n checks passed');
assert.strictEqual(I18n.t('it', 'player.subtitleRenderingAssEnableGlobalConfirm'), 'Il rendering dei sottotitoli esterni di tipo .ASS / .SSA è un\'impostazione globale ed è attualmente disabilitato. Vuoi attivarlo globalmente?');
assert.strictEqual(I18n.t('it', 'player.subtitleRenderingAssDisableGlobalConfirm'), 'Il rendering dei sottotitoli esterni di tipo .ASS / .SSA è un\'impostazione globale. Vuoi disattivarlo globalmente?');
assert.strictEqual(I18n.t('it', 'player.subtitleRenderingSrtEnableGlobalConfirm'), 'Il rendering dei sottotitoli SRT / WebVTT sul dispositivo è un\'impostazione globale ed è attualmente disabilitato. Vuoi attivarlo globalmente?');
assert.strictEqual(I18n.t('it', 'player.subtitleRenderingSrtDisableGlobalConfirm'), 'Il rendering dei sottotitoli SRT / WebVTT sul dispositivo è un\'impostazione globale. Vuoi disattivarlo globalmente?');
assert.strictEqual(I18n.t('en', 'common.yes'), 'Yes');
assert.strictEqual(I18n.t('en', 'common.no'), 'No');
