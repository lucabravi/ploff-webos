'use strict';

function xmlResponse(route, body, delay) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
        body: body
      }));
    }, Math.max(0, Number(delay) || 0));
  });
}

function sectionsXml() {
  return '<MediaContainer size="2">' +
    '<Directory key="1" title="Anime" type="show" uuid="fixture-anime" />' +
    '<Directory key="2" title="Film" type="movie" uuid="fixture-film" />' +
    '</MediaContainer>';
}

function videoXml(title, ratingKey, sectionKey) {
  return '<MediaContainer size="1"><Video type="movie" ratingKey="' + ratingKey +
    '" guid="plex://movie/' + ratingKey + '" title="' + title + '" year="2024" duration="600000"' +
    ' librarySectionID="' + sectionKey + '" librarySectionTitle="Anime" thumb="/library/metadata/' +
    ratingKey + '/thumb" art="/library/metadata/' + ratingKey + '/art" /></MediaContainer>';
}

function installMockPlex(page, options) {
  var values = options || {};
  var secondaryDelay = Number(values.secondaryDelay || 0);
  return page.route('**/mock/**', function (route) {
    var url = new URL(route.request().url());
    var match = url.pathname.match(/\/mock\/([^/]+)(\/.*)?$/);
    var server = match ? match[1] : 'primary';
    var endpoint = match && match[2] ? match[2] : '/';
    var delay = server === 'secondary' ? secondaryDelay : 0;
    var body;
    if (endpoint === '/identity') {
      body = '<MediaContainer machineIdentifier="fixture-' + server + '" version="1.43.3" />';
    } else if (endpoint === '/library/sections') {
      body = sectionsXml();
    } else if (/\/recentlyAdded$/.test(endpoint)) {
      body = videoXml(server === 'secondary' ? 'Secondary sample' : 'Primary sample', server + '-recent', '1');
    } else if (endpoint === '/hubs/continueWatching/items') {
      body = videoXml(server === 'secondary' ? 'Secondary continue' : 'Primary continue', server + '-continue', '1');
    } else if (/^\/hubs\/sections\//.test(endpoint)) {
      body = '<MediaContainer size="0" />';
    } else {
      body = '<MediaContainer size="0" />';
    }
    return xmlResponse(route, body, delay);
  });
}

module.exports = { installMockPlex: installMockPlex };
