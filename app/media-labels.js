(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaLabels = factory();
  }
}(this, function () {
  'use strict';

  function localized(item, property, translate) {
    var key = item && item[property + 'Key'];
    var fallback = item && item[property];
    if (key && translate) { return translate(key, item[property + 'Parameters'] || {}); }
    return String(fallback || '');
  }

  function title(item, translate) { return localized(item, 'title', translate); }
  function meta(item, translate) { return localized(item, 'meta', translate); }
  function detail(item, translate) { return localized(item, 'detail', translate); }

  function episodeParts(item, translate) {
    var detailValue = detail(item, translate);
    var match = /^E0*([0-9]+)(?:\s+-\s+)?(.*)$/.exec(detailValue);
    var hasSeason = !!(item && item.metaParameters && item.metaParameters.number !== undefined);
    var season = Number(hasSeason ? item.metaParameters.number : 0);
    var episodeLabel;
    if (!match) { return null; }
    episodeLabel = 'E' + (Number(match[1]) < 10 ? '0' : '') + Number(match[1]);
    if (!hasSeason || isNaN(season) || (item && item.metaKey !== 'media.season')) {
      if (!meta(item, translate)) { return null; }
      return { meta: meta(item, translate) + ' - ' + episodeLabel, detail: match[2] || '' };
    }
    return {
      meta: 'S' + (season < 10 ? '0' : '') + season + ' - ' + episodeLabel,
      detail: match[2] || ''
    };
  }

  function cardMeta(item, translate) {
    var episode = episodeParts(item, translate);
    var value;
    if (item && item.type === 'show') {
      value = translate ? translate('media.show') : meta(item, translate);
      return value + (item.year ? ' - ' + item.year : '');
    }
    return episode ? episode.meta : meta(item, translate);
  }

  function cardDetail(item, translate) {
    var episode = episodeParts(item, translate);
    var parts = [];
    if (item && item.type === 'show') {
      if (Number(item.seasonCount) > 0) {
        parts.push(translate ? translate(Number(item.seasonCount) === 1 ? 'media.seasonCountOne' : 'media.seasonCount', { count: Number(item.seasonCount) }) : String(item.seasonCount));
      }
      if (item.genre) { parts.push(String(item.genre)); }
      return parts.join(' - ');
    }
    if (item && item.type === 'movie' && item.genre) { return String(item.genre); }
    return episode ? episode.detail : detail(item, translate);
  }

  function description(item, translate) {
    return [title(item, translate), meta(item, translate), detail(item, translate)].filter(function (value) {
      return !!value;
    }).join(', ');
  }

  return {
    cardDetail: cardDetail,
    cardMeta: cardMeta,
    description: description,
    detail: detail,
    meta: meta,
    title: title
  };
}));
