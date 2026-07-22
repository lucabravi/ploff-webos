  // Media detail, seasons, episodes, preferences, and metadata refresh.
  function setDetailViewMode(enabled) {
    document.body.className = document.body.className.replace(/\s*is-detail-view/g, '');
    if (enabled) { document.body.className += ' is-detail-view'; }
  }

  function ensureDetailEpisodeView() {
    if (detailEpisodeView) { return detailEpisodeView; }
    detailEpisodeView = DetailEpisodeView.create({
      root: root,
      document: document,
      element: element,
      ProgressiveImages: ProgressiveImages,
      posterLoader: posterLoader,
      onSeasonActivate: function (index) {
        detailSeasonIndex = detailEpisodeView.setSeasonIndex(index, false);
        loadSelectedSeason();
      },
      onEpisodeActivate: function (index) {
        detailEpisodeIndex = detailEpisodeView.setEpisodeIndex(index, false);
        playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]);
      }
    });
    return detailEpisodeView;
  }

  function ensureDetailPresentationView() {
    if (detailPresentationView) { return detailPresentationView; }
    detailPresentationView = DetailPresentationView.create({
      root: root, document: document, setText: setText, t: t,
      getZone: function () { return detailZone; },
      onInvalidZone: function (name) {
        if (name === 'summary') { detailZone = 'play'; }
        else { detailZone = seriesContext ? 'episodes' : 'play'; }
        updateDetailFocus();
      },
      onDialogClose: function () { if (appView === 'detail') { updateDetailFocus(); } }
    });
    return detailPresentationView;
  }

  function detailPresentationSnapshot() { return ensureDetailPresentationView().snapshot(); }

  function detailPresentationKey(item) {
    if (!item) { return ''; }
    return [item.type || '', item.ratingKey || item.title || ''].join(':');
  }

  function clearDetailPresentation(clearPoster) {
    episodeDetailToken += 1;
    seasonTransitionMediaKey = '';
    posterLoader.cancelScope('detail');
    if (clearPoster) { loadRenderedPoster(document.getElementById('detail-poster'), '', 0, 'detail', 360, 540); }
    ensureDetailPresentationView().clear();
    setText('detail-audio-value', '');
    setText('detail-subtitles-value', '');
    setText('detail-version-value', '');
    setText('detail-media-info-video', '');
    setText('detail-media-info-audio', '');
    setText('detail-media-info-bitrate', '');
    setText('detail-media-info-subtitle-languages', '');
    closeDetailMediaInfo();
    document.getElementById('season-tabs').innerHTML = '';
    document.getElementById('episode-strip').innerHTML = '';
    if (detailEpisodeView) { detailEpisodeView.reset(); }
  }

  function prepareDetailTransition(item) {
    var nextKey = detailPresentationKey(item);
    var nextArtwork = artworkUrl(item);
    if (lastDetailPresentationKey && nextKey !== lastDetailPresentationKey) {
      clearDetailPresentation(true);
      scheduleTheme(null);
    }
    if (activeBackdropSource && activeBackdropSource !== nextArtwork) {
      clearBackdropPresentation();
    }
    lastDetailPresentationKey = nextKey;
  }

  function mediaPreferenceIdentity(detail) {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var serverId = activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || 'local';
    var profileId = profile && (profile.id || profile.uuid || profile.title) || 'local';
    return MediaPreferences ? MediaPreferences.key(serverId, profileId, detail) : '';
  }

  function resolvedDetailTracks() {
    return detailPreferenceState.resolved(appSettings);
  }

  function detailMediaVersions() {
    return detailPreferenceState.versions();
  }

  function selectedDetailMediaProfile() {
    return detailPreferenceState.selectedProfile();
  }

  function mediaVersionLabel(profile, automatic) {
    var label = profile && profile.summary || t('player.unavailable');
    return automatic ? t('player.versionAuto') + ' - ' + label : label;
  }

  function automaticTrackLabel(label) {
    return t('player.automatic') + (label ? ' - ' + label : '');
  }

  function detailChoiceState() {
    return detailPreferenceState.choiceState();
  }

  function detailChoiceZones() {
    var choices = detailChoiceState();
    var zones = [];
    if (choices.audio) { zones.push('audio'); }
    if (choices.subtitles) { zones.push('subtitles'); }
    if (choices.versions) { zones.push('version'); }
    return zones;
  }

  function renderDetailMediaControls() {
    var resolved = resolvedDetailTracks();
    var profile = selectedDetailMediaProfile();
    var versions = detailMediaVersions();
    var choices = MediaProfile.choiceState(profile, versions);
    var subtitleLanguages = [];
    var videoParts = [];
    var audioParts = [];
    var video = '';
    var audio = '';
    var bitrate = '';
    var unavailableLabel;
    var override = detailPreferenceState.snapshot().override;
    var values = { audio: '', subtitles: '', version: '', video: '', mediaAudio: '', bitrate: '', subtitleLanguages: '' };
    if (!profile || !resolved) {
      unavailableLabel = detailMediaProfileLoading ?
        (detailMediaLoadingLabelVisible ? t('detail.loadingTracks') : '') : t('player.unavailable');
      values.audio = unavailableLabel;
      values.subtitles = unavailableLabel;
      values.version = unavailableLabel;
      values.video = unavailableLabel;
    } else {
      values.version = mediaVersionLabel(profile, !override || override.mediaIndex === null);
      values.audio = MediaProfile.trackDisplayLabel(resolved.audioTrack, t('detail.external'));
      values.audio = override && override.audioTrack ? values.audio : automaticTrackLabel(values.audio);
      values.subtitles = override && override.subtitlesOff ? t('subtitle.off') : (override && override.subtitleTrack
        ? (MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'))
        : automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off')));
      if (profile.videoCodec) { videoParts.push(profile.videoCodec); }
      if (profile.width && profile.height) { videoParts.push(profile.width + 'x' + profile.height); }
      if (profile.videoDynamicRange) { videoParts.push(profile.videoDynamicRange); }
      if (profile.audioCodec) { audioParts.push(profile.audioCodec); }
      if (profile.audioChannels) { audioParts.push(profile.audioChannels + ' ch'); }
      video = videoParts.join(' \u00b7 ') || t('player.unavailable');
      audio = audioParts.join(' \u00b7 ') || t('player.unavailable');
      bitrate = profile.bitrate ? (Math.round(profile.bitrate / 100) / 10) + ' Mbps' : t('player.unavailable');
      subtitleLanguages = MediaProfile.subtitleLanguages(profile);
      values.video = video;
      values.mediaAudio = audio;
      values.bitrate = bitrate;
      values.subtitleLanguages = subtitleLanguages.length ? subtitleLanguages.join(', ') : t('detail.noSubtitles');
    }
    ensureDetailPresentationView().renderMediaControls({
      labels: { audio: t('detail.audio'), subtitles: t('detail.subtitles'), mediaInfo: t('detail.mediaInfo'), subtitleLanguages: t('detail.subtitleLanguages'), video: t('detail.video'), bitrate: t('detail.bitrate') },
      choices: choices,
      values: values,
      mediaInfoVisible: appSettings.showMediaInfo
    });
  }

  function animateSeasonContent(elementId) {
    var node = document.getElementById(elementId);
    if (!node) { return; }
    node.className = node.className.replace(/\s*is-season-updating/g, '');
    node.offsetWidth;
    node.className += ' is-season-updating';
    root.setTimeout(function () {
      node.className = node.className.replace(/\s*is-season-updating/g, '');
    }, 220);
  }

  function updateDetailMediaInfoOverflow() {
    var button = document.getElementById('detail-media-info-button');
    var visible = appSettings.showMediaInfo && button.className.indexOf('is-hidden') === -1;
    ensureDetailPresentationView().updateMediaInfoOverflow(visible);
  }

  function openDetailMediaInfo() {
    ensureDetailPresentationView().openMediaInfo();
  }

  function closeDetailMediaInfo() {
    ensureDetailPresentationView().closeMediaInfo();
  }

  function scrollDetailMediaInfo(direction) {
    ensureDetailPresentationView().scrollMediaInfo(direction);
  }

  function loadDetailMediaProfile(detail) {
    var token;
    var ratingKey = detail && detail.ratingKey;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    detailMediaProfileToken += 1;
    token = detailMediaProfileToken;
    detailMediaProfileRatingKey = String(ratingKey || '');
    detailMediaProfileLoading = !!ratingKey;
    detailPreferenceState.prepare(mediaPreferenceIdentity(detail));
    if (appView === 'detail') { renderDetailMediaControls(); }
    if (!ratingKey) { detailMediaProfileLoading = false; return; }
    detailMediaProfileRequest = PlexClient.loadMediaProfile(config, ratingKey, function (error, profile) {
      if (token !== detailMediaProfileToken) { return; }
      detailMediaProfileRequest = null;
      if (!currentDetail || String(currentDetail.ratingKey) !== String(ratingKey)) { return; }
      detailMediaProfileLoading = false;
      detailMediaLoadingLabelVisible = false;
      root.clearTimeout(detailMediaLoadingLabelTimer);
      detailMediaLoadingLabelTimer = null;
      detailPreferenceState.setProfile(error ? null : profile);
      if (appView === 'detail') {
        renderDetailMediaControls();
        if (String(ratingKey) === seasonTransitionMediaKey) {
          seasonTransitionMediaKey = '';
          animateSeasonContent('detail-playback-controls');
        }
        updateDetailFocus();
      }
    });
  }

  function prepareDetailMediaProfile(detail) {
    var ratingKey = detail && detail.ratingKey;
    root.clearTimeout(detailMediaProfileTimer);
    detailMediaProfileTimer = null;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    detailMediaProfileToken += 1;
    detailMediaProfileRatingKey = String(ratingKey || '');
    detailMediaProfileLoading = !!ratingKey;
    detailMediaLoadingLabelVisible = false;
    root.clearTimeout(detailMediaLoadingLabelTimer);
    detailMediaLoadingLabelTimer = null;
    detailPreferenceState.prepare(mediaPreferenceIdentity(detail));
    renderDetailMediaControls();
    if (ratingKey) {
      detailMediaLoadingLabelTimer = root.setTimeout(function () {
        detailMediaLoadingLabelTimer = null;
        if (!detailMediaProfileLoading || String(detailMediaProfileRatingKey) !== String(ratingKey)) { return; }
        detailMediaLoadingLabelVisible = true;
        if (appView === 'detail') { renderDetailMediaControls(); }
      }, 500);
    }
  }

  function queueDetailMediaProfile(detail) {
    var ratingKey = detail && detail.ratingKey;
    prepareDetailMediaProfile(detail);
    if (!ratingKey) { return; }
    detailMediaProfileTimer = root.setTimeout(function () {
      detailMediaProfileTimer = null;
      if ((appView !== 'detail' && appView !== 'player') || !currentDetail || String(currentDetail.ratingKey) !== String(ratingKey)) { return; }
      loadDetailMediaProfile(detail);
    }, 120);
  }

  function ensureDetailMediaProfile(detail) {
    var ratingKey = String(detail && detail.ratingKey || '');
    if (!ratingKey) { return; }
    if (detailMediaProfileRatingKey === ratingKey && (detailPreferenceState.snapshot().profile || detailMediaProfileLoading)) {
      renderDetailMediaControls();
      return;
    }
    queueDetailMediaProfile(detail);
  }

  function saveDetailMediaOverride() {
    if (!MediaPreferences || !currentDetail) { return; }
    detailPreferenceState.save();
    renderDetailMediaControls();
  }

  function cycleDetailTrack(kind, direction) {
    if (!selectedDetailMediaProfile()) { return; }
    detailPreferenceState.cycleTrack(kind, direction);
    renderDetailMediaControls();
  }

  function cycleDetailVersion(direction) {
    if (detailMediaVersions().length < 2) { return; }
    detailPreferenceState.cycleVersion(direction);
    renderDetailMediaControls();
  }

  function detailTrackChoices(tracks) {
    var choices = [];
    var index;
    for (index = 0; index < (tracks || []).length; index += 1) {
      choices.push({ value: String(tracks[index].id || index), label: MediaProfile.trackDisplayLabel(tracks[index], t('detail.external')), track: tracks[index] });
    }
    return choices;
  }

  function openDetailChoice(kind) {
    var profile = selectedDetailMediaProfile();
    var override = detailPreferenceState.snapshot().override;
    var resolved = resolvedDetailTracks();
    var choices = [];
    var selected = '';
    var versions;
    var automaticLabel;
    var selectedTrack;
    if (!profile) { return; }
    if (kind === 'audio') {
      automaticLabel = automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved && resolved.audioTrack, t('detail.external')));
      choices = [{ value: '', label: automaticLabel, track: null }].concat(detailTrackChoices(profile.audioTracks));
      selectedTrack = override && override.audioTrack ? MediaPreferences.findTrack(profile.audioTracks, override.audioTrack, false) : null;
      selected = selectedTrack ? String(selectedTrack.id || profile.audioTracks.indexOf(selectedTrack)) : '';
    } else if (kind === 'subtitles') {
      automaticLabel = automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved && resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'));
      choices = [{ value: 'automatic', label: automaticLabel, track: null }, { value: 'off', label: t('subtitle.off'), track: null }].concat(detailTrackChoices(profile.subtitleTracks));
      selectedTrack = override && override.subtitleTrack ? MediaPreferences.findTrack(profile.subtitleTracks, override.subtitleTrack, false) : null;
      selected = override && override.subtitlesOff ? 'off' : (selectedTrack ? String(selectedTrack.id || profile.subtitleTracks.indexOf(selectedTrack)) : 'automatic');
    } else {
      versions = detailMediaVersions();
      choices = [{ value: 'auto', label: t('player.versionAuto') }];
      versions.forEach(function (version) { choices.push({ value: version.mediaIndex + ':' + version.partIndex, label: mediaVersionLabel(version, false) }); });
      selected = override && override.mediaIndex !== null ? override.mediaIndex + ':' + override.partIndex : 'auto';
    }
    openChoiceDialog(kind === 'audio' ? t('detail.audio') : (kind === 'subtitles' ? t('detail.subtitles') : t('detail.version')), choices, selected, function (choice) {
      var parts;
      if (kind === 'version') {
        parts = choice.value === 'auto' ? null : String(choice.value).split(':');
        detailPreferenceState.setVersion(parts ? Number(parts[0]) : null, parts ? Number(parts[1]) : null);
      } else { detailPreferenceState.setTrack(kind, choice.track || null, choice.value === 'off'); }
      renderDetailMediaControls();
    }, function () { updateDetailFocus(); });
  }

  function detailPlaybackPreferences() {
    return detailPreferenceState.playbackPreferences(appSettings, activeVideoQuality());
  }

  function cloudRatingKeyForDetail(detail) {
    var guid = detail && (detail.cloudGuid || detail.watchlistGuid || detail.guid) || '';
    if (detail && detail.cloudRatingKey) { return String(detail.cloudRatingKey); }
    if (/^plex:\/\//.test(guid)) { return guid.split('/').pop(); }
    return '';
  }

  function watchlistLocalKeyForDetail(detail) {
    if (!detail) { return ''; }
    return String((detail.type === 'episode' || detail.type === 'season') ? (detail.showRatingKey || detail.ratingKey || '') : (detail.ratingKey || ''));
  }

  function syncCurrentDetailWatchlist() {
    var cached;
    if (!currentDetail || !currentDetail.ratingKey) { return; }
    cached = watchlistView.findLocal(watchlistLocalKeyForDetail(currentDetail));
    currentDetail.inWatchlist = !!cached;
    if (cached) {
      currentDetail.cloudRatingKey = cached.cloudRatingKey;
      currentDetail.cloudGuid = cached.cloudGuid;
    }
  }

  function renderDetailWatchlist() {
    var button = document.getElementById('detail-watchlist');
    var watchlist = watchlistSnapshot();
    button.disabled = !watchlistAvailable() || !watchlist.provider || watchlist.loading || watchlist.mutationPending || !cloudRatingKeyForDetail(currentDetail);
    setText('detail-watchlist', currentDetail && currentDetail.inWatchlist ? t('detail.removeWatchlist') : t('detail.addWatchlist'));
  }

  function toggleCurrentWatchlist() {
    var detail = currentDetail;
    var cloudKey = cloudRatingKeyForDetail(detail);
    var enabled;
    var source;
    var local;
    var watchlist = watchlistSnapshot();
    if (!detail || !cloudKey || !watchlistAvailable() || !watchlist.provider || watchlist.mutationPending) { return; }
    enabled = !detail.inWatchlist;
    source = selectedItem && String(selectedItem.ratingKey || '') === String(detail.ratingKey || '') ? selectedItem : detail;
    detail.inWatchlist = enabled;
    renderDetailWatchlist();
    local = {};
    Object.keys(source).forEach(function (key) { local[key] = source[key]; });
    local.ratingKey = watchlistLocalKeyForDetail(detail);
    local.type = detail.type === 'episode' || detail.type === 'season' ? 'show' : detail.type;
    local.title = detail.title;
    local.meta = local.type === 'show' ? 'TV Shows' : (local.meta || 'Movie');
    local.metaKey = local.type === 'show' ? 'media.show' : 'media.movie';
    local.image = detail.image || local.image;
    local.art = detail.art || local.art;
    local.cloudGuid = detail.watchlistGuid || detail.guid || detail.cloudGuid || '';
    watchlistView.toggle(cloudKey, enabled, local, function (error) {
      if (error) {
        detail.inWatchlist = !enabled;
        renderDetailWatchlist(); showMessage(t('status.updateError')); return;
      }
      if (selectedItem) { selectedItem.inWatchlist = enabled; selectedItem.cloudRatingKey = cloudKey; }
      detail.inWatchlist = enabled; detail.cloudRatingKey = cloudKey;
      renderDetailWatchlist();
    });
  }

  function detailDisplaySubtitle(detail) {
    var subtitle = detail && detail.subtitle || '';
    if (!detail || detail.type !== 'episode') { return subtitle; }
    return subtitle.replace(/(^| - )E0*([0-9]+)( - )/, function (match, prefix, episodeNumber, separator) {
      return prefix + t('player.episode') + ' ' + Number(episodeNumber) + separator;
    });
  }

  function renderDetail(detail, deferMediaProfile) {
    var poster = document.getElementById('detail-poster');
    currentDetail = detail;
    if (selectedItem && String(selectedItem.ratingKey || '') === String(detail.ratingKey || '')) {
      if (!detail.guid && selectedItem.guid) { detail.guid = selectedItem.guid; }
      if (selectedItem.cloudRatingKey) { detail.cloudRatingKey = selectedItem.cloudRatingKey; }
      if (selectedItem.cloudGuid) { detail.cloudGuid = selectedItem.cloudGuid; }
    }
    ensureDetailPresentationView().renderMetadata(detail, detailDisplaySubtitle(detail));
    loadRenderedPoster(poster, detail.image, 0, 'detail', 360, 540);
    setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
    scheduleDetailBackdrop(detail);
    scheduleTheme(detail);
    if (deferMediaProfile) { prepareDetailMediaProfile(detail); }
    else { queueDetailMediaProfile(detail); }
    syncCurrentDetailWatchlist();
    renderDetailWatchlist();
    if (watchlistAvailable() && watchlistSnapshot().loadedIdentity !== watchlistIdentity() && !watchlistSnapshot().loading) {
      loadWatchlistData(false, function () { if (appView === 'detail' && currentDetail === detail) { syncCurrentDetailWatchlist(); renderDetailWatchlist(); } });
    }
  }

  function updateDetailSummaryOverflow() {
    ensureDetailPresentationView().updateSummaryOverflow();
  }

  function openDetailSummary() {
    ensureDetailPresentationView().openSummary();
  }

  function closeDetailSummary() {
    ensureDetailPresentationView().closeSummary();
  }

  function scrollDetailSummary(direction) {
    ensureDetailPresentationView().scrollSummary(direction);
  }

  function toggleCurrentWatched() {
    var watched;
    var item;
    var rowIndex;
    var itemIndex;
    if (!currentDetail || !currentDetail.ratingKey) { return; }
    watched = !currentDetail.viewed;
    PlexClient.setWatchedAndReset(config, currentDetail.ratingKey, watched, function (error) {
      if (error || appView !== 'detail') { showMessage(t('status.updateError')); return; }
      currentDetail.viewed = watched;
      currentDetail.viewOffset = 0;
      currentDetail.progress = 0;
      if (selectedItem && String(selectedItem.ratingKey || '') === String(currentDetail.ratingKey)) {
        selectedItem.viewed = watched; selectedItem.viewOffset = 0; selectedItem.progress = 0;
      }
      for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
        for (itemIndex = 0; itemIndex < data.rows[rowIndex].items.length; itemIndex += 1) {
          item = data.rows[rowIndex].items[itemIndex];
          if (String(item.ratingKey || '') === String(currentDetail.ratingKey)) {
            item.viewed = watched; item.viewOffset = 0; item.progress = 0;
          }
        }
      }
      setText('detail-watched', watched ? t('detail.markUnwatched') : t('detail.markWatched'));
      if (seriesContext && seriesContext.episodes[detailEpisodeIndex]) {
        seriesContext.episodes[detailEpisodeIndex].viewed = watched;
        seriesContext.episodes[detailEpisodeIndex].viewOffset = 0;
        seriesContext.episodes[detailEpisodeIndex].progress = 0;
        renderEpisodeStrip();
        updateDetailFocus();
      }
      homeRefreshCoordinator.refresh();
      if (activeLibrary) { probeLibraryContinue(); }
    });
  }

  function metadataRefreshKeys(detail) {
    if (!detail) { return []; }
    if (detail.type === 'episode') { return [detail.ratingKey, detail.seasonRatingKey, detail.showRatingKey]; }
    if (detail.type === 'season') { return [detail.ratingKey, detail.showRatingKey]; }
    return [detail.ratingKey];
  }

  function ratingKeyIndex(items, ratingKey, fallback) {
    var index;
    for (index = 0; index < (items || []).length; index += 1) {
      if (String(items[index].ratingKey || '') === String(ratingKey || '')) { return index; }
    }
    return Math.max(0, Math.min((items || []).length - 1, Number(fallback || 0)));
  }

  function currentRefreshTargetIsVisible(refreshContext) {
    return appView === 'detail' && currentDetail && String(currentDetail.ratingKey || '') === refreshContext.targetKey;
  }

  function applyReloadedSeriesContext(context, refreshContext) {
    if (!context || !currentRefreshTargetIsVisible(refreshContext)) { return; }
    seriesContext = context;
    detailSeasonIndex = ratingKeyIndex(context.seasons, refreshContext.seasonKey, detailSeasonIndex);
    detailEpisodeIndex = ratingKeyIndex(context.episodes, refreshContext.episodeKey, detailEpisodeIndex);
    ensureDetailEpisodeView().setContext(context, {
      seasonKey: context.seasons[detailSeasonIndex] && context.seasons[detailSeasonIndex].ratingKey,
      episodeKey: context.episodes[detailEpisodeIndex] && context.episodes[detailEpisodeIndex].ratingKey
    });
    updateDetailFocus();
  }

  function reloadCurrentMetadataLevel(key, refreshContext, callback) {
    if (String(key) === refreshContext.targetKey) {
      PlexClient.loadMetadata(config, refreshContext.targetKey, function (error, detail) {
        if (error) { callback(error); return; }
        refreshContext.detail = detail;
        if (currentRefreshTargetIsVisible(refreshContext)) { renderDetail(detail); }
        if (detail.type !== 'show' && detail.type !== 'season') { callback(null); return; }
        PlexClient.loadSeriesContext(config, detail, function (contextError, context) {
          if (!contextError) { applyReloadedSeriesContext(context, refreshContext); }
          callback(contextError || null);
        });
      });
      return;
    }
    PlexClient.loadSeriesContext(config, refreshContext.detail, function (error, context) {
      if (!error) { applyReloadedSeriesContext(context, refreshContext); }
      callback(error || null);
    });
  }

  function refreshCurrentMetadata() {
    var button = document.getElementById('detail-refresh-metadata');
    var currentSeason = seriesContext && seriesContext.seasons[detailSeasonIndex];
    var currentEpisode = seriesContext && seriesContext.episodes[detailEpisodeIndex];
    var refreshContext;
    if (!currentDetail || !currentDetail.ratingKey || detailRefreshPending) { return; }
    refreshContext = {
      targetKey: String(currentDetail.ratingKey),
      detail: currentDetail,
      seasonKey: currentSeason ? currentSeason.ratingKey : currentDetail.seasonRatingKey,
      episodeKey: currentEpisode ? currentEpisode.ratingKey : currentDetail.ratingKey
    };
    detailRefreshPending = true; button.disabled = true; showDetailMetadataStatus(t('status.refreshing'));
    MetadataRefresh.run({
      keys: metadataRefreshKeys(currentDetail),
      refresh: function (key, callback) { PlexClient.refreshMetadata(config, key, callback); },
      wait: function (activityId, callback) { waitForServerActivity(activityId, callback); },
      reload: function (key, callback) { reloadCurrentMetadataLevel(key, refreshContext, callback); }
    }, function (error) {
      detailRefreshPending = false; button.disabled = false;
      if (appView === 'detail' && currentDetail && String(currentDetail.ratingKey) === refreshContext.targetKey) {
        showDetailMetadataStatus(error ? t('status.updateError') : t('status.refreshComplete'), true);
      }
      if (appView === 'detail') { updateDetailFocus(); }
    });
  }

  function openDetail(item) {
    detailReturnView = appView === 'search' ? 'search' : (appView === 'library' ? 'library' : (appView === 'watchlist' ? 'watchlist' : 'home'));
    if (appView === 'search') { cancelSearchWork(true); }
    prepareDetailTransition(item);
    selectedItem = item;
    detailPlayPending = false;
    seriesContext = null;
    detailZone = 'play';
    detailActionIndex = 0;
    appView = 'detail';
    setDetailViewMode(true);
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    renderDetail({
      type: item.type,
      title: mediaTitle(item),
      subtitle: mediaMeta(item) + (mediaDetail(item) ? ' - ' + mediaDetail(item) : ''),
      facts: '',
      summary: '',
      image: item.image,
      art: item.art || item.image
    });
    document.getElementById('detail-play').className = 'detail-action is-focused';
    document.getElementById('detail-play').focus();
    showViewState('loading', 'detail', null, closeDetail);
    loadSelectedDetail(item);
  }

  function loadSelectedDetail(item) {
    PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
      if (appView !== 'detail' || !selectedItem || selectedItem.ratingKey !== item.ratingKey) { return; }
      if (error || !detail) {
        showViewState('error', 'detail', function () {
          showViewState('loading', 'detail', null, closeDetail);
          loadSelectedDetail(item);
        }, closeDetail);
        return;
      }
      hideViewState();
      renderDetail(detail, true);
      PlexClient.loadSeriesContext(config, detail, function (seriesError, context) {
        if (appView !== 'detail' || !currentDetail || String(currentDetail.ratingKey) !== String(detail.ratingKey)) { return; }
        if (!seriesError && context) { renderSeriesContext(context, detail, completePendingDetailPlay); }
        else {
          queueDetailMediaProfile(detail);
          completePendingDetailPlay();
        }
      });
    });
  }

  function completePendingDetailPlay() {
    if (!detailPlayPending || appView !== 'detail' || !currentDetail || !currentDetail.ratingKey ||
        currentDetail.type === 'show' || currentDetail.type === 'season') { return; }
    detailPlayPending = false;
    openPlayer();
  }

  function selectedIndex(items) {
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (items[index].selected) {
        return index;
      }
    }
    return 0;
  }

  function renderSeriesContext(context, detail, callback) {
    seriesContext = context;
    detailSeasonIndex = selectedIndex(context.seasons);
    detailEpisodeIndex = selectedIndex(context.episodes);
    ensureDetailEpisodeView().setContext(context);
    updateDetailFocus();
    if (detail.type !== 'episode' && context.episodes.length) {
      loadEpisodeDetail(context.episodes[detailEpisodeIndex], callback);
    } else {
      queueDetailMediaProfile(detail);
      if (callback) { callback(detail); }
    }
  }

  function renderSeasonTabs() {
    ensureDetailEpisodeView().setSeasonIndex(detailSeasonIndex, true);
  }

  function renderEpisodeStrip() {
    ensureDetailEpisodeView().setEpisodeIndex(detailEpisodeIndex, true);
  }

  function updateEpisodeCardsPlaybackState() {
    ensureDetailEpisodeView().refreshPlaybackCards();
  }

  function reconcileEpisodePlaybackState(freshEpisodes) {
    var episode;
    var fresh;
    var index;
    var freshByKey = {};
    for (index = 0; index < (freshEpisodes || []).length; index += 1) {
      freshByKey[String(freshEpisodes[index].ratingKey || '')] = freshEpisodes[index];
    }
    for (index = 0; seriesContext && index < seriesContext.episodes.length; index += 1) {
      episode = seriesContext.episodes[index];
      fresh = freshByKey[String(episode.ratingKey || '')];
      if (!fresh) { continue; }
      if (currentDetail && String(currentDetail.ratingKey || '') === String(episode.ratingKey || '')) {
        currentDetail.viewed = fresh.viewed;
        currentDetail.viewOffset = fresh.viewOffset;
        currentDetail.duration = fresh.duration;
        currentDetail.progress = fresh.progress;
        setText('detail-watched', fresh.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      }
    }
    ensureDetailEpisodeView().reconcilePlayback(freshEpisodes);
  }

  function refreshEpisodePlaybackState(ratingKey) {
    var season;
    var seasonKey;
    if (appView !== 'detail' || !seriesContext || !seriesContext.seasons.length) { return; }
    season = seriesContext.seasons[detailSeasonIndex];
    seasonKey = season && String(season.ratingKey || '');
    if (!seasonKey) { return; }
    PlexClient.loadSeasonEpisodes(config, seasonKey, ratingKey || '', function (error, episodes) {
      var activeSeason = seriesContext && seriesContext.seasons[detailSeasonIndex];
      if (error || appView !== 'detail' || !activeSeason || String(activeSeason.ratingKey || '') !== seasonKey) { return; }
      reconcileEpisodePlaybackState(episodes);
      updateEpisodeCardsPlaybackState();
    });
  }

  function startEpisodeTitlePan(card) {
    ensureDetailEpisodeView().startTitlePan(card);
  }

  function loadEpisodeDetail(episode, callback, animateSeason) {
    var token = ++episodeDetailToken;
    var ratingKey = String(episode && episode.ratingKey || '');
    PlexClient.loadMetadata(config, episode.ratingKey, function (error, detail) {
      var selectedEpisode = seriesContext && seriesContext.episodes[detailEpisodeIndex];
      if (!error && appView === 'detail' && token === episodeDetailToken &&
          (!selectedEpisode || String(selectedEpisode.ratingKey || '') === ratingKey)) {
        if (animateSeason) { seasonTransitionMediaKey = ratingKey; }
        renderDetail(detail);
        if (animateSeason) {
          animateSeasonContent('detail-copy');
        }
        if (callback) { callback(detail); }
      }
    });
  }

  function playSelectedEpisode(episode) {
    loadEpisodeDetail(episode, function () {
      renderEpisodeStrip();
      openPlayer();
    });
  }

  function playHomeDetail(detail) {
    detailReturnView = appView === 'search' ? 'search' : (appView === 'library' ? 'library' : (appView === 'watchlist' ? 'watchlist' : 'home'));
    if (appView === 'search') { cancelSearchWork(true); }
    currentDetail = detail;
    seriesContext = null;
    appView = 'detail';
    setDetailViewMode(true);
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    renderDetail(detail);
    PlexClient.loadSeriesContext(config, detail, function (error, context) {
      if (appView !== 'detail') { return; }
      if (detail.type === 'show' && (error || !context)) {
        showMessage(t('status.mediaUnavailable'));
        return;
      }
      if (!error && context) {
        if (detail.type === 'show' && !context.episodes.length) {
          showMessage(t('status.mediaUnavailable'));
          return;
        }
        renderSeriesContext(context, detail, function () { openPlayer(); });
        return;
      }
      openPlayer();
    });
  }

  function playHomeItem(item) {
    if (!item || !item.ratingKey) { return; }
    if (item.type === 'season') {
      PlexClient.loadSeasonEpisodes(config, item.ratingKey, '', function (error, episodes) {
        if (error || !episodes.length || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
        detailEpisodeIndex = selectedIndex(episodes);
        PlexClient.loadMetadata(config, episodes[detailEpisodeIndex].ratingKey, function (metadataError, detail) {
          if (metadataError || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
          playHomeDetail(detail);
        });
      });
      return;
    }
    PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
      if (error || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
      playHomeDetail(detail);
    });
  }

  function scheduleEpisodeDetail() {
    root.clearTimeout(detailMetadataTimer);
    detailMetadataTimer = root.setTimeout(function () {
      if (seriesContext && seriesContext.episodes[detailEpisodeIndex]) {
        loadEpisodeDetail(seriesContext.episodes[detailEpisodeIndex], null, true);
      }
    }, 180);
  }

  function navigateDetail(direction) {
    var choiceZones = detailChoiceZones();
    var presentation = detailPresentationSnapshot();
    var result;
    detailNavigation.set({ zone: detailZone, actionIndex: detailActionIndex, seasonIndex: detailSeasonIndex, episodeIndex: detailEpisodeIndex });
    result = detailNavigation.navigate(direction, {
      hasSeries: !!seriesContext,
      seasonCount: seriesContext ? seriesContext.seasons.length : 0,
      episodeCount: seriesContext ? seriesContext.episodes.length : 0,
      choiceZones: choiceZones,
      summaryOverflowing: presentation.summaryOverflowing,
      mediaInfoOverflowing: presentation.mediaInfoOverflowing
    });
    detailZone = result.state.zone;
    detailActionIndex = result.state.actionIndex;
    detailSeasonIndex = result.state.seasonIndex;
    detailEpisodeIndex = result.state.episodeIndex;
    if (result.effect === 'nav-left' || result.effect === 'nav-right') {
      state.navIndex = result.effect === 'nav-left' ? Math.max(0, state.navIndex - 1) : Math.min(navigationFocusCount() - 1, state.navIndex + 1);
      scheduleNavigationPreview(state.navIndex);
    } else if (result.effect === 'season-preview') {
      renderSeasonTabs(); scheduleSeasonPreview();
    } else if (result.effect === 'episode-preview') {
      renderEpisodeStrip(); scheduleEpisodeDetail();
    } else if (result.effect.indexOf('cycle-') === 0) {
      if (detailZone === 'version') { cycleDetailVersion(direction === 'left' ? -1 : 1); }
      else { cycleDetailTrack(detailZone, direction === 'left' ? -1 : 1); }
    }
    updateDetailFocus();
  }

  function scheduleSeasonPreview() {
    var token;
    root.clearTimeout(seasonPreviewTimer);
    seasonPreviewToken += 1;
    token = seasonPreviewToken;
    seasonPreviewTimer = root.setTimeout(function () {
      var seasonIndex = detailSeasonIndex;
      if (appView !== 'detail' || detailZone !== 'seasons' || token !== seasonPreviewToken) { return; }
      var season = seriesContext.seasons[seasonIndex];
      PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        var index;
        if (error || appView !== 'detail' || detailZone !== 'seasons' || token !== seasonPreviewToken || seasonIndex !== detailSeasonIndex) { return; }
        for (index = 0; index < seriesContext.seasons.length; index += 1) {
          seriesContext.seasons[index].selected = index === seasonIndex;
        }
        seriesContext.episodes = episodes;
        detailEpisodeIndex = selectedIndex(episodes);
        ensureDetailEpisodeView().setEpisodes(episodes, episodes[detailEpisodeIndex] && episodes[detailEpisodeIndex].ratingKey);
        renderSeasonTabs();
        renderEpisodeStrip();
        animateSeasonContent('episode-strip');
        updateDetailFocus();
        if (episodes.length) { loadEpisodeDetail(episodes[detailEpisodeIndex], null, true); }
      });
    }, 200);
  }

  function loadSelectedSeason() {
    var season = seriesContext.seasons[detailSeasonIndex];
    PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
      var index;
      if (error || appView !== 'detail') {
        return;
      }
      for (index = 0; index < seriesContext.seasons.length; index += 1) {
        seriesContext.seasons[index].selected = index === detailSeasonIndex;
      }
      seriesContext.episodes = episodes;
      detailEpisodeIndex = selectedIndex(episodes);
      ensureDetailEpisodeView().setEpisodes(episodes, episodes[detailEpisodeIndex] && episodes[detailEpisodeIndex].ratingKey);
      detailZone = 'episodes';
      renderSeasonTabs();
      renderEpisodeStrip();
      updateDetailFocus();
      if (episodes.length) {
        animateSeasonContent('episode-strip');
        loadEpisodeDetail(episodes[detailEpisodeIndex], null, true);
      }
    });
  }

  function updateDetailFocus() {
    var target;
    clearLogicalFocus();
    if (detailZone === 'nav') {
      target = document.querySelector(selectorForNavIndex(state.navIndex));
    } else if (detailZone === 'seasons') {
      target = document.querySelector('[data-season-position="' + detailSeasonIndex + '"]');
    } else if (detailZone === 'episodes') {
      target = document.querySelector('[data-episode-position="' + detailEpisodeIndex + '"]');
    } else if (detailZone === 'audio') {
      target = document.getElementById('detail-audio');
    } else if (detailZone === 'subtitles') {
      target = document.getElementById('detail-subtitles');
    } else if (detailZone === 'version') {
      target = document.getElementById('detail-version');
    } else if (detailZone === 'summary') {
      target = document.getElementById('detail-summary-button');
    } else if (detailZone === 'media-info') {
      target = document.getElementById('detail-media-info-button');
    } else {
      target = document.getElementById(['detail-play', 'detail-watched', 'detail-watchlist', 'detail-refresh-metadata'][detailActionIndex]);
    }
    if (target) {
      target.className += ' is-focused';
      if (!pointerSelectionActive) { target.focus(); }
    }
    startEpisodeTitlePan(target);
  }
