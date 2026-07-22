'use strict';

var assert = require('assert');
var I18n = require('../app/i18n');
var MediaLabels = require('../app/media-labels');

function translate(locale) {
  return function (key, parameters) { return I18n.t(locale, key, parameters); };
}

var episode = {
  title: 'Example Show',
  meta: 'Stagione 4',
  metaKey: 'media.season',
  metaParameters: { number: 4 },
  detail: 'E02 - A New Day'
};

assert.strictEqual(MediaLabels.title(episode, translate('en')), 'Example Show', 'server titles must remain unchanged');
assert.strictEqual(MediaLabels.meta(episode, translate('en')), 'Season 4', 'semantic season metadata must follow the English UI language');
assert.strictEqual(MediaLabels.meta(episode, translate('it')), 'Stagione 4', 'semantic season metadata must follow the Italian UI language');
assert.strictEqual(MediaLabels.detail(episode, translate('en')), 'E02 - A New Day', 'language-neutral episode details must remain unchanged');
assert.strictEqual(MediaLabels.cardMeta(episode, translate('it')), 'S04 - E02', 'episode cards must use compact season and episode numbering');
assert.strictEqual(MediaLabels.cardDetail(episode, translate('it')), 'A New Day', 'episode cards must place the episode title on its own line');
assert.strictEqual(MediaLabels.cardMeta({ meta: 'Speciali', detail: 'E01 - OVA' }, translate('it')), 'Speciali - E01', 'special episodes must retain their localized season label');
assert.strictEqual(MediaLabels.cardDetail({ meta: 'Speciali', detail: 'E01 - OVA' }, translate('it')), 'OVA', 'special episode titles must remain on their own line');
assert.strictEqual(
  MediaLabels.description(episode, translate('en')),
  'Example Show, Season 4, E02 - A New Day',
  'accessible media descriptions must use the same localized labels shown on screen'
);

var season = {
  title: 'Example Show',
  detail: '12 episodi',
  detailKey: 'media.episodeCount',
  detailParameters: { count: 12 }
};
assert.strictEqual(MediaLabels.detail(season, translate('en')), '12 episodes', 'episode counts must be localized');

var show = {
  type: 'show',
  title: 'Example Show',
  year: 2020,
  seasonCount: 5,
  genre: 'Animation',
  metaKey: 'media.show'
};
assert.strictEqual(MediaLabels.cardMeta(show, translate('en')), 'TV Show - 2020', 'show cards must include their year');
assert.strictEqual(MediaLabels.cardDetail(show, translate('en')), '5 seasons - Animation', 'show cards must include season count and primary genre');
assert.strictEqual(MediaLabels.cardMeta(show, translate('it')), 'Serie TV - 2020', 'show card metadata must remain localized');
assert.strictEqual(MediaLabels.cardDetail(show, translate('it')), '5 stagioni - Animation', 'show season counts must remain localized');
assert.strictEqual(MediaLabels.cardDetail({ type: 'show', seasonCount: 1, genre: 'Drama' }, translate('en')), '1 season - Drama', 'single-season shows must use singular grammar');

var movie = { type: 'movie', title: 'Example Movie', year: 2025, genre: 'Animation', metaKey: 'media.movieWithYear', metaParameters: { year: 2025 } };
assert.strictEqual(MediaLabels.cardMeta(movie, translate('it')), 'Film - 2025', 'movie cards must retain localized type and year');
assert.strictEqual(MediaLabels.cardDetail(movie, translate('it')), 'Animation', 'movie cards must show their primary genre');

var collection = { type: 'collection', title: 'Favorites', childCount: 4, metaKey: 'media.titleCount', metaParameters: { count: 4 } };
assert.strictEqual(MediaLabels.cardMeta(collection, translate('en')), '4 titles', 'container labels must use the centralized formatter');

assert.strictEqual(MediaLabels.meta({ meta: 'Custom server label' }, translate('en')), 'Custom server label', 'unknown Plex metadata must remain usable');
assert.strictEqual(MediaLabels.title({ titleKey: 'media.untitled' }, translate('it')), 'Senza titolo', 'missing titles must use a localized fallback');

console.log('Media label checks passed');
