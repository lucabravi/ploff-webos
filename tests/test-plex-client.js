'use strict';

var assert = require('assert');
var PlexClient = require('../app/plex-client');

assert.strictEqual(
  PlexClient.buildUrl('/plex-api/', '/hubs/home', { limit: 12 }, 'secret token'),
  '/plex-api/hubs/home?limit=12&X-Plex-Token=secret%20token',
  'API URLs must normalize slashes and encode credentials'
);

var searchItems = PlexClient.searchItemsFromAttributes([
  { type: 'show', ratingKey: '20', title: 'Zeta', librarySectionTitle: 'Anime', thumb: '/z', art: '/za' },
  { type: 'show', ratingKey: '10', title: 'Alpha', librarySectionTitle: 'Serie TV', thumb: '/a', art: '/aa' },
  { type: 'show', ratingKey: '10', title: 'Alpha duplicate', librarySectionTitle: 'Serie TV', thumb: '/dup' },
  { type: 'movie', ratingKey: '30', title: 'Beta', librarySectionTitle: 'Film', year: '2025', thumb: '/b', art: '/ba' },
  { type: 'episode', ratingKey: '40', title: 'Ignored episode', librarySectionTitle: 'Anime' },
  { type: 'tag', title: 'Ignored actor', librarySectionTitle: 'Film' }
], '/plex-api', 'token');
assert.deepStrictEqual(searchItems.map(function (item) {
  return [item.title, item.type, item.ratingKey, item.libraryTitle];
}), [
  ['Alpha', 'show', '10', 'Serie TV'],
  ['Beta', 'movie', '30', 'Film'],
  ['Zeta', 'show', '20', 'Anime']
], 'search must keep top-level media, deduplicate it, retain libraries and sort alphabetically');
assert.deepStrictEqual(PlexClient.searchItemsFromAttributes([
  { type: 'show', ratingKey: '40', title: 'Blue Box', originalTitle: 'Ao no Hako', librarySectionTitle: 'Anime' },
  { type: 'show', ratingKey: '41', title: 'Pokémon', titleSort: 'Pokemon', librarySectionTitle: 'Anime' }
], '/plex-api', 'token', 'pok').map(function (item) { return item.ratingKey; }), ['41'], 'ranked local search must discard related titles that do not contain the typed query');

var previousXhr = global.XMLHttpRequest;
var fakeXhrs = [];
global.XMLHttpRequest = function () {
  fakeXhrs.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () { this.aborted = true; };
};
var obsoleteSearchCallbacks = 0;
var searchRequest = PlexClient.search(
  { apiBaseUrl: '/plex-api', token: 'token', searchItemLimit: 40 },
  'rent & blue',
  [
    { kind: 'library', key: '4', type: 'show', title: 'Anime' },
    { kind: 'library', key: '2', type: 'movie', title: 'Film' },
    { kind: 'settings', title: 'Settings' }
  ],
  function () { obsoleteSearchCallbacks += 1; }
);
assert.strictEqual(fakeXhrs.length, 1, 'search must use the server search hub instead of issuing one request per library');
assert.strictEqual(fakeXhrs[0].method, 'GET', 'search must use GET requests');
assert.ok(/\/hubs\/search\?/.test(fakeXhrs[0].url) && /query=rent%20%26%20blue/.test(fakeXhrs[0].url), 'local search must use Plex’s ranked search hub');
assert.ok(/limit=40/.test(fakeXhrs[0].url), 'local hub search must remain bounded');
searchRequest.abort();
assert.strictEqual(fakeXhrs[0].aborted, true, 'search cancellation must abort the hub request');
fakeXhrs[0].status = 200;
fakeXhrs[0].readyState = 4;
fakeXhrs[0].responseText = '<MediaContainer><Hub><Directory type="show" ratingKey="1" title="Example Show" librarySectionTitle="TV" /></Hub></MediaContainer>';
fakeXhrs[0].onreadystatechange();
assert.strictEqual(obsoleteSearchCallbacks, 0, 'an aborted search must ignore a response that arrives after newer input');
global.XMLHttpRequest = previousXhr;

var previousGuardedXhr = global.XMLHttpRequest;
var guardedXhr;
global.XMLHttpRequest = function () {
  guardedXhr = this;
  this.open = function () {};
  this.send = function () {};
  this.abort = function () {
    this.aborted = true;
    this.status = 0;
    this.readyState = 4;
    if (this.onreadystatechange) { this.onreadystatechange(); }
  };
};
var guardedCallbacks = 0;
var completedRequest = PlexClient.loadServerIdentity({ apiBaseUrl: '/plex-api', token: 'token' }, function () { guardedCallbacks += 1; });
var completedXhr = guardedXhr;
guardedXhr.status = 200;
guardedXhr.readyState = 4;
guardedXhr.responseText = '<MediaContainer friendlyName="Server" version="1.0" machineIdentifier="machine" />';
guardedXhr.onreadystatechange();
guardedXhr.ontimeout();
guardedXhr.onerror();
assert.strictEqual(guardedCallbacks, 1, 'a Plex request must complete only once when ready-state and terminal events overlap');
completedRequest.abort();
assert.strictEqual(completedXhr.aborted, undefined, 'aborting an already completed Plex request must be a no-op');
var abortedCallbacks = 0;
var guardedAbortRequest = PlexClient.loadServerIdentity({ apiBaseUrl: '/plex-api', token: 'token' }, function () { abortedCallbacks += 1; });
guardedAbortRequest.abort();
assert.strictEqual(guardedXhr.aborted, true, 'the guarded Plex request must still abort the native request');
assert.strictEqual(abortedCallbacks, 0, 'intentionally aborted Plex requests must not publish stale callbacks');
global.XMLHttpRequest = previousGuardedXhr;

var previousImmediateXhr = global.XMLHttpRequest;
var previousImmediateTimeout = global.setTimeout;
var deferredPlexFailure = null;
var immediatePlexCallbacks = 0;
global.setTimeout = function (callback) { deferredPlexFailure = callback; return 1; };
global.XMLHttpRequest = function () {
  this.open = function () { throw new Error('invalid endpoint'); };
  this.abort = function () {};
};
PlexClient.loadServerIdentity({ apiBaseUrl: 'invalid', token: '' }, function () { immediatePlexCallbacks += 1; });
assert.strictEqual(immediatePlexCallbacks, 0, 'synchronous XHR failures must not race the caller request assignment');
deferredPlexFailure();
assert.strictEqual(immediatePlexCallbacks, 1, 'synchronous XHR failures must still complete asynchronously');
global.XMLHttpRequest = previousImmediateXhr;
global.setTimeout = previousImmediateTimeout;

var resizedPoster = PlexClient.posterUrl(
  { apiBaseUrl: 'http://192.168.50.10:32400', token: 'token' },
  'http://192.168.50.10:32400/library/metadata/42/thumb/1?X-Plex-Token=token',
  221.6,
  309.2
);
assert.ok(/\/photo\/:\/transcode\?/.test(resizedPoster), 'poster resizing must use Plex photo transcode');
assert.ok(/width=222/.test(resizedPoster) && /height=309/.test(resizedPoster), 'poster dimensions must be rounded to rendered pixels');
assert.ok(/url=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F1%3FX-Plex-Token%3Dtoken/.test(resizedPoster), 'the original Plex asset path must be encoded inside the resize request');

