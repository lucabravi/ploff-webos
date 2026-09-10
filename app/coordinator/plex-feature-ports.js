(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlexFeaturePorts = factory(); }
}(this, function () {
  'use strict';

  function forward(client, name) {
    return function () {
      return client[name].apply(client, arguments);
    };
  }

  function select(client, names) {
    var result = {};
    var index;
    client = client || {};
    for (index = 0; index < names.length; index += 1) {
      if (typeof client[names[index]] !== 'function') {
        throw new Error('PlexFeaturePorts requires PlexClient.' + names[index]);
      }
      result[names[index]] = forward(client, names[index]);
    }
    return result;
  }

  function server(client) {
    return select(client, ['loadAccountProfile', 'loadActivities', 'loadNavigation', 'loadServerIdentity']);
  }

  function shell(client) {
    return select(client, ['loadHome', 'loadMetadata', 'posterUrl']);
  }

  function search(client) {
    return select(client, ['findByGuid', 'search']);
  }

  function library(client) {
    return select(client, [
      'findByGuid', 'loadLibraryContainerPage', 'loadLibraryFilterOptions',
      'loadLibraryPage', 'loadLibraryRecommendations', 'refreshLibrary',
      'refreshLibraryMetadata'
    ]);
  }

  function detail(client) {
    return select(client, [
      'loadExtras', 'loadMediaProfile', 'loadMetadata', 'loadSeasonEpisodes', 'loadSeriesContext',
      'refreshMetadata', 'setWatchedAndReset'
    ]);
  }

  function mediaContext(client) {
    return select(client, ['removeFromContinueWatching', 'resetProgress', 'setWatchedAndReset']);
  }

  function settingsBackup(client) {
    return select(client, [
      'loadSettingsBackupPlaylists', 'createSettingsBackupPlaylist',
      'updateSettingsBackupPlaylist', 'deleteSettingsBackupPlaylist'
    ]);
  }

  function player(client) {
    return select(client, [
      'loadLibraryContainerPage', 'loadMetadata', 'loadPlayback', 'loadSeasonEpisodes',
      'loadSubtitleText', 'pingTranscode', 'posterUrl', 'preparePlayback',
      'rotateTranscodeSession', 'sendTimeline', 'setStreamSelection', 'setSubtitleOffset'
    ]);
  }

  return {
    detail: detail,
    library: library,
    mediaContext: mediaContext,
    player: player,
    search: search,
    server: server,
    settingsBackup: settingsBackup,
    shell: shell
  };
}));
