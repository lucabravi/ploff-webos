'use strict';

var fs = require('fs');
var path = require('path');
var DOMParser = require('@xmldom/xmldom').DOMParser;
var fixtureRoot = path.join(__dirname, '..', 'fixtures', 'plex-real');

function read(relativePath) {
  return fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8');
}

function withDomParser(callback) {
  var previousDomParser = global.DOMParser;
  try {
    global.DOMParser = DOMParser;
    return callback();
  } finally {
    global.DOMParser = previousDomParser;
  }
}

module.exports = {
  read: read,
  withDomParser: withDomParser
};