var resizedBackdrop = PlexClient.posterUrl(
  { apiBaseUrl: 'http://192.168.50.10:32400', token: 'token' },
  'http://192.168.50.10:32400/library/metadata/42/art/1?X-Plex-Token=token',
  1920,
  1080
);
assert.ok(/width=1920/.test(resizedBackdrop) && /height=1080/.test(resizedBackdrop), 'progressive backdrops must retain Full HD output dimensions');

var compositePreview = PlexClient.posterUrl(
  { apiBaseUrl: 'http://192.168.50.10:32400', token: 'token' },
  'http://192.168.50.10:32400/library/collections/55/composite/1?width=400&height=600&X-Plex-Token=token',
  64,
  96
);
assert.ok(
  /url=%2Flibrary%2Fcollections%2F55%2Fcomposite%2F1%3Fwidth%3D64%26height%3D96%26X-Plex-Token%3Dtoken/.test(compositePreview),
  'collection previews must ask Plex to generate the composite at preview resolution'
);
var chapterPreview = PlexClient.posterUrl(
  { apiBaseUrl: 'http://192.168.50.10:32400', token: 'token' },
  'http://192.168.50.10:32400/library/metadata/42/chapter/1?X-Plex-Token=token',
  96,
  54
);
assert.ok(/width=96/.test(chapterPreview) && /height=54/.test(chapterPreview), 'small landscape previews must preserve their requested aspect ratio');
var compositeBackdrop = PlexClient.posterUrl(
  { apiBaseUrl: 'http://192.168.50.10:32400', token: 'token' },
  'http://192.168.50.10:32400/library/collections/55/composite/1?width=400&height=600&X-Plex-Token=token',
  1920,
  1080
);
assert.ok(
  /url=%2Flibrary%2Fcollections%2F55%2Fcomposite%2F1%3Fwidth%3D1920%26height%3D1080%26X-Plex-Token%3Dtoken/.test(compositeBackdrop),
  'collection backdrops must ask Plex for a native Full HD landscape composite'
);

assert.ok(
  /\/hubs\/continueWatching\/items\?/.test(PlexClient.buildLibraryBrowseUrl(
    { apiBaseUrl: '/plex-api', token: 'token' }, { key: '4' }, 'continue', {}, 0, 60
  )) && /contentDirectoryID=4/.test(PlexClient.buildLibraryBrowseUrl(
    { apiBaseUrl: '/plex-api', token: 'token' }, { key: '4' }, 'continue', {}, 0, 60
  )),
  'library Continue Watching must be scoped by contentDirectoryID'
);
assert.ok(/\/library\/sections\/4\/collections\?/.test(PlexClient.buildLibraryBrowseUrl(
  { apiBaseUrl: '/plex-api', token: 'token' }, { key: '4' }, 'collections', {}, 0, 60
)), 'library collections must use the local section endpoint');
assert.ok(/\/playlists\?/.test(PlexClient.buildLibraryBrowseUrl(
  { apiBaseUrl: '/plex-api', token: 'token' }, { key: '4' }, 'playlists', {}, 0, 60
)), 'library playlists must use the local PMS playlist endpoint');
var collectionItem = PlexClient.containerFromAttributes({
  ratingKey: '55', type: 'collection', title: 'Saga', key: '/library/collections/55/children', thumb: '/collection.jpg', childCount: '4'
}, '/plex-api', 'token', 'collections');
assert.strictEqual(collectionItem.containerKey, '/library/collections/55/children', 'collection cards must retain their children endpoint');
assert.strictEqual(collectionItem.meta, '4 titles', 'collection cards must expose their item count');
var compositeCollectionItem = PlexClient.containerFromAttributes({
  ratingKey: '56', type: 'collection', title: 'Composite', key: '/library/collections/56/children',
  thumb: '/library/collections/56/composite/1705704116?width=400&height=600', childCount: '3'
}, '/plex-api', 'token', 'collections');
assert.strictEqual(
  compositeCollectionItem.image,
  '/plex-api/library/collections/56/composite/1705704116?width=400&height=600&X-Plex-Token=token',
  'collection composite artwork must append authentication to its existing query string'
);
assert.deepStrictEqual(
  PlexClient.homeDefinitions([
    { key: '2', title: 'Film', type: 'movie' },
    { key: '4', title: 'Anime', type: 'show' }
  ], {}),
  [
    { title: 'Continua a guardare', path: '/hubs/continueWatching/items' },
    { title: 'Recentemente aggiunto in Film', path: '/library/sections/2/recentlyAdded', groupRecent: true },
    { title: 'Recentemente aggiunto in Anime', path: '/library/sections/4/recentlyAdded', groupRecent: true }
  ],
  'Home must use the all-library Continue Watching hub exposed by Plex Media Server'
);
assert.strictEqual(PlexClient.recommendationHubPriority('tv.startwatching.4'), 1, 'Start Watching must have the highest recommendation priority');
assert.strictEqual(PlexClient.recommendationHubPriority('movie.genre.2.1378'), 2, 'genre recommendations must be accepted');
assert.strictEqual(PlexClient.recommendationHubPriority('movie.recentlyviewed.2'), 0, 'recently watched items must not be presented as new recommendations');
var previousDomParser = global.DOMParser;
function fakeXmlNode(name, attributes, children) {
  var pairs = Object.keys(attributes || {}).map(function (key) { return { name: key, value: String(attributes[key]) }; });
  return {
    nodeType: 1,
    nodeName: name,
    attributes: pairs,
    childNodes: children || [],
    getAttribute: function (key) { return attributes[key] === undefined ? null : String(attributes[key]); }
  };
}
var recommendationHubs = [
  fakeXmlNode('Hub', { title: 'Start Watching', hubIdentifier: 'tv.startwatching.4' }, [
    fakeXmlNode('Directory', { type: 'show', ratingKey: '100', title: 'New Show', thumb: '/new' }),
    fakeXmlNode('Directory', { type: 'show', ratingKey: '101', title: 'Completed Show', leafCount: '12', viewedLeafCount: '12' })
  ]),
  fakeXmlNode('Hub', { title: 'Recently Watched', hubIdentifier: 'tv.recentlyviewed.4' }, [
    fakeXmlNode('Directory', { type: 'show', ratingKey: '102', title: 'Old Show' })
  ])
];
global.DOMParser = function () {
  this.parseFromString = function () {
    return {
      getElementsByTagName: function (name) {
        if (name === 'Hub') { return recommendationHubs; }
        return [];
      }
    };
  };
};
var recommendationRows = PlexClient.recommendationRowsFromXml('<xml/>', '/plex-api', 'token');
assert.deepStrictEqual(recommendationRows.map(function (row) { return [row.identifier, row.items.map(function (item) { return item.ratingKey; })]; }), [
  ['tv.startwatching.4', ['100']]
], 'library recommendations must preserve Plex hubs while removing completed and non-recommendation rows');
global.DOMParser = previousDomParser;
var ratingCatalogUrl = PlexClient.buildLibraryBrowseUrl(
  { apiBaseUrl: '/plex-api', token: 'token' },
  { key: '4' },
  'catalog',
  { sort: 'audienceRating', direction: 'desc', watched: 'watched' },
  60,
  60
);
assert.ok(/\/library\/sections\/4\/all\?/.test(ratingCatalogUrl), 'catalog must use the selected library endpoint');
assert.ok(/sort=audienceRating%3Adesc/.test(ratingCatalogUrl) && /unwatched=0/.test(ratingCatalogUrl), 'catalog URL must carry server-side rating and watched controls');
assert.ok(/X-Plex-Container-Start=60/.test(ratingCatalogUrl) && /X-Plex-Container-Size=60/.test(ratingCatalogUrl), 'catalog URL must carry page boundaries');
var filteredYearCatalogUrl = PlexClient.buildLibraryBrowseUrl(
  { apiBaseUrl: '/plex-api', token: 'token' },
  { key: '4' },
  'catalog',
  { sort: 'year', direction: 'desc', watched: 'all', filters: { year: '2025', genre: '12', resolution: '4k', hdr: '1' } },
  0,
  60
);
assert.ok(/sort=year%3Adesc/.test(filteredYearCatalogUrl), 'catalog must support server-side year sorting');
assert.ok(/year=2025/.test(filteredYearCatalogUrl) && /genre=12/.test(filteredYearCatalogUrl) && /resolution=4k/.test(filteredYearCatalogUrl) && /hdr=1/.test(filteredYearCatalogUrl), 'catalog must carry selected advanced filters, including HDR');
assert.ok(/hdr=0/.test(PlexClient.buildLibraryBrowseUrl(
  { apiBaseUrl: '/plex-api', token: 'token' },
  { key: '4' },
  'catalog',
  { filters: { hdr: '0' } },
  0,
  60
)), 'catalog must preserve the explicit SDR filter');

