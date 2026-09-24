'use strict';

var assert = require('assert');
var MultiServerMedia = require('../app/multi-server-media');

var primary = { serverMachineIdentifier: 'server-a', serverName: 'Primary', primary: true };
var secondary = { serverMachineIdentifier: 'server-b', serverName: 'Shared', primary: false };

var primaryCopy = MultiServerMedia.decorateItem({ ratingKey: '42', guid: 'plex://movie/same', librarySectionID: '1', title: 'Same' }, primary);
var secondaryCopy = MultiServerMedia.decorateItem({ ratingKey: '42', guid: 'plex://movie/same', librarySectionID: '9', title: 'Same' }, secondary);
var externalOnly = MultiServerMedia.decorateItem({ ratingKey: '42', guid: 'plex://movie/external', librarySectionID: '9', title: 'External' }, secondary);

assert.strictEqual(primaryCopy.sourceId, 'server-a|1');
assert.strictEqual(secondaryCopy.sourceId, 'server-b|9');
assert.strictEqual(primaryCopy.serverMachineIdentifier, 'server-a');
assert.strictEqual(MultiServerMedia.serverScopedIdentity(primaryCopy), 'server-a|rating:42');
assert.strictEqual(MultiServerMedia.serverScopedIdentity(externalOnly), 'server-b|rating:42', 'equal rating keys on different PMSes must remain distinct');
assert.strictEqual(MultiServerMedia.globalIdentity(primaryCopy), 'guid:plex://movie/same', 'GUID must be the global dedupe identity');

var search = MultiServerMedia.mergeRanked([
  { server: primary, items: [primaryCopy, { ratingKey: '100', guid: 'plex://movie/primary-2', serverMachineIdentifier: 'server-a', title: 'Primary 2' }] },
  { server: secondary, items: [secondaryCopy, externalOnly, { ratingKey: '101', guid: 'plex://movie/external-2', serverMachineIdentifier: 'server-b', title: 'External 2' }] }
], 10);
assert.deepStrictEqual(search.map(function (item) { return item.title; }), ['Same', 'External', 'Primary 2', 'External 2'], 'ranked merge must round-robin primary first while deduping the same GUID');
assert.strictEqual(search[0].serverMachineIdentifier, 'server-a', 'primary copy must win a duplicate GUID');
assert.strictEqual(search[0].sourceVariants.length, 2, 'ranked duplicate media must retain every server variant for failover');
assert.deepStrictEqual(search[0].sourceVariants.map(function (variant) { return variant.serverMachineIdentifier; }).sort(), ['server-a', 'server-b'], 'ranked duplicate media must retain both PMS owners');
var limitedSearch = MultiServerMedia.mergeRanked([
  { server: primary, items: [primaryCopy] },
  { server: secondary, items: [secondaryCopy] }
], 1);
assert.strictEqual(limitedSearch.length, 1, 'ranked merge must still honor its visible item limit');
assert.strictEqual(limitedSearch[0].sourceVariants.length, 2, 'ranked merge must retain duplicate PMS variants even when the visible limit is already full');

var continueItems = MultiServerMedia.mergeContinue([
  { server: primary, items: [
    MultiServerMedia.decorateItem({ ratingKey: '1', guid: 'plex://episode/a', title: 'A', lastViewedAt: 100 }, primary),
    MultiServerMedia.decorateItem({ ratingKey: '2', guid: 'plex://episode/b', title: 'B', lastViewedAt: 300 }, primary)
  ] },
  { server: secondary, items: [
    MultiServerMedia.decorateItem({ ratingKey: '8', guid: 'plex://episode/a', title: 'A secondary', lastViewedAt: 400 }, secondary),
    MultiServerMedia.decorateItem({ ratingKey: '9', guid: 'plex://episode/c', title: 'C', updatedAt: 200 }, secondary)
  ] }
], 12);
assert.deepStrictEqual(continueItems.map(function (item) { return item.title; }), ['A secondary', 'B', 'C'], 'Continue Watching must select the newest duplicate copy and sort by activity');
assert.strictEqual(continueItems[0].serverMachineIdentifier, 'server-b', 'Continue Watching must retain the newest copy as the canonical progress record');
assert.strictEqual(continueItems[0].sourceVariants.length, 2, 'Continue Watching duplicates must retain alternate PMS variants for failover');
assert.deepStrictEqual(continueItems[0].sourceVariants.map(function (variant) { return variant.serverMachineIdentifier; }).sort(), ['server-a', 'server-b'], 'Continue Watching must retain both PMS owners');
assert.strictEqual(MultiServerMedia.activityTimestamp({ lastViewedAt: 0, updatedAt: 22, addedAt: 10 }), 22);

var playlistA = MultiServerMedia.decorateContainer({ ratingKey: '7', title: 'Favorites' }, primary);
var playlistB = MultiServerMedia.decorateContainer({ ratingKey: '7', title: 'Favorites' }, secondary);
assert.notStrictEqual(MultiServerMedia.serverScopedIdentity(playlistA), MultiServerMedia.serverScopedIdentity(playlistB), 'playlist ratingKey collisions across PMSes must remain distinct');

