'use strict';

var assert = require('assert');
var PlexMediaDocument = require('../app/plex-media-document');

assert.strictEqual(typeof PlexMediaDocument.attributesFromDocument, 'function',
  'generic top-level Plex item mapping must be owned by PlexMediaDocument');
assert.strictEqual(typeof PlexMediaDocument.parseAttributes, 'function',
  'generic Plex XML attribute parsing must be owned by PlexMediaDocument');

function element(name, attributes, children) {
  var source = attributes || {};
  var childNodes = children || [];
  return {
    nodeType: 1,
    nodeName: name,
    attributes: Object.keys(source).map(function (key) { return { name: key, value: String(source[key]) }; }),
    childNodes: childNodes,
    getAttribute: function (key) { return source[key] === undefined ? null : String(source[key]); },
    getElementsByTagName: function (tagName) {
      var result = [];
      childNodes.forEach(function visit(child) {
        if (!child || child.nodeType !== 1) { return; }
        if (child.nodeName === tagName) { result.push(child); }
        result = result.concat(child.getElementsByTagName(tagName));
      });
      return result;
    }
  };
}

(function parsesOneAuthoritativeMediaPartStreamTree() {
  var part = element('Part', { id: 'part-1', key: '/library/parts/1/file.mkv' }, [
    element('Stream', { id: 'audio-1', streamType: '2', codec: 'aac' }),
    element('Stream', { id: 'subtitle-1', streamType: '3', codec: 'srt' })
  ]);
  var video = element('Video', { ratingKey: '42', title: 'Example' }, [
    element('Media', { id: 'media-1', container: 'mkv' }, [part])
  ]);
  var root = element('MediaContainer', {}, [video]);
  var previousDomParser = global.DOMParser;
  var parsed;

  global.DOMParser = function () {
    this.parseFromString = function () {
      return {
        documentElement: root,
        getElementsByTagName: function (tagName) {
          if (tagName === 'parsererror') { return []; }
          if (tagName === 'Video') { return [video]; }
          return root.getElementsByTagName(tagName);
        }
      };
    };
  };

  parsed = PlexMediaDocument.parse('<xml/>', 'bad media XML');
  assert.strictEqual(parsed.video.ratingKey, '42');
  assert.strictEqual(parsed.groups.length, 1);
  assert.strictEqual(parsed.groups[0].media.id, 'media-1');
  assert.strictEqual(parsed.groups[0].parts.length, 1);
  assert.deepStrictEqual(parsed.groups[0].parts[0].streams.map(function (stream) { return stream.id; }), ['audio-1', 'subtitle-1']);
  assert.strictEqual(parsed.mediaEntries[0].parts[0].node, part, 'parser must retain DOM nodes required by playback URL selection');

  global.DOMParser = previousDomParser;
}());

(function preservesGenreAttributeExtraction() {
  var genre = element('Genre', { tag: 'Drama' }, []);
  var video = element('Video', { ratingKey: '7', title: 'Film' }, [genre]);
  assert.deepStrictEqual(PlexMediaDocument.attributesFromNode(video), {
    ratingKey: '7',
    title: 'Film',
    genre: 'Drama'
  });
}());

console.log('Plex media document checks passed');