assert.deepStrictEqual(
  PlexClient.mediaFromAttributes({
    title: 'La decisione',
    grandparentTitle: 'Example Show',
    parentTitle: 'Stagione 4',
    parentIndex: '4',
    index: '2',
    type: 'episode',
    thumb: '/library/metadata/42/thumb/1',
    art: '/library/metadata/42/art/1',
    duration: '1440000',
    viewOffset: '720000'
  }, '/plex-api', 'token'),
  {
    title: 'Example Show',
    meta: 'Stagione 4',
    metaKey: 'media.season',
    metaParameters: { number: 4 },
    detail: 'E02 - La decisione',
    image: '/plex-api/library/metadata/42/thumb/1?X-Plex-Token=token',
    art: '/plex-api/library/metadata/42/art/1?X-Plex-Token=token',
    progress: 50
  },
  'episode metadata must retain series, season, episode, artwork and progress'
);

assert.strictEqual(
  PlexClient.mediaFromAttributes({ type: 'show', ratingKey: '7', title: 'Rated', audienceRating: '8.4' }, '/plex-api', 'token').rating,
  8.4,
  'library cards must retain the Plex audience rating'
);
assert.deepStrictEqual(
  PlexClient.mediaFromAttributes({ type: 'movie', title: 'Example', year: '2025' }, '/plex-api', ''),
  {
    title: 'Example',
    meta: 'Movie - 2025',
    metaKey: 'media.movieWithYear',
    metaParameters: { year: '2025' },
    year: 2025,
    image: '',
    art: ''
  },
  'generated movie labels must expose locale-neutral metadata alongside their compatibility text'
);

assert.strictEqual(
  PlexClient.mediaFromAttributes({ type: 'show', ratingKey: '8', title: 'Example Show', year: '2024' }, '/plex-api', '').year,
  2024,
  'series catalog items must retain their Plex year for visible year sorting'
);

assert.deepStrictEqual(
  PlexClient.mediaFromAttributes({
    title: 'Stagione 3',
    parentTitle: 'Mushoku Tensei',
    index: '3',
    leafCount: '12',
    type: 'season',
    thumb: '/library/metadata/9/thumb/1'
  }, '/plex-api', ''),
  {
    title: 'Mushoku Tensei',
    meta: 'Season 3',
    metaKey: 'media.season',
    metaParameters: { number: 3 },
    detail: '12 episodes',
    detailKey: 'media.episodeCount',
    detailParameters: { count: 12 },
    image: '/plex-api/library/metadata/9/thumb/1',
    art: '/plex-api/library/metadata/9/thumb/1'
  },
  'season metadata must show its series, season number and episode count'
);

var grouped = PlexClient.groupRecentAttributes([
  { type: 'episode', title: 'Uno', grandparentTitle: 'Serie A', parentTitle: 'Stagione 1', parentIndex: '1', index: '1', parentRatingKey: '10', parentThumb: '/season-a', grandparentArt: '/art-a' },
  { type: 'episode', title: 'Due', grandparentTitle: 'Serie A', parentTitle: 'Stagione 1', parentIndex: '1', index: '2', parentRatingKey: '10', parentThumb: '/season-a', grandparentArt: '/art-a' },
  { type: 'episode', title: 'Tornare a casa', grandparentTitle: 'Grand Blue', parentTitle: 'Stagione 3', parentIndex: '3', index: '2', parentRatingKey: '20', thumb: '/episode-b', art: '/art-b' }
]);

assert.deepStrictEqual(
  grouped,
  [
    { type: 'season', ratingKey: '10', title: 'Stagione 1', parentTitle: 'Serie A', index: '1', leafCount: '2', viewedLeafCount: '0', thumb: '/season-a', art: '/art-a' },
    { type: 'episode', title: 'Tornare a casa', grandparentTitle: 'Grand Blue', parentTitle: 'Stagione 3', parentIndex: '3', index: '2', parentRatingKey: '20', thumb: '/episode-b', art: '/art-b' }
  ],
  'recent episodes must group only when multiple items belong to the same season'
);

assert.deepStrictEqual(
  PlexClient.sectionDefinitions([
    { key: '2', title: 'Film', type: 'movie' },
    { key: '4', title: 'Anime', type: 'show' },
    { key: '1', title: 'Programmi TV', type: 'show' }
  ]),
  [
    { title: 'Recentemente aggiunto in Film', path: '/library/sections/2/recentlyAdded', groupRecent: true },
    { title: 'Recentemente aggiunto in Anime', path: '/library/sections/4/recentlyAdded', groupRecent: true },
    { title: 'Recentemente aggiunto in Programmi TV', path: '/library/sections/1/recentlyAdded', groupRecent: true }
  ],
  'library sections must produce one recently-added row each'
);

