(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlexMediaDocument = factory(); }
}(this, function () {
  'use strict';

  /** @returns {Object<string, string>} */
  function attributesFromNode(node) {
    /** @type {Object<string, string>} */
    var result = {};
    var index;
    var attribute;
    for (index = 0; index < node.attributes.length; index += 1) {
      attribute = node.attributes[index];
      result[attribute.name] = attribute.value;
    }
    for (index = 0; index < node.childNodes.length; index += 1) {
      if (node.childNodes[index].nodeType === 1 && node.childNodes[index].nodeName === 'Genre') {
        result.genre = node.childNodes[index].getAttribute('tag') || '';
        break;
      }
    }
    return result;
  }

  function parseXmlDocument(xmlText, errorMessage) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(xmlText, 'application/xml');
    if (documentNode.getElementsByTagName('parsererror').length) {
      throw new Error(errorMessage || 'Invalid Plex XML response');
    }
    return documentNode;
  }

  function attributesFromDocument(documentNode) {
    var candidates = documentNode.documentElement.childNodes;
    var items = [];
    var index;
    var node;
    for (index = 0; index < candidates.length; index += 1) {
      node = candidates[index];
      if (node.nodeType === 1 && (node.nodeName === 'Video' || node.nodeName === 'Directory' || node.nodeName === 'Playlist')) {
        items.push(attributesFromNode(node));
      }
    }
    return items;
  }

  function parseAttributes(xmlText) {
    return attributesFromDocument(parseXmlDocument(xmlText));
  }

  function fromVideoNode(videoNode, documentNode) {
    var mediaNodes = videoNode ? videoNode.getElementsByTagName('Media') : [];
    var mediaEntries = [];
    var groups = [];
    var mediaIndex;
    var partIndex;
    var streamIndex;
    for (mediaIndex = 0; mediaIndex < mediaNodes.length; mediaIndex += 1) {
      var mediaEntry = {
        node: mediaNodes[mediaIndex],
        media: attributesFromNode(mediaNodes[mediaIndex]),
        parts: []
      };
      var group = { media: mediaEntry.media, parts: [] };
      var partNodes = mediaNodes[mediaIndex].getElementsByTagName('Part');
      for (partIndex = 0; partIndex < partNodes.length; partIndex += 1) {
        var streams = [];
        var streamNodes = partNodes[partIndex].getElementsByTagName('Stream');
        for (streamIndex = 0; streamIndex < streamNodes.length; streamIndex += 1) {
          streams.push(attributesFromNode(streamNodes[streamIndex]));
        }
        var partEntry = {
          node: partNodes[partIndex],
          part: attributesFromNode(partNodes[partIndex]),
          streams: streams
        };
        mediaEntry.parts.push(partEntry);
        group.parts.push({ part: partEntry.part, streams: streams });
      }
      mediaEntries.push(mediaEntry);
      groups.push(group);
    }
    return {
      documentNode: documentNode,
      videoNode: videoNode,
      video: videoNode ? attributesFromNode(videoNode) : {},
      mediaEntries: mediaEntries,
      groups: groups
    };
  }

  function fromDocument(documentNode) {
    var videoNode = documentNode && documentNode.getElementsByTagName ? documentNode.getElementsByTagName('Video')[0] || null : null;
    return fromVideoNode(videoNode, documentNode);
  }

  function parse(xmlText, errorMessage) {
    return fromDocument(parseXmlDocument(xmlText, errorMessage));
  }

  return {
    attributesFromNode: attributesFromNode,
    attributesFromDocument: attributesFromDocument,
    fromDocument: fromDocument,
    fromVideoNode: fromVideoNode,
    parse: parse,
    parseAttributes: parseAttributes,
    parseXmlDocument: parseXmlDocument
  };
}));
