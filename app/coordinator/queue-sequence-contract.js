(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffQueueSequenceContract = factory();
  }
}(this, function () {
  'use strict';

  var ADJACENT_STATES = {
    available: true,
    unavailable: true,
    resolving: true,
    'confirmation-required': true
  };

  function occurrenceIdentity(originId, absoluteIndex, ratingKey) {
    if (!originId || !isFinite(Number(absoluteIndex)) || !ratingKey) {
      throw new Error('Occurrence identity requires origin, absolute index, and media identity');
    }
    return String(originId) + ':' + String(Number(absoluteIndex)) + ':' + String(ratingKey);
  }

  function seriesOccurrenceIdentity(originId, seasonNumber, episodeNumber, ratingKey) {
    if (!originId || !isFinite(Number(seasonNumber)) || !isFinite(Number(episodeNumber)) || !ratingKey) {
      throw new Error('Series occurrence identity requires origin, season, episode, and media identity');
    }
    return String(originId) + ':s' + String(Number(seasonNumber)) + ':e' + String(Number(episodeNumber)) + ':' + String(ratingKey);
  }

  function sameOccurrence(left, right) {
    return !!(left && right && left.occurrenceId && right.occurrenceId &&
      String(left.occurrenceId) === String(right.occurrenceId));
  }

  function isPlayable(item) {
    return !!(item && item.ratingKey && (item.type === 'episode' || item.type === 'movie'));
  }

  function adjacentState(state, target, confirmation) {
    /** @type {{state:string, occurrenceId?:string, absoluteIndex?:number, seasonNumber?:number, episodeNumber?:number, seasonKey?:string, item?:any, confirmation?:any}} */
    var result;
    if (!ADJACENT_STATES[state]) { throw new Error('Unknown adjacent state: ' + state); }
    result = { state: state };
    if (state === 'available') {
      if (!target || !target.occurrenceId) {
        throw new Error('Available adjacent target requires an occurrence identity');
      }
      if (!isPlayable(target.item)) {
        throw new Error('Available adjacent target requires a playable item');
      }
      result.occurrenceId = String(target.occurrenceId);
      if (target.absoluteIndex !== undefined) { result.absoluteIndex = Number(target.absoluteIndex); }
      if (target.seasonNumber !== undefined) { result.seasonNumber = Number(target.seasonNumber); }
      if (target.episodeNumber !== undefined) { result.episodeNumber = Number(target.episodeNumber); }
      if (target.seasonKey !== undefined) { result.seasonKey = String(target.seasonKey); }
      result.item = target.item;
    } else if (state === 'confirmation-required') {
      if (!confirmation || !confirmation.kind) {
        throw new Error('Confirmation-required state requires a gap descriptor');
      }
      result.confirmation = confirmation;
    }
    return result;
  }

  function seriesScope(origin) {
    return Number(origin && origin.seasonNumber) === 0 ? 'specials' : 'regular';
  }

  function seasonInScope(scope, seasonNumber) {
    var number = Number(seasonNumber);
    return scope === 'specials' ? number === 0 : scope === 'regular' && number > 0;
  }

  return {
    occurrenceIdentity: occurrenceIdentity,
    seriesOccurrenceIdentity: seriesOccurrenceIdentity,
    sameOccurrence: sameOccurrence,
    isPlayable: isPlayable,
    adjacentState: adjacentState,
    seriesScope: seriesScope,
    seasonInScope: seasonInScope
  };
}));