assert.deepStrictEqual(
  PlexClient.navigationDefinitions([
    { key: '2', title: 'Film', type: 'movie' },
    { key: '4', title: 'Anime', type: 'show' },
    { key: '9', title: 'Musica', type: 'artist' }
  ]),
  [
    { title: 'Home', kind: 'home', labelKey: 'nav.home' },
    { title: 'Film', kind: 'library', key: '2', type: 'movie' },
    { title: 'Anime', kind: 'library', key: '4', type: 'show' },
    { title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' },
    { title: 'Cerca', kind: 'search', labelKey: 'nav.search' },
    { title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' }
  ],
  'navigation must be generated from compatible Plex libraries with static search and settings entries'
);

assert.deepStrictEqual(
  PlexClient.detailFromAttributes({
    ratingKey: '23581',
    type: 'episode',
    grandparentRatingKey: '100',
    parentRatingKey: '200',
    parentIndex: '3',
    title: 'Tornare a casa',
    grandparentTitle: 'Grand Blue',
    parentTitle: 'Stagione 3',
    index: '2',
    year: '2026',
    duration: '1440000',
    viewOffset: '360000',
    contentRating: 'TV-14',
    summary: 'Una giornata al mare.',
    thumb: '/episode-thumb',
    grandparentThumb: '/show-thumb',
    art: '/episode-art'
  }, '/plex-api', ''),
  {
    ratingKey: '23581',
    type: 'episode',
    showRatingKey: '100',
    seasonRatingKey: '200',
    seasonIndex: 3,
    episodeIndex: 2,
    viewed: false,
    viewOffset: 360000,
    duration: 1440000,
    title: 'Grand Blue',
    subtitle: 'Stagione 3 - E02 - Tornare a casa',
    facts: '2026  |  24 min  |  TV-14',
    summary: 'Una giornata al mare.',
    image: '/plex-api/show-thumb',
    art: '/plex-api/episode-art'
  },
  'detail metadata must produce a TV-readable episode hierarchy'
);

assert.deepStrictEqual(
  PlexClient.episodeFromAttributes({
    ratingKey: '44', index: '3', title: 'La decisione', thumb: '/episode', viewCount: '1',
    viewOffset: '360000', duration: '1440000'
  }, '/plex-api', '', '44'),
  {
    ratingKey: '44', index: 3, title: 'La decisione', image: '/plex-api/episode', viewed: true,
    viewOffset: 360000, duration: 1440000, progress: 25, selected: true
  },
  'episode rows must expose selection, watched state and playback progress'
);

assert.strictEqual(
  PlexClient.mediaFromAttributes({ type: 'movie', ratingKey: 'movie-1', title: 'Film', viewCount: '1' }, '/plex-api', '').viewed,
  true,
  'watched movies must expose their watched state on every card view'
);
assert.strictEqual(
  PlexClient.mediaFromAttributes({ type: 'show', ratingKey: 'show-1', title: 'Serie', leafCount: '12', viewedLeafCount: '12' }, '/plex-api', '').viewed,
  true,
  'fully watched series must expose their watched state on every card view'
);

assert.strictEqual(
  PlexClient.preferredSeasonKeyFromAttributes([
    { ratingKey: 'specials', index: '0', leafCount: '2', viewedLeafCount: '0' },
    { ratingKey: 'season-1', index: '1', leafCount: '12', viewedLeafCount: '12' },
    { ratingKey: 'season-2', index: '2', leafCount: '12', viewedLeafCount: '4' }
  ], 'season-1'),
  'season-1',
  'an explicitly requested season must win'
);

assert.strictEqual(
  PlexClient.preferredSeasonKeyFromAttributes([
    { ratingKey: 'specials', index: '0', leafCount: '2', viewedLeafCount: '0' },
    { ratingKey: 'season-1', index: '1', leafCount: '12', viewedLeafCount: '12' },
    { ratingKey: 'season-2', index: '2', leafCount: '12', viewedLeafCount: '4' }
  ], ''),
  'season-2',
  'opening a show must prefer the first regular season with unwatched episodes'
);

assert.strictEqual(
  PlexClient.preferredSeasonKeyFromAttributes([
    { ratingKey: 'specials', index: '0', leafCount: '2', viewedLeafCount: '0' },
    { ratingKey: 'season-1', index: '1', leafCount: '12', viewedLeafCount: '12' }
  ], ''),
  'season-1',
  'a completed show must fall back to its first regular season'
);

assert.strictEqual(
  PlexClient.preferredSeasonKeyFromAttributes([
    { ratingKey: 'specials', index: '0', leafCount: '2', viewedLeafCount: '0' }
  ], ''),
  'specials',
  'specials must remain usable when they are the only season'
);

assert.strictEqual(
  PlexClient.detailFromAttributes({ ratingKey: 'show-1', type: 'show', title: 'Example' }, '/plex-api', '').showRatingKey,
  'show-1',
  'top-level shows must identify themselves as their series context'
);

var playback = PlexClient.playbackFromAttributes(
  { ratingKey: '23581', type: 'episode', title: 'Daikanyama e la ragazza', viewOffset: '720000' },
  { container: 'mkv', videoCodec: 'hevc', audioCodec: 'aac' },
  { key: '/library/parts/32305/file.mkv', file: '/media/Anime/Episode 03.mkv', size: '1572864000', duration: '1470030' },
  '/plex-api',
  'token',
  'session-1',
  [
    { id: '10', streamType: '2', codec: 'aac', language: 'Japanese', selected: '1' },
    { id: '20', streamType: '3', codec: 'ass', language: 'Italiano', selected: '1' }
  ],
  [
    { type: 'credits', startTimeOffset: '1367740', endTimeOffset: '1417740', final: '0' },
    { type: 'intro', startTimeOffset: '137170', endTimeOffset: '225901' },
    { type: 'credits', startTimeOffset: '1331740', endTimeOffset: '1339740' },
    { type: 'commercial', startTimeOffset: '1', endTimeOffset: '2' },
    { type: 'intro', startTimeOffset: '500', endTimeOffset: '400' }
  ]
);

assert.strictEqual(typeof PlexClient.chaptersFromAttributes, 'function', 'the Plex client must expose chapter parsing');
var parsedChapters = PlexClient.chaptersFromAttributes([
  { index: '2', title: 'Opening', startTimeOffset: '10000', endTimeOffset: '20000', thumb: '/library/metadata/1/chapter/2' },
  { index: '1', tag: 'Prologue', startTimeOffset: '0', endTimeOffset: '10000', thumb: '/library/metadata/1/chapter/1' },
  { index: '3', title: 'Broken end', startTimeOffset: '30000', endTimeOffset: '20000', thumb: '/broken' },
  { index: '4', title: 'Broken start', startTimeOffset: '-1', endTimeOffset: '40000', thumb: '/broken' },
  { index: '5', title: 'Missing time', startTimeOffset: '', endTimeOffset: '', thumb: '/broken' }
], '/plex-api', 'token');
assert.deepStrictEqual(parsedChapters.map(function (chapter) {
  return [chapter.index, chapter.title, chapter.startTimeOffset, chapter.endTimeOffset];
}), [
  [1, 'Prologue', 0, 10000],
  [2, 'Opening', 10000, 20000]
], 'chapter parsing must validate offsets and sort Plex chapters chronologically');
assert.ok(/\/library\/metadata\/1\/chapter\/1\?X-Plex-Token=token/.test(parsedChapters[0].thumb), 'chapter thumbnails must retain local Plex authentication');
assert.deepStrictEqual(PlexClient.chaptersFromAttributes([], '/plex-api', 'token'), [], 'media without chapters must expose an empty chapter list');

var chapterPlayback = PlexClient.playbackFromAttributes(
  { ratingKey: 'chapter-media', type: 'episode', title: 'Chapter example' },
  { container: 'mkv', videoCodec: 'h264' },
  { key: '/library/parts/chapter/file.mkv', duration: '80000' },
  '/plex-api',
  'token',
  'chapter-session',
  [],
  [],
  parsedChapters
);
assert.strictEqual(chapterPlayback.chapters.length, 2, 'playback state must retain parsed Plex chapters');

assert.strictEqual(typeof PlexClient.rotateTranscodeSession, 'function', 'the Plex client must expose per-stream transcode session rotation');
var stablePlaybackSession = playback.session;
var firstTranscodeSession = PlexClient.rotateTranscodeSession(playback, 1000);
var secondTranscodeSession = PlexClient.rotateTranscodeSession(playback, 1000);
assert.strictEqual(playback.session, stablePlaybackSession, 'rotating an HLS stream must not replace the stable Plex playback session');
assert.notStrictEqual(firstTranscodeSession, secondTranscodeSession, 'every HLS rebuild must use a fresh transcode namespace even within the same millisecond');
assert.strictEqual(playback.transcodeSession, secondTranscodeSession, 'the active transcode session must remain available for keepalive requests');
var rotatedPlaybackUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, playback.options);
assert.ok(new RegExp('session=' + secondTranscodeSession).test(rotatedPlaybackUrl), 'HLS segment URLs must use the fresh transcode namespace');
assert.ok(new RegExp('transcodeSessionId=' + secondTranscodeSession).test(rotatedPlaybackUrl), 'Plex must receive the fresh transcode session identifier');
assert.ok(new RegExp('X-Plex-Session-Identifier=' + secondTranscodeSession).test(rotatedPlaybackUrl), 'HLS requests must not reuse the stable timeline session identifier');

var previousPingXhr = global.XMLHttpRequest;
var pingXhr;
global.XMLHttpRequest = function () {
  pingXhr = this;
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
};
assert.strictEqual(typeof PlexClient.pingTranscode, 'function', 'the Plex client must expose Plex transcode keepalive');
PlexClient.pingTranscode({ apiBaseUrl: '/plex-api', token: 'token' }, playback);
assert.strictEqual(pingXhr.method, 'GET', 'transcode keepalive must use GET');
assert.ok(/\/video\/:\/transcode\/universal\/ping\?/.test(pingXhr.url), 'transcode keepalive must use the Plex universal ping endpoint');
assert.ok(new RegExp('session=' + secondTranscodeSession).test(pingXhr.url), 'transcode keepalive must target the active HLS namespace');
assert.ok(/X-Plex-Token=token/.test(pingXhr.url), 'transcode keepalive must authenticate against the local Plex server');
global.XMLHttpRequest = previousPingXhr;

var playbackVersions = PlexClient.playbackVersionsFromAttributes([
  {
    media: { id: 'm0', container: 'mp4', videoCodec: 'h264', width: '1920', height: '1080', videoResolution: '1080' },
    parts: [{ part: { id: 'p0', key: '/library/parts/p0/file.mp4', file: '/media/1080.mp4', size: '1000', duration: '10000' }, streams: [] }]
  },
  {
    media: { id: 'm1', container: 'mkv', videoCodec: 'hevc', width: '3840', height: '2160', videoResolution: '4k', videoDynamicRange: 'HDR10' },
    parts: [{ part: { id: 'p1', key: '/library/parts/p1/file.mkv', file: '/media/4k.mkv', size: '2000', duration: '10000' }, streams: [
      { id: 'audio-1', streamType: '2', languageTag: 'ja', selected: '1' }
    ] }]
  }
]);
assert.strictEqual(playbackVersions.length, 2, 'every Plex Media/Part version must be retained');
assert.strictEqual(playbackVersions[1].partKey, '/library/parts/p1/file.mkv', 'a media version must retain its direct-play part URL');
assert.deepStrictEqual(playbackVersions.map(function (version) {
  return [version.mediaIndex, version.partIndex, version.partId, version.videoCodec, version.videoDynamicRange];
}), [
  [0, 0, 'p0', 'h264', ''],
  [1, 0, 'p1', 'hevc', 'HDR10']
], 'media versions must preserve Plex indexes and source facts');

assert.strictEqual(playback.directPlay, false, 'HEVC in MKV must use the Plex HLS fallback');
assert.strictEqual(playback.duration, 1470030, 'playback duration must be retained');
assert.strictEqual(playback.fileName, 'Episode 03.mkv', 'playback must expose only the media file name');
assert.strictEqual(playback.fileSize, 1572864000, 'playback must retain media file size');
assert.strictEqual(playback.partId, '', 'playback must retain the Plex part identifier when available');
assert.deepStrictEqual(playback.markers, [
  { key: 'intro:137170:225901', type: 'intro', startTimeOffset: 137170, endTimeOffset: 225901, final: false },
  { key: 'credits:1331740:1339740', type: 'credits', startTimeOffset: 1331740, endTimeOffset: 1339740, final: false },
  { key: 'credits:1367740:1417740', type: 'credits', startTimeOffset: 1367740, endTimeOffset: 1417740, final: false }
], 'playback markers must retain valid Plex intro and credits intervals in timeline order');
assert.ok(/\/video\/:\/transcode\/universal\/start\.m3u8/.test(playback.hlsUrl), 'HLS fallback URL must use the universal transcoder');
assert.ok(/path=%2Flibrary%2Fmetadata%2F23581/.test(playback.hlsUrl), 'HLS URL must target the selected metadata item');

assert.strictEqual(
  PlexClient.buildLibraryRefreshUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '7', false),
  '/plex-api/library/sections/7/refresh?X-Plex-Token=token',
  'library refresh must target the selected section'
);
assert.strictEqual(
  PlexClient.buildLibraryRefreshUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '7', true),
  '/plex-api/library/sections/7/refresh?force=1&X-Plex-Token=token',
  'full library metadata refresh must request a forced section refresh'
);
assert.strictEqual(
  PlexClient.buildMetadataRefreshUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '42'),
  '/plex-api/library/metadata/42/refresh?X-Plex-Token=token',
  'media metadata refresh must target the selected metadata item'
);
assert.strictEqual(typeof PlexClient.activityItemsFromJson, 'function', 'Plex client must expose documented server activity parsing');
assert.deepStrictEqual(PlexClient.activityItemsFromJson(JSON.stringify({
  MediaContainer: {
    size: 2,
    Activity: [
      { uuid: 'scan-1', type: 'library.update.section', title: 'Scanning TV', subtitle: 'Example Show', progress: 42, cancellable: true },
      { uuid: 'credits-1', type: 'media.generate.credits', title: 'Detecting Credits', progress: -1, cancellable: false }
    ]
  }
})), [
  { id: 'scan-1', type: 'library.update.section', title: 'Scanning TV', subtitle: 'Example Show', progress: 42, cancellable: true },
  { id: 'credits-1', type: 'media.generate.credits', title: 'Detecting Credits', subtitle: '', progress: -1, cancellable: false }
], 'Plex activities must retain identity, labels, progress and cancellation state');
assert.deepStrictEqual(PlexClient.activityItemsFromJson('{"MediaContainer":{"size":0}}'), [], 'an idle Plex server must expose an empty activity list');
var previousRefreshXhr = global.XMLHttpRequest;
var refreshXhrs = [];
global.XMLHttpRequest = function () {
  refreshXhrs.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
};
var refreshSequenceError = 'pending';
PlexClient.refreshMetadataSequence({ apiBaseUrl: '/plex-api', token: 'token' }, ['episode', 'season', 'show'], function (error) {
  refreshSequenceError = error;
});
assert.deepStrictEqual(refreshXhrs.map(function (xhr) { return [xhr.method, xhr.url]; }), [
  ['PUT', '/plex-api/library/metadata/episode/refresh?X-Plex-Token=token']
], 'metadata hierarchy refresh must begin with the current media only');
refreshXhrs[0].status = 200; refreshXhrs[0].readyState = 4; refreshXhrs[0].onreadystatechange();
refreshXhrs[1].status = 200; refreshXhrs[1].readyState = 4; refreshXhrs[1].onreadystatechange();
refreshXhrs[2].status = 200; refreshXhrs[2].readyState = 4; refreshXhrs[2].onreadystatechange();
assert.deepStrictEqual(refreshXhrs.map(function (xhr) { return xhr.url; }), [
  '/plex-api/library/metadata/episode/refresh?X-Plex-Token=token',
  '/plex-api/library/metadata/season/refresh?X-Plex-Token=token',
  '/plex-api/library/metadata/show/refresh?X-Plex-Token=token'
], 'episode metadata refresh must proceed current media, current season, then series');
assert.strictEqual(refreshSequenceError, null, 'metadata hierarchy refresh must complete after the series');
var libraryRefreshDone = false;
PlexClient.refreshLibraryMetadata({ apiBaseUrl: '/plex-api', token: 'token' }, '7', function (error) { libraryRefreshDone = !error; });
assert.strictEqual(refreshXhrs[3].method, 'POST', 'library refresh requests must use the Plex POST endpoint');
refreshXhrs[3].status = 200; refreshXhrs[3].readyState = 4; refreshXhrs[3].onreadystatechange();
assert.strictEqual(libraryRefreshDone, true, 'forced library metadata refresh must report success');
global.XMLHttpRequest = previousRefreshXhr;

