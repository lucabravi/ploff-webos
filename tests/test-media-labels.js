'use strict';

var assert = require('assert');
var I18n = require('../shell/i18n');
var MediaLabels = require('../shell/media-labels');

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

assert.strictEqual(MediaLabels.meta({ meta: 'Custom server label' }, translate('en')), 'Custom server label', 'unknown Plex metadata must remain usable');
assert.strictEqual(MediaLabels.title({ titleKey: 'media.untitled' }, translate('it')), 'Senza titolo', 'missing titles must use a localized fallback');

console.log('Media label checks passed');
