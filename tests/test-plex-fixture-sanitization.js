'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var fixtureRoot = path.join(__dirname, 'fixtures', 'plex-real');
var xmlFiles = [];

function collectXmlFiles(directory) {
  fs.readdirSync(directory).forEach(function (name) {
    var fullPath = path.join(directory, name);
    if (fs.statSync(fullPath).isDirectory()) {
      collectXmlFiles(fullPath);
    } else if (/\.xml$/i.test(name)) {
      xmlFiles.push(fullPath);
    }
  });
}

function attribute(tag, name) {
  var match = tag.match(new RegExp('(?:^|\\s)' + name + "='([^']*)'"));
  return match ? match[1] : '';
}

collectXmlFiles(fixtureRoot);
assert.ok(xmlFiles.length > 0, 'sanitization check must inspect Plex XML fixtures');

xmlFiles.forEach(function (filePath) {
  var xml = fs.readFileSync(filePath, 'utf8');
  var mediaTags = xml.match(/<(?:Video|Directory)\b[^>]*>/g) || [];

  mediaTags.forEach(function (tag) {
    var title = attribute(tag, 'title');
    assert.ok(/^(?:Sample (?:Series|Film|Extra|Media|Collection)(?: \d+)?|Episode \d+|Season \d+|All episodes)$/.test(title),
      path.relative(fixtureRoot, filePath) + ' must use synthetic media titles');
  });

  (xml.match(/<[A-Za-z][^>]*>/g) || []).forEach(function (tag) {
    var tagName = (tag.match(/^<([A-Za-z][\w:-]*)/) || [])[1] || '';
    var summary = attribute(tag, 'summary');
    var originalTitle = attribute(tag, 'originalTitle');
    var imageAlt = attribute(tag, 'alt');
    var mediaPath = attribute(tag, 'file');
    var locationPath = attribute(tag, 'path');
    var parentTitle = attribute(tag, 'parentTitle');
    var grandparentTitle = attribute(tag, 'grandparentTitle');
    var title1 = attribute(tag, 'title1');
    var title2 = attribute(tag, 'title2');
    var containerTitle = attribute(tag, 'title');
    var slug = attribute(tag, 'slug');
    var parentSlug = attribute(tag, 'parentSlug');
    var grandparentSlug = attribute(tag, 'grandparentSlug');
    var titleSort = attribute(tag, 'titleSort');
    var tagline = attribute(tag, 'tagline');
    var studio = attribute(tag, 'studio');
    var label = attribute(tag, 'tag');
    var role = attribute(tag, 'role');

    if (summary) { assert.strictEqual(summary, 'Synthetic fixture description.'); }
    if (originalTitle) { assert.strictEqual(originalTitle, 'Synthetic original title'); }
    if (imageAlt) { assert.strictEqual(imageAlt, 'Synthetic media artwork'); }
    if (parentTitle) { assert.ok(/^Sample Series$|^Season \d+$/.test(parentTitle)); }
    if (grandparentTitle) { assert.strictEqual(grandparentTitle, 'Sample Series'); }
    if (slug) { assert.strictEqual(slug, 'sample-media'); }
    if (parentSlug || grandparentSlug) { assert.strictEqual(parentSlug || grandparentSlug, 'sample-series'); }
    if (titleSort) { assert.ok(/^(?:Sample|Episode|Season)\b/.test(titleSort)); }
    if (tagline) { assert.strictEqual(tagline, 'Synthetic fixture tagline'); }
    if (studio) { assert.strictEqual(studio, 'Sample Studio'); }
    if (tagName === 'Collection') { assert.strictEqual(label, 'Sample Collection'); }
    if (tagName === 'Role') {
      assert.ok(/^Performer \d+$/.test(label));
      if (role) { assert.ok(/^Character \d+$/.test(role)); }
    }
    if (tagName === 'MediaContainer') {
      if (title1) { assert.strictEqual(title1, 'Sample Series'); }
      if (title2) { assert.strictEqual(title2, 'Sample Series'); }
      if (containerTitle) { assert.strictEqual(containerTitle, 'Sample Playlist'); }
    }
    if (mediaPath) {
      assert.ok(/\/fixtures\/media\/fixture-media-[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(mediaPath),
        path.relative(fixtureRoot, filePath) + ' must not retain media filenames');
    }
    if (locationPath) {
      assert.ok(/^\/fixtures\/media\/fixture-media-[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(locationPath));
    }
    assert.ok(!/\/people\/(?!fixture-person-)[^/]+/.test(tag),
      path.relative(fixtureRoot, filePath) + ' must not retain identifying person artwork references');
  });
});

console.log('Plex fixture sanitization checks passed');