var previousActivityXhr = global.XMLHttpRequest;
var activityXhr;
global.XMLHttpRequest = function () {
  activityXhr = this;
  this.headers = {};
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.setRequestHeader = function (name, value) { this.headers[name] = value; };
  this.send = function () {};
};
var loadedActivities = null;
PlexClient.loadActivities({ apiBaseUrl: '/plex-api', token: 'token' }, function (error, activities) {
  assert.ifError(error);
  loadedActivities = activities;
});
assert.strictEqual(activityXhr.method, 'GET', 'activity polling must use GET');
assert.ok(/\/activities\?X-Plex-Token=token/.test(activityXhr.url), 'activity polling must target the local PMS activities endpoint');
assert.strictEqual(activityXhr.headers.Accept, 'application/json', 'activity polling must request the documented JSON representation');
activityXhr.status = 200;
activityXhr.readyState = 4;
activityXhr.responseText = '{"MediaContainer":{"size":1,"Activity":{"uuid":"one","title":"Refreshing metadata","progress":7}}}';
activityXhr.onreadystatechange();
assert.strictEqual(loadedActivities[0].id, 'one', 'single Plex activity objects must normalize to a list');
global.XMLHttpRequest = previousActivityXhr;

assert.strictEqual(PlexClient.activityIdFromResponse({
  getResponseHeader: function (name) { return name === 'X-Plex-Activity' ? 'metadata-42' : ''; }
}), 'metadata-42', 'refresh responses must expose their Plex activity UUID');
assert.ok(/session=session-1/.test(playback.hlsUrl), 'HLS URL must carry the playback session');
assert.ok(/transcodeType=video/.test(playback.hlsUrl), 'HLS URL must identify a video transcode');
assert.ok(/transcodeSessionId=session-1/.test(playback.hlsUrl), 'HLS URL must identify the transcode session');
assert.ok(/location=lan/.test(playback.hlsUrl), 'HLS URL must identify LAN playback');
assert.ok(/fastSeek=1/.test(playback.hlsUrl), 'offset HLS sessions must make Plex jump to the requested source position');
assert.ok(
  /fastSeek=1/.test(PlexClient.buildPlaybackUrl(
    { apiBaseUrl: '/plex-api', token: 'token' },
    playback,
    Object.assign({}, playback.options, { offset: 0 })
  )),
  'HLS sessions starting from the beginning may retain fast seeking'
);
assert.ok(/X-Plex-Session-Identifier=session-1/.test(playback.hlsUrl), 'HLS URL must identify the Plex playback session');
assert.ok(/X-Plex-Client-Profile-Extra=/.test(playback.hlsUrl), 'HLS URL must describe the webOS MPEG-TS target');
assert.strictEqual(playback.options.audioStreamID, '10', 'Plex-selected audio must be inherited');
assert.strictEqual(playback.options.subtitleStreamID, '20', 'Plex-selected subtitles must be inherited');
assert.strictEqual(playback.options.offset, 720, 'the HLS stream must begin at the exact Plex resume position');
assert.strictEqual(playback.resumePosition, 720, 'the Plex view offset must be retained');
assert.strictEqual(playback.offsetBase, 720, 'the native HLS timeline must begin at the exact server offset');
assert.ok(/offset=720/.test(playback.hlsUrl), 'the initial HLS request must encode the exact resume position');
assert.ok(/audioStreamID=10/.test(playback.hlsUrl), 'selected audio must be sent to the transcoder');
assert.ok(/subtitleStreamID=20/.test(playback.hlsUrl), 'selected subtitles must be sent to the transcoder');

