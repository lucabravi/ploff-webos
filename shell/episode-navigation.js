(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffEpisodeNavigation = factory();
  }
}(this, function () {
  'use strict';

  function normalizedDirection(direction) {
    return Number(direction) < 0 ? -1 : 1;
  }

  function isRegularSeason(season) {
    return !!(season && season.ratingKey && Number(season.index || 0) > 0);
  }

  function candidateIndexes(context, direction) {
    var seasons = context && context.seasons || [];
    var step = normalizedDirection(direction);
    var index = Number(context && context.seasonIndex || 0) + step;
    var result = [];
    while (index >= 0 && index < seasons.length) {
      if (isRegularSeason(seasons[index])) { result.push(index); }
      index += step;
    }
    return result;
  }

  function canMove(context, direction) {
    var episodes = context && context.episodes || [];
    var step = normalizedDirection(direction);
    var episodeIndex = Number(context && context.episodeIndex || 0) + step;
    if (episodes[episodeIndex]) { return true; }
    return candidateIndexes(context, step).length > 0;
  }

  function createResolver(loadEpisodes) {
    var generation = 0;

    function cancel() {
      generation += 1;
    }

    function resolve(context, direction, callback) {
      var step = normalizedDirection(direction);
      var episodes = context && context.episodes || [];
      var nextEpisodeIndex = Number(context && context.episodeIndex || 0) + step;
      var candidates;
      var token = generation += 1;

      if (episodes[nextEpisodeIndex]) {
        callback(null, {
          seasonIndex: Number(context.seasonIndex || 0),
          episodeIndex: nextEpisodeIndex,
          episodes: episodes,
          episode: episodes[nextEpisodeIndex]
        });
        return;
      }

      candidates = candidateIndexes(context, step);

      function tryCandidate(position) {
        var seasonIndex;
        var season;
        if (token !== generation) { return; }
        if (position >= candidates.length) {
          callback(new Error('No adjacent regular episode is available'));
          return;
        }
        seasonIndex = candidates[position];
        season = context.seasons[seasonIndex];
        loadEpisodes(season, function (error, loadedEpisodes) {
          var targetIndex;
          if (token !== generation) { return; }
          if (error) { callback(error); return; }
          loadedEpisodes = loadedEpisodes || [];
          if (!loadedEpisodes.length) { tryCandidate(position + 1); return; }
          targetIndex = step > 0 ? 0 : loadedEpisodes.length - 1;
          callback(null, {
            seasonIndex: seasonIndex,
            episodeIndex: targetIndex,
            episodes: loadedEpisodes,
            episode: loadedEpisodes[targetIndex]
          });
        });
      }

      tryCandidate(0);
    }

    return {
      cancel: cancel,
      canMove: canMove,
      resolve: resolve
    };
  }

  return {
    canMove: canMove,
    createResolver: createResolver,
    isRegularSeason: isRegularSeason
  };
}));