console.log('Multi-server media checks passed');

var mergedCopy = MultiServerMedia.mergeSourceVariants(primaryCopy, secondaryCopy);
var selectedSecondary = MultiServerMedia.selectSourceVariant(mergedCopy, 'server-b');
assert.strictEqual(selectedSecondary.serverMachineIdentifier, 'server-b', 'preferred source variant must replace the media owner');
assert.strictEqual(selectedSecondary.ratingKey, '42', 'preferred source variant must preserve its own ratingKey');
assert.strictEqual(selectedSecondary.guid, 'plex://movie/same', 'preferred source variant must preserve canonical media GUID');
assert.strictEqual(selectedSecondary.sourceVariants.length, 2, 'selecting one source must retain alternative source variants');
assert.strictEqual(MultiServerMedia.selectSourceVariant(mergedCopy, 'missing').serverMachineIdentifier, 'server-a', 'missing preferred source must retain canonical copy');

var artworkPrimary = MultiServerMedia.decorateItem({ ratingKey: 'art-a', guid: 'plex://movie/art', image: '/a-thumb.jpg', art: '/a-art.jpg', thumb: '/a-small.jpg', librarySectionID: '1' }, primary);
var artworkSecondary = MultiServerMedia.decorateItem({ ratingKey: 'art-b', guid: 'plex://movie/art', image: '/b-thumb.jpg', art: '/b-art.jpg', thumb: '/b-small.jpg', librarySectionID: '9' }, secondary);
var artworkMerged = MultiServerMedia.mergeSourceVariants(artworkSecondary, artworkPrimary);
var artworkSelected = MultiServerMedia.selectSourceVariant(artworkMerged, 'server-a');
assert.strictEqual(artworkSelected.image, '/a-thumb.jpg', 'switching PMS variants must use the selected source poster path');
assert.strictEqual(artworkSelected.art, '/a-art.jpg', 'switching PMS variants must use the selected source backdrop path');
assert.strictEqual(artworkSelected.thumb, '/a-small.jpg', 'switching PMS variants must preserve source-specific thumbnail paths');

var additionalSecondary = MultiServerMedia.decorateItem({ ratingKey: 'other-b', guid: 'plex://movie/art', librarySectionID: '10' }, secondary);
var sameServerCopies = MultiServerMedia.mergeSourceVariants(artworkMerged, additionalSecondary);
assert.strictEqual(MultiServerMedia.selectSourceVariant(sameServerCopies, 'server-b', 'other-b').ratingKey, 'other-b',
  'an exact variant projection must distinguish multiple ratingKeys on the same PMS');
assert.strictEqual(MultiServerMedia.selectSourceVariant(sameServerCopies, 'server-b').ratingKey, 'art-b',
  'the existing machine-only projection remains compatible');

(function mergedVariantsStayLightweight() {
  var heavyPrimary = MultiServerMedia.decorateItem({ ratingKey: 'heavy-a', guid: 'plex://movie/heavy', librarySectionID: '1',
    title: 'Heavy', summary: 'Primary summary', media: [{ id: 'primary-media' }] }, primary);
  var heavySecondary = MultiServerMedia.decorateItem({ ratingKey: 'heavy-b', guid: 'plex://movie/heavy', librarySectionID: '9',
    title: 'Heavy', summary: 'Secondary summary', media: [{ id: 'secondary-media' }] }, secondary);
  var heavyMerged = MultiServerMedia.mergeSourceVariants(heavyPrimary, heavySecondary);
  heavyMerged.sourceVariants.forEach(function (variant) {
    assert.strictEqual(variant.summary, undefined, 'source variants must not retain duplicate media summaries');
    assert.strictEqual(variant.media, undefined, 'source variants must not retain duplicate technical media payloads');
    assert.strictEqual(variant.title, undefined, 'source variants must retain routing metadata rather than duplicate canonical presentation data');
  });
}());

(function projectionDoesNotBorrowMissingSourceFieldsFromAnotherCopy() {
  var b = MultiServerMedia.decorateItem({ ratingKey: 'b-sparse', guid: 'plex://movie/sparse', type: 'movie', title: 'Shared title',
    librarySectionID: '9', image: '/b-poster', art: '/b-art', thumb: '/b-thumb' },
    { serverMachineIdentifier: 'server-b', serverName: 'B' });
  var a = MultiServerMedia.decorateItem({ ratingKey: 'a-sparse', guid: b.guid, type: 'movie' }, { serverMachineIdentifier: 'server-a' });
  var item = MultiServerMedia.mergeSourceVariants(b, a);
  var selected = MultiServerMedia.selectSourceVariant(item, 'server-a');
  ['image', 'art', 'thumb', 'serverName', 'sourceId', 'librarySectionID'].forEach(function (field) {
    assert.strictEqual(selected[field], '', 'missing ' + field + ' on A must not retain B data');
  });
  assert.strictEqual(selected.ratingKey, 'a-sparse');
  assert.strictEqual(selected.title, 'Shared title');
  assert.strictEqual(selected.guid, b.guid);
  assert.strictEqual(item.image, '/b-poster', 'projection must not mutate the aggregate');
}());