assert.deepStrictEqual(
  PlexClient.trackFromAttributes({ id: '12', index: '3', language: 'Italiano', languageTag: 'it-IT', languageCode: 'ita', codec: 'srt', key: '/library/streams/12', offset: '450', forced: '1', selected: '1', title: 'Forced signs' }),
  { id: '12', language: 'Italiano', languageTag: 'it', languageCode: 'it', codec: 'srt', forced: true, selected: true, title: 'Forced signs', index: 3, key: '/library/streams/12', external: true, format: 'srt', offset: 450 },
  'track metadata must retain normalized language, forced and display information'
);

var preferred = PlexClient.resolvePlaybackOptions({
  audioTracks: [
    { id: '1', languageTag: 'en', selected: true },
    { id: '2', languageTag: 'ja', selected: false }
  ],
  subtitleTracks: [
    { id: '3', languageTag: 'en', selected: false, forced: false },
    { id: '4', languageTag: 'it', selected: true, forced: false }
  ],
  options: { subtitleSize: 100, offset: 0 }
}, {
  audioLanguages: ['ja', 'en'],
  subtitleLanguages: ['it', 'en'],
  subtitleSuppressedForAudio: ['ja'],
  subtitleMode: 'always',
  videoQuality: 'original'
});
assert.strictEqual(preferred.audioStreamID, '2', 'the first available audio priority must win');
assert.strictEqual(preferred.subtitleStreamID, '', 'subtitle suppression for the selected audio language must win');

