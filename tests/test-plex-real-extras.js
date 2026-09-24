'use strict';

var assert = require('assert');
var PlexMediaMapper = require('../app/plex-media-mapper');
var fixture = require('./helpers/plex-real-fixture');
var PlexMediaDocument = require('../app/plex-media-document');

function parse(relativePath) {
  return fixture.withDomParser(function () {
    return PlexMediaDocument.parseAttributes(fixture.read(relativePath));
  });
}

(function mapsRealExtrasParentThroughProductionDetailMapper() {
  var records = parse('extras/parent.xml');
  var detail;

  assert.strictEqual(records.length, 1);
  detail = PlexMediaMapper.detailFromAttributes(records[0], '/plex-api', '');
  assert.deepStrictEqual({
    ratingKey: detail.ratingKey,
    type: detail.type,
    title: detail.title,
    subtitle: detail.subtitle,
    duration: detail.duration,
    image: detail.image,
    art: detail.art
  }, {
    ratingKey: 'fixture-rating-010',
    type: 'movie',
    title: 'Sample Film 1',
    subtitle: 'Synthetic fixture tagline',
    duration: 9297140,
    image: '/plex-api/library/metadata/fixture-rating-010/thumb/1786386198',
    art: '/plex-api/library/metadata/fixture-rating-010/art/1786386198'
  });
  assert.strictEqual(records[0].primaryExtraKey, '/library/metadata/24042',
    'the real parent response must retain the Plex primary-extra relationship');
}());

(function preservesTwoRealTrailerExtrasInPlexOrder() {
  var records = parse('extras/extras.xml');
  var items = records.map(function (attributes) {
    return PlexMediaMapper.mediaFromAttributes(attributes, '/plex-api', '');
  });

  assert.strictEqual(records.length, 2);
  assert.deepStrictEqual(records.map(function (attributes) {
    return [attributes.ratingKey, attributes.type, attributes.subtype, attributes.index];
  }), [
    ['fixture-rating-009', 'clip', 'trailer', '1'],
    ['fixture-rating-011', 'clip', 'trailer', '2']
  ], 'extras/trailers must retain the order returned by Plex');
  assert.deepStrictEqual(items.map(function (item) { return item.ratingKey; }), [
    'fixture-rating-009',
    'fixture-rating-011'
  ]);
  assert.deepStrictEqual(items.map(function (item) { return item.duration; }), [133000, 30000]);
}());
