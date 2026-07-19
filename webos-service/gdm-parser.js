'use strict';

function parseHeaders(text) {
  var lines = String(text || '').split(/\r?\n/);
  var headers = {};
  var index;
  var separator;
  var key;
  for (index = 1; index < lines.length; index += 1) {
    separator = lines[index].indexOf(':');
    if (separator < 1) { continue; }
    key = lines[index].slice(0, separator).toLowerCase();
    headers[key] = lines[index].slice(separator + 1).replace(/^\s+|\s+$/g, '');
  }
  return headers;
}

function parse(payload, address) {
  var headers = parseHeaders(payload);
  var port;
  if (String(headers['content-type'] || '').toLowerCase() !== 'plex/media-server') { return null; }
  port = Number(headers.port || 32400);
  if (!address || !isFinite(port) || port < 1 || port > 65535) { return null; }
  return {
    name: headers.name || address,
    uri: 'http://' + address + ':' + port,
    machineIdentifier: headers['resource-identifier'] || '',
    version: headers.version || '',
    source: 'gdm'
  };
}

module.exports = { parse: parse, parseHeaders: parseHeaders };