var mismatchPreferences = PlexClient.resolvePlaybackOptions({
  audioTracks: [
    { id: '1', languageTag: 'it', selected: false },
    { id: '2', languageTag: 'ja', selected: true }
  ],
  subtitleTracks: [
    { id: '3', languageTag: 'en', selected: false, forced: false },
    { id: '4', languageTag: 'it', selected: false, forced: false }
  ],
  options: { subtitleSize: 100, offset: 0 }
}, {
  audioLanguages: ['ja', 'it'],
  subtitleLanguages: ['it', 'en', 'ja'],
  subtitleSuppressedForAudio: [],
  subtitleMode: 'audio-mismatch'
});
assert.strictEqual(mismatchPreferences.audioStreamID, '2', 'Japanese audio must retain its priority');
assert.strictEqual(mismatchPreferences.subtitleStreamID, '4', 'audio mismatch must compare Japanese audio against the preferred Italian subtitle language');

var matchingPreferences = PlexClient.resolvePlaybackOptions({
  audioTracks: [{ id: '1', languageTag: 'it', selected: true }],
  subtitleTracks: [{ id: '4', languageTag: 'it', selected: false, forced: false }],
  options: { subtitleSize: 100, offset: 0 }
}, {
  audioLanguages: ['ja', 'it'],
  subtitleLanguages: ['it', 'en', 'ja'],
  subtitleSuppressedForAudio: [],
  subtitleMode: 'audio-mismatch'
});
assert.strictEqual(matchingPreferences.subtitleStreamID, '', 'matching Italian audio and subtitle language must not enable subtitles automatically');

var fallbackPreferences = PlexClient.resolvePlaybackOptions({
  audioTracks: [{ id: '1', languageTag: 'en', selected: true }],
  subtitleTracks: [{ id: '4', languageTag: 'it', selected: false, forced: true }],
  options: { subtitleSize: 120, offset: 45 }
}, {
  audioLanguages: ['ja'],
  subtitleLanguages: ['it'],
  subtitleSuppressedForAudio: [],
  subtitleMode: 'forced',
  videoQuality: '8000'
});
assert.deepStrictEqual(fallbackPreferences, {
  audioStreamID: '1', subtitleStreamID: '4', subtitleSize: 120, offset: 45, videoQuality: '8000', playbackMode: 'auto'
}, 'missing audio priorities must preserve Plex selection and forced subtitles');

var originalUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, {
  audioStreamID: '10', subtitleStreamID: '', subtitleSize: 100, offset: 0, videoQuality: 'original'
});
var limitedUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, {
  audioStreamID: '10', subtitleStreamID: '', subtitleSize: 100, offset: 0, videoQuality: '8000', videoResolution: '1920x1080'
});
assert.ok(/videoResolution=3840x2160/.test(originalUrl), 'the client must advertise a 4K ceiling');
assert.ok(!/maxVideoBitrate=/.test(originalUrl), 'original quality must not impose a bitrate ceiling');
assert.ok(/maxVideoBitrate=8000/.test(limitedUrl), 'limited quality must send the selected bitrate ceiling');
assert.ok(/videoResolution=1920x1080/.test(limitedUrl), 'the safe fallback must be able to request a 1080p ceiling');
var localSubtitleUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, {
  audioStreamID: '10', subtitleStreamID: '20', subtitleSize: 100, localSubtitleOverlay: true, offset: 0, videoQuality: 'original'
});
assert.ok(/subtitles=none/.test(localSubtitleUrl), 'locally synchronized embedded subtitles must keep the Plex video stream subtitle-free');
assert.ok(!/subtitleStreamID=20/.test(localSubtitleUrl), 'local subtitle overlays must not also burn the same stream into video');

var indexedUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, {
  audioStreamID: '10', subtitleStreamID: '', subtitleSize: 100, offset: 0, videoQuality: 'original',
  mediaIndex: 1, partIndex: 2, delivery: 'direct-stream'
});
assert.ok(/mediaIndex=1/.test(indexedUrl) && /partIndex=2/.test(indexedUrl), 'Plex HLS must target the selected media version indexes');
var directUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, {
  partKey: '/library/parts/p1/file.mkv'
}, { delivery: 'direct-play' });
assert.strictEqual(directUrl, '/plex-api/library/parts/p1/file.mkv?X-Plex-Token=token', 'Direct Play must use the selected Plex part without Universal HLS');

var forcedTranscodeUrl = PlexClient.buildPlaybackUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, {
  audioStreamID: '10', subtitleStreamID: '', subtitleSize: 100, offset: 0, videoQuality: 'original', playbackMode: 'transcode'
});
assert.ok(/directStream=0/.test(forcedTranscodeUrl), 'Force transcode must disable Plex Direct Stream');
assert.ok(/directStream=1/.test(originalUrl), 'Auto mode must retain Plex Direct Stream fallback');

assert.strictEqual(PlexClient.playbackModeFromDecisions('copy', 'copy'), 'direct-stream', 'copied audio and video must be described as Direct Stream');
assert.strictEqual(PlexClient.playbackModeFromDecisions('copy', 'transcode'), 'transcode-audio', 'audio-only conversion must be explicit');
assert.strictEqual(PlexClient.playbackModeFromDecisions('transcode', 'copy'), 'transcode-video', 'video-only conversion must be explicit');
assert.strictEqual(PlexClient.playbackModeFromDecisions('transcode', 'transcode'), 'transcode-audio-video', 'combined conversion must be explicit');

assert.deepStrictEqual(
  PlexClient.accountProfileFromJson(JSON.stringify({ locale: 'it-IT', profile: { defaultAudioLanguage: 'ja', defaultSubtitleLanguage: 'it' } })),
  { locale: 'it-IT', profile: { defaultAudioLanguage: 'ja', defaultSubtitleLanguage: 'it' } },
  'Plex account locale and playback profile must be parsed without installation-specific values'
);

var themed = PlexClient.detailFromAttributes({
  ratingKey: '8', type: 'episode', grandparentRatingKey: '4', parentRatingKey: '6', parentIndex: '1', index: '2',
  title: 'Episode', grandparentTitle: 'Show', grandparentTheme: '/library/metadata/4/theme/1'
}, '/plex-api', 'token');
assert.strictEqual(themed.themeKey, 'show:4', 'episodes in one series must share a logical theme key');
assert.ok(/\/library\/metadata\/4\/theme\/1/.test(themed.themeUrl), 'series theme URL must be exposed to the audio controller');

assert.strictEqual(PlexClient.mediaFromAttributes({
  ratingKey: '8', type: 'episode', grandparentRatingKey: '4', title: 'Episode', grandparentTitle: 'Show'
}, '/plex-api', '').themeLookupKey, 'show:4', 'home episodes must share a series-level lazy theme cache key');
assert.ok(/\/:\/scrobble/.test(PlexClient.buildWatchedUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', true)), 'watched items must use scrobble');
assert.ok(/\/:\/unscrobble/.test(PlexClient.buildWatchedUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', false)), 'unwatched items must use unscrobble');
assert.ok(/\/:\/progress\?/.test(PlexClient.buildProgressUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', 0)), 'progress reset must use the Plex progress endpoint');
assert.ok(/key=23581/.test(PlexClient.buildProgressUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', 0)) && /time=0/.test(PlexClient.buildProgressUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', 0)), 'progress reset must include the media key and zero time');
var previousMutationXhr = global.XMLHttpRequest;
var mutationXhrs = [];
global.XMLHttpRequest = function () {
  mutationXhrs.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
};
var watchedResetResult = 'pending';
PlexClient.setWatchedAndReset({ apiBaseUrl: '/plex-api', token: 'token' }, '23581', true, function (error) { watchedResetResult = error || null; });
assert.ok(/\/:\/scrobble/.test(mutationXhrs[0].url), 'watched mutation must run before progress reset');
mutationXhrs[0].status = 200; mutationXhrs[0].readyState = 4; mutationXhrs[0].onreadystatechange();
assert.ok(/\/:\/progress/.test(mutationXhrs[1].url) && /time=0/.test(mutationXhrs[1].url), 'watched mutation must explicitly reset progress to zero');
mutationXhrs[1].status = 200; mutationXhrs[1].readyState = 4; mutationXhrs[1].onreadystatechange();
assert.strictEqual(watchedResetResult, null, 'watched and progress reset must report combined success');
global.XMLHttpRequest = previousMutationXhr;
var previousGuidXhr = global.XMLHttpRequest;
var guidXhr;
global.XMLHttpRequest = function () {
  guidXhr = this;
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () { this.aborted = true; };
};
var guidRequest = PlexClient.findByGuid({ apiBaseUrl: '/plex-api', token: 'token' }, 'plex://movie/alien', function () {});
assert.ok(/\/library\/all\?/.test(guidXhr.url) && /guid=plex%3A%2F%2Fmovie%2Falien/.test(guidXhr.url), 'local Watchlist resolution must query PMS by encoded Plex GUID');
assert.ok(/includeGuids=1/.test(guidXhr.url), 'GUID resolution must request GUID metadata');
guidRequest.abort();
assert.strictEqual(guidXhr.aborted, true, 'local GUID resolution must be abortable');
global.XMLHttpRequest = previousGuidXhr;
assert.ok(/\/library\/parts\/99\?audioStreamID=10&subtitleStreamID=20&allParts=1/.test(PlexClient.buildStreamSelectionUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '99', '10', '20')), 'track selection must update the Plex media part');
var subtitleTrack = { id: '20', index: 4, codec: 'srt', format: 'srt', key: '/library/streams/20', external: true };
assert.ok(/\/library\/streams\/20\.vtt\?/.test(PlexClient.buildSubtitleStreamUrl({ apiBaseUrl: '/plex-api', token: 'token' }, subtitleTrack)), 'external subtitle preview must use the Plex stream endpoint');
assert.ok(/encoding=utf-8/.test(PlexClient.buildSubtitleStreamUrl({ apiBaseUrl: '/plex-api', token: 'token' }, subtitleTrack)) && /format=webvtt/.test(PlexClient.buildSubtitleStreamUrl({ apiBaseUrl: '/plex-api', token: 'token' }, subtitleTrack)), 'external text must request UTF-8 WebVTT');
var embeddedSubtitleUrl = PlexClient.buildSubtitleTranscodeUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, { id: '21', index: 5, codec: 'srt', external: false });
assert.ok(/\/video\/:\/transcode\/universal\/subtitles\?/.test(embeddedSubtitleUrl), 'embedded subtitle preview must use the universal subtitle endpoint');
assert.ok(/subtitleStreamID=21/.test(embeddedSubtitleUrl) && /mediaIndex=0/.test(embeddedSubtitleUrl) && /partIndex=0/.test(embeddedSubtitleUrl), 'embedded subtitle conversion must target the exact playback stream and part');
assert.ok(/format=webvtt/.test(embeddedSubtitleUrl) && /advancedSubtitles=text/.test(embeddedSubtitleUrl), 'embedded text conversion must request a browser-readable text format');
assert.ok(/\/library\/streams\/20\.vtt\?offset=-300/.test(PlexClient.buildSubtitleOffsetUrl({ apiBaseUrl: '/plex-api', token: 'token' }, '20', -300)), 'external subtitle offsets must retain their signed millisecond value');

var previousSubtitleXhr = global.XMLHttpRequest;
var subtitleXhrs = [];
global.XMLHttpRequest = function () {
  subtitleXhrs.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () { this.aborted = true; };
};
var subtitleText = null;
var subtitleRequest = PlexClient.loadSubtitleText({ apiBaseUrl: '/plex-api', token: 'token' }, playback, subtitleTrack, function (error, text) {
  assert.ifError(error);
  subtitleText = text;
});
assert.strictEqual(subtitleXhrs[0].method, 'GET', 'subtitle text must use GET');
subtitleXhrs[0].status = 200; subtitleXhrs[0].readyState = 4; subtitleXhrs[0].responseText = 'WEBVTT\n'; subtitleXhrs[0].onreadystatechange();
assert.strictEqual(subtitleText, 'WEBVTT\n', 'subtitle fetch must return the Plex text unchanged');
subtitleRequest.abort();
assert.strictEqual(subtitleXhrs[0].aborted, undefined, 'completed subtitle requests must not be aborted retroactively');
var offsetSaved = false;
PlexClient.setSubtitleOffset({ apiBaseUrl: '/plex-api', token: 'token' }, '20', -300, function (error) { offsetSaved = !error; });
assert.strictEqual(subtitleXhrs[1].method, 'PUT', 'subtitle offset persistence must use PUT');
subtitleXhrs[1].status = 200; subtitleXhrs[1].readyState = 4; subtitleXhrs[1].responseText = ''; subtitleXhrs[1].onreadystatechange();
assert.strictEqual(offsetSaved, true, 'successful Plex offset writes must complete');
var identity = null;
PlexClient.loadServerIdentity({ apiBaseUrl: '/plex-api', token: 'token' }, function (error, value) { assert.ifError(error); identity = value; });
assert.strictEqual(subtitleXhrs[2].url, '/plex-api/identity', 'server diagnostics must use the public identity endpoint without disclosing a token');
subtitleXhrs[2].status = 200; subtitleXhrs[2].readyState = 4; subtitleXhrs[2].responseText = '<MediaContainer friendlyName="Mac Mini" version="1.41.7" machineIdentifier="abcdef" />'; subtitleXhrs[2].onreadystatechange();
assert.deepStrictEqual(identity, { name: 'Mac Mini', version: '1.41.7', machineIdentifier: 'abcdef' }, 'server identity parsing must retain only diagnostic fields');
global.XMLHttpRequest = previousSubtitleXhr;
assert.ok(
  /\/video\/:\/transcode\/universal\/decision/.test(PlexClient.buildDecisionUrl({ apiBaseUrl: '/plex-api', token: 'token' }, playback, playback.options)),
  'playback must initialize the Plex transcode decision before opening HLS'
);

assert.deepStrictEqual(
  PlexClient.mediaFromAttributes({
    title: 'Alien',
    year: '1979',
    type: 'movie',
    thumb: '/library/metadata/7/thumb/1'
  }, '/plex-api', ''),
  {
    title: 'Alien',
    meta: 'Movie - 1979',
    metaKey: 'media.movieWithYear',
    metaParameters: { year: '1979' },
    year: 1979,
    image: '/plex-api/library/metadata/7/thumb/1',
    art: '/plex-api/library/metadata/7/thumb/1'
  },
  'movie metadata must work without exposing a token'
);

console.log('Plex client checks passed');
