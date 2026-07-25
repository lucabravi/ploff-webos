  function playlistQueuePlayable(items) {
    return (items || []).filter(function (item) {
      return !!(item && item.ratingKey && (item.type === 'episode' || item.type === 'movie'));
    });
  }

  function playlistQueueFindIndex(items, ratingKey, preferredIndex) {
    var preferred = Number(preferredIndex);
    var index;
    if (isFinite(preferred) && items[preferred] && String(items[preferred].ratingKey) === String(ratingKey || '')) {
      return preferred;
    }
    for (index = 0; index < items.length; index += 1) {
      if (String(items[index].ratingKey || '') === String(ratingKey || '')) { return index; }
    }
    return -1;
  }

  function playlistQueueItemTitle(item) {
    var detail = String(item && item.detail || '');
    if (item && item.type === 'episode' && detail) {
      return detail.replace(/^E0*[0-9]+\s*-\s*/, '') || String(item.title || '');
    }
    return String(item && item.title || '');
  }

  function playlistQueuePad(value) {
    var text = String(Math.max(0, Number(value || 0)));
    return text.length < 2 ? '0' + text : text;
  }

  function playlistQueueEpisodeNumbers(item) {
    var hasSeason = !!(item && (item.queueSeasonNumber !== undefined || item.seasonIndex !== undefined));
    var hasEpisode = !!(item && (item.queueEpisodeNumber !== undefined || item.episodeIndex !== undefined));
    var season = Number(item && (item.queueSeasonNumber !== undefined ? item.queueSeasonNumber : item.seasonIndex) || 0);
    var episode = Number(item && (item.queueEpisodeNumber !== undefined ? item.queueEpisodeNumber : item.episodeIndex) || 0);
    var match;
    if (!hasSeason && item && item.meta) {
      match = String(item.meta).match(/(?:Season|Stagione)\s+0*([0-9]+)/i);
      if (match) { season = Number(match[1]); hasSeason = true; }
    }
    if (!hasEpisode && item && item.detail) {
      match = String(item.detail).match(/^E0*([0-9]+)/i);
      if (match) { episode = Number(match[1]); hasEpisode = true; }
    }
    return item && item.type === 'episode' && hasEpisode
      ? { season: hasSeason ? season : 0, episode: episode }
      : null;
  }

  function playbackQueueItemDisplayTitle(item) {
    var title = playlistQueueItemTitle(item);
    var numbers = playlistQueueEpisodeNumbers(item);
    if (!numbers) { return title; }
    return 'S' + playlistQueuePad(numbers.season) + 'E' + playlistQueuePad(numbers.episode) +
      (title ? ' - ' + title : '');
  }

  function playbackQueueTypeLabel(item) {
    var italian = String(appSettings && appSettings.uiLanguage || 'en').toLowerCase().indexOf('it') === 0;
    return item && item.type === 'episode' ? (italian ? 'SERIE' : 'SERIES') : (italian ? 'FILM' : 'MOVIE');
  }

  function playlistQueueFirstUnwatchedIndex(items) {
    var source = items || [];
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (!source[index].viewed) { return index; }
    }
    return source.length ? 0 : -1;
  }

  function createPlaylistQueue(items, ratingKey, title, preferredIndex) {
    var sourceItems = items || [];
    var preferred = Number(preferredIndex);
    var playable = playlistQueuePlayable(sourceItems);
    var playablePreferredIndex = preferred;
    var index;
    if (isFinite(preferred) && preferred >= 0 && preferred < sourceItems.length &&
        playlistQueuePlayable([sourceItems[preferred]]).length) {
      playablePreferredIndex = playlistQueuePlayable(sourceItems.slice(0, preferred)).length;
    }
    index = playlistQueueFindIndex(playable, ratingKey, playablePreferredIndex);
    if (index < 0) { return null; }
    return { kind: 'container', items: playable, index: index, title: String(title || 'Queue') };
  }

  function playlistQueueSeriesContext(context) {
    return {
      playlistQueue: true,
      seasons: [{ ratingKey: 'playlist', index: 1, title: context.title, selected: true }],
      episodes: context.items.map(function (item, index) {
        return {
          ratingKey: item.ratingKey,
          type: item.type,
          title: playlistQueueItemTitle(item),
          index: index + 1,
          image: item.image || '',
          viewed: !!item.viewed,
          progress: Number(item.progress || 0),
          selected: index === context.index
        };
      })
    };
  }


  function playlistQueueUpcoming(items, currentIndex) {
    var source = items || [];
    var start = Math.max(0, Math.min(source.length, Number(currentIndex) || 0));
    return source.slice(start);
  }

  function playlistQueueFocusedIndex(currentIndex, requestedIndex, length) {
    var maximum = Math.max(0, Number(length || 0) - 1);
    var minimum = Math.max(0, Math.min(maximum, Number(currentIndex) || 0));
    return Math.max(minimum, Math.min(maximum, Number(requestedIndex) || 0));
  }

  function playbackQueueContainerKind(container) {
    var kind = String(container && container.containerType || '');
    return kind === 'playlist' || kind === 'collection' ? kind : '';
  }

  function seriesQueueItems(season, seasonIndex, episodes, startIndex) {
    var source = episodes || [];
    var start = Math.max(0, Math.min(source.length, Number(startIndex) || 0));
    var result = [];
    var episode;
    var index;
    for (index = start; index < source.length; index += 1) {
      episode = source[index];
      if (!episode || !episode.ratingKey) { continue; }
      result.push({
        ratingKey: episode.ratingKey,
        type: 'episode',
        title: playlistQueueItemTitle(episode),
        detail: episode.detail || '',
        image: episode.image || '',
        viewed: !!episode.viewed,
        progress: Number(episode.progress || 0),
        index: Number(episode.index || index + 1),
        queueSeasonIndex: Number(seasonIndex || 0),
        queueEpisodeIndex: index,
        queueSeasonNumber: Number(season && season.index || Number(seasonIndex || 0) + 1),
        queueEpisodeNumber: Number(episode.index || index + 1),
        queueEpisodes: source
      });
    }
    return result;
  }

  var playlistPlaybackQueue = null;
  var playlistPlaybackRequest = null;
  var playlistPlaybackLoadToken = 0;
  var playlistPlaybackAutoToken = 0;
  var seriesPlaybackQueue = null;
  var seriesPlaybackRequest = null;
  var seriesPlaybackLoadToken = 0;
  var playlistQueueDrawerOpen = false;
  var playlistQueueDrawerIndex = 0;
  var playlistQueueDrawerFocusReady = false;
  var playlistQueueDrawerFocusTimer = null;
  var playlistDirectPlayToken = 0;
  var playlistDirectPlayOrigin = false;
  var playlistDirectPlayPending = false;


  function playlistQueueLabel() {
    return String(appSettings && appSettings.uiLanguage || 'en').toLowerCase().indexOf('it') === 0 ? 'Coda' : 'Queue';
  }

  function seriesQueueEligible() {
    return !!(seriesContext && !seriesContext.playlistQueue && currentDetail && currentDetail.type === 'episode' &&
      seriesContext.seasons && seriesContext.seasons.length && seriesContext.episodes && seriesContext.episodes.length);
  }

  function seriesQueueIdentity() {
    var showKey = currentDetail && (currentDetail.showRatingKey || currentDetail.title) || '';
    var seasonKeys = seriesContext && seriesContext.seasons ? seriesContext.seasons.map(function (season) {
      return String(season && season.ratingKey || '');
    }).join(',') : '';
    return String(showKey) + '|' + seasonKeys;
  }

  function resetSeriesPlaybackQueue() {
    seriesPlaybackLoadToken += 1;
    if (seriesPlaybackRequest && seriesPlaybackRequest.abort) { seriesPlaybackRequest.abort(); }
    seriesPlaybackRequest = null;
    seriesPlaybackQueue = null;
  }

  function seriesQueueCurrentIndex(queue) {
    var items = queue && queue.items || [];
    var ratingKey = currentDetail && currentDetail.ratingKey;
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (Number(items[index].queueSeasonIndex) === Number(detailSeasonIndex) &&
          Number(items[index].queueEpisodeIndex) === Number(detailEpisodeIndex)) { return index; }
    }
    return playlistQueueFindIndex(items, ratingKey, 0);
  }

  function seriesQueueContainsCurrent(queue) {
    return seriesQueueCurrentIndex(queue) >= 0;
  }

  function createSeriesPlaybackQueue() {
    var season;
    var items;
    if (!seriesQueueEligible()) { return null; }
    season = seriesContext.seasons[detailSeasonIndex];
    items = seriesQueueItems(season, detailSeasonIndex, seriesContext.episodes, detailEpisodeIndex);
    if (!items.length) { return null; }
    return {
      kind: 'series',
      identity: seriesQueueIdentity(),
      title: String(currentDetail.title || playlistQueueLabel()),
      items: items,
      index: 0,
      loadedThrough: detailSeasonIndex,
      loading: false,
      complete: false
    };
  }

  function hydrateSeriesPlaybackQueue(queue) {
    var seasons = seriesContext.seasons.slice(0);
    var token = seriesPlaybackLoadToken += 1;
    function renderIfOpen() {
      if (playlistQueueDrawerOpen && seriesPlaybackQueue === queue) {
        renderPlaylistQueueDrawer();
        updatePlaylistQueueDrawerFocus();
      }
    }
    function loadNext(seasonIndex) {
      var season;
      if (token !== seriesPlaybackLoadToken || seriesPlaybackQueue !== queue) { return; }
      while (seasonIndex < seasons.length && !EpisodeNavigation.isRegularSeason(seasons[seasonIndex])) { seasonIndex += 1; }
      if (seasonIndex >= seasons.length) {
        queue.loading = false;
        queue.complete = true;
        seriesPlaybackRequest = null;
        renderIfOpen();
        return;
      }
      season = seasons[seasonIndex];
      queue.loading = true;
      seriesPlaybackRequest = PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        if (token !== seriesPlaybackLoadToken || seriesPlaybackQueue !== queue) { return; }
        seriesPlaybackRequest = null;
        if (!error && episodes && episodes.length) {
          queue.items = queue.items.concat(seriesQueueItems(season, seasonIndex, episodes, 0));
          queue.loadedThrough = seasonIndex;
          renderIfOpen();
        }
        loadNext(seasonIndex + 1);
      });
    }
    loadNext(detailSeasonIndex + 1);
  }

  function ensureSeriesPlaybackQueue() {
    var identity;
    if (!seriesQueueEligible()) { resetSeriesPlaybackQueue(); return null; }
    identity = seriesQueueIdentity();
    if (seriesPlaybackQueue && seriesPlaybackQueue.identity === identity && seriesQueueContainsCurrent(seriesPlaybackQueue)) {
      return seriesPlaybackQueue;
    }
    resetSeriesPlaybackQueue();
    seriesPlaybackQueue = createSeriesPlaybackQueue();
    if (seriesPlaybackQueue) { hydrateSeriesPlaybackQueue(seriesPlaybackQueue); }
    return seriesPlaybackQueue;
  }

  function playbackQueueModel() {
    if (playlistPlaybackQueue && playlistPlaybackQueue.items && playlistPlaybackQueue.items.length &&
        seriesContext && seriesContext.playlistQueue) { return playlistPlaybackQueue; }
    return ensureSeriesPlaybackQueue();
  }

  function ensurePlaylistQueueUi() {
    var row;
    var settings;
    var button;
    var drawer;
    var header;
    if (document.getElementById('player-playlist-queue-button')) { return; }
    row = document.querySelector('.player-buttons');
    settings = document.getElementById('player-settings-button');
    if (!row || !settings) { return; }
    button = element('button', 'player-button player-icon-button player-playlist-queue-command is-unavailable');
    button.id = 'player-playlist-queue-button';
    button.type = 'button';
    button.setAttribute('aria-controls', 'player-playlist-queue');
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    row.insertBefore(button, settings);
    drawer = element('aside', 'player-playlist-queue');
    drawer.id = 'player-playlist-queue';
    drawer.setAttribute('aria-hidden', 'true');
    header = element('div', 'player-playlist-queue-header');
    header.appendChild(element('h3', 'player-playlist-queue-title'));
    header.appendChild(element('span', 'player-playlist-queue-position'));
    drawer.appendChild(header);
    drawer.appendChild(element('div', 'player-playlist-queue-list'));
    document.getElementById('player-view').appendChild(drawer);
  }

  function playlistQueueCurrentIndex(queue) {
    if (queue && queue.kind === 'series') { return Math.max(0, seriesQueueCurrentIndex(queue)); }
    if (seriesContext && seriesContext.playlistQueue && detailEpisodeIndex >= 0) { return detailEpisodeIndex; }
    return queue ? Math.max(0, Number(queue.index || 0)) : 0;
  }

  function playlistQueueAvailable() {
    return !!((playlistPlaybackQueue && playlistPlaybackQueue.items && playlistPlaybackQueue.items.length &&
      seriesContext && seriesContext.playlistQueue) || seriesQueueEligible());
  }

  function updatePlaylistQueueButton() {
    var button;
    var available;
    ensurePlaylistQueueUi();
    button = document.getElementById('player-playlist-queue-button');
    if (!button) { return; }
    available = playlistQueueAvailable();
    button.className = 'player-button player-icon-button player-playlist-queue-command' +
      (available ? '' : ' is-unavailable');
    button.setAttribute('aria-label', playlistQueueLabel());
    button.setAttribute('aria-expanded', playlistQueueDrawerOpen ? 'true' : 'false');
    if (!available && playlistQueueDrawerOpen) { closePlaylistQueueDrawer(false); }
  }

  function playlistQueueCardClass(index, currentIndex, focused) {
    return 'chapter-card playlist-queue-card' +
      (index === currentIndex ? ' is-current' : '') +
      (focused ? ' is-focused' : '');
  }

  function scrollPlaylistQueueFocus() {
    var list = document.querySelector('.player-playlist-queue-list');
    var card = list && list.querySelector('[data-playlist-queue-index="' + playlistQueueDrawerIndex + '"]');
    var top;
    var bottom;
    if (!list || !card) { return; }
    top = Number(card.offsetTop || 0);
    bottom = top + Number(card.offsetHeight || 0);
    if (top < list.scrollTop) { list.scrollTop = top; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight; }
  }

  function resetPlaylistQueueViewportScroll() {
    var drawer = document.getElementById('player-playlist-queue');
    var player = document.getElementById('player-view');
    if (root.scrollTo) { root.scrollTo(0, 0); }
    if (document.documentElement) { document.documentElement.scrollLeft = 0; }
    if (document.body) { document.body.scrollLeft = 0; }
    if (player) { player.scrollLeft = 0; }
    if (drawer) { drawer.scrollLeft = 0; }
  }

  function focusPlaylistQueueDrawerCard(card) {
    if (!card || !card.focus) { return; }
    resetPlaylistQueueViewportScroll();
    card.focus();
    resetPlaylistQueueViewportScroll();
  }

  function updatePlaylistQueueDrawerFocus() {
    var queue = playbackQueueModel();
    var cards = document.querySelectorAll('[data-playlist-queue-index]');
    var currentIndex;
    var cardIndex;
    var index;
    if (!queue) { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    for (index = 0; index < cards.length; index += 1) {
      cardIndex = Number(cards[index].getAttribute('data-playlist-queue-index'));
      cards[index].className = playlistQueueCardClass(cardIndex, currentIndex, cardIndex === playlistQueueDrawerIndex);
    }
    scrollPlaylistQueueFocus();
    resetPlaylistQueueViewportScroll();
    if (!pointerSelectionActive && playlistQueueDrawerFocusReady) {
      for (index = 0; index < cards.length; index += 1) {
        if (Number(cards[index].getAttribute('data-playlist-queue-index')) === playlistQueueDrawerIndex) {
          focusPlaylistQueueDrawerCard(cards[index]);
          break;
        }
      }
    }
  }

  function playbackQueueItemPosition(item, absoluteIndex, total) {
    return (absoluteIndex + 1) + '/' + total;
  }

  function renderPlaylistQueueDrawer() {
    var queue = playbackQueueModel();
    var drawer;
    var list;
    var title;
    var position;
    var currentIndex;
    var upcoming;
    var offset;
    var absoluteIndex;
    var item;
    var itemPosition;
    var itemTitle;
    var card;
    var image;
    var badge;
    var caption;
    ensurePlaylistQueueUi();
    drawer = document.getElementById('player-playlist-queue');
    list = drawer && drawer.querySelector('.player-playlist-queue-list');
    title = drawer && drawer.querySelector('.player-playlist-queue-title');
    position = drawer && drawer.querySelector('.player-playlist-queue-position');
    if (!drawer || !list || !queue) { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    playlistQueueDrawerIndex = playlistQueueFocusedIndex(currentIndex, playlistQueueDrawerIndex, queue.items.length);
    title.textContent = queue.title || playlistQueueLabel();
    position.textContent = (currentIndex + 1) + ' / ' + queue.items.length;
    list.innerHTML = '';
    upcoming = playlistQueueUpcoming(queue.items, currentIndex);
    for (offset = 0; offset < upcoming.length; offset += 1) {
      absoluteIndex = currentIndex + offset;
      item = upcoming[offset];
      itemPosition = playbackQueueItemPosition(item, absoluteIndex, queue.items.length);
      itemTitle = playbackQueueItemDisplayTitle(item);
      card = element('button', playlistQueueCardClass(absoluteIndex, currentIndex, absoluteIndex === playlistQueueDrawerIndex));
      card.type = 'button';
      card.setAttribute('data-playlist-queue-index', absoluteIndex);
      card.setAttribute('aria-label', playbackQueueTypeLabel(item) + ', ' + itemTitle + ', ' + itemPosition);
      image = element('img', 'chapter-card-image playlist-queue-card-image');
      image.alt = '';
      card.appendChild(image);
      badge = element('span', 'playlist-queue-card-badge', playbackQueueTypeLabel(item));
      card.appendChild(badge);
      caption = element('span', 'chapter-card-caption playlist-queue-card-caption');
      caption.appendChild(element('span', 'chapter-card-title playlist-queue-card-title', itemTitle));
      caption.appendChild(element('span', 'chapter-card-time', itemPosition));
      card.appendChild(caption);
      list.appendChild(card);
      if (item.image) { loadRenderedPoster(image, item.image, absoluteIndex === playlistQueueDrawerIndex ? 0 : 1, 'playlist-queue', 390, 160); }
    }
    root.setTimeout(scrollPlaylistQueueFocus, 0);
  }

  function openPlaylistQueueDrawer() {
    var queue;
    var drawer;
    var player;
    if (!playlistQueueAvailable() || appView !== 'player') { return; }
    queue = playbackQueueModel();
    if (!queue) { return; }
    ensurePlaylistQueueUi();
    closeChapterDrawer(false);
    cancelAutoplayCountdown();
    showPlayerControls();
    root.clearTimeout(playerControlsTimer);
    root.clearTimeout(playlistQueueDrawerFocusTimer);
    playlistQueueDrawerFocusTimer = null;
    playlistQueueDrawerOpen = true;
    playlistQueueDrawerFocusReady = false;
    playlistQueueDrawerIndex = playlistQueueCurrentIndex(queue);
    drawer = document.getElementById('player-playlist-queue');
    player = document.getElementById('player-view');
    drawer.className = 'player-playlist-queue is-open';
    drawer.setAttribute('aria-hidden', 'false');
    player.className = player.className.replace(/\s*has-playlist-queue-open/g, '') + ' has-playlist-queue-open';
    renderPlaylistQueueDrawer();
    updatePlaylistQueueButton();
    updatePlaylistQueueDrawerFocus();
    resetPlaylistQueueViewportScroll();
    playlistQueueDrawerFocusTimer = root.setTimeout(function () {
      playlistQueueDrawerFocusTimer = null;
      if (!playlistQueueDrawerOpen) { return; }
      playlistQueueDrawerFocusReady = true;
      updatePlaylistQueueDrawerFocus();
      resetPlaylistQueueViewportScroll();
    }, interfaceAnimationDuration(220));
  }

  function closePlaylistQueueDrawer(restoreFocus) {
    var drawer;
    var player;
    ensurePlaylistQueueUi();
    drawer = document.getElementById('player-playlist-queue');
    player = document.getElementById('player-view');
    playlistQueueDrawerOpen = false;
    playlistQueueDrawerFocusReady = false;
    root.clearTimeout(playlistQueueDrawerFocusTimer);
    playlistQueueDrawerFocusTimer = null;
    if (drawer) {
      drawer.className = 'player-playlist-queue';
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (player) { player.className = player.className.replace(/\s*has-playlist-queue-open/g, ''); }
    resetPlaylistQueueViewportScroll();
    updatePlaylistQueueButton();
    if (restoreFocus && appView === 'player') {
      playerZone = 'buttons';
      playerButtonIndex = 3;
      showPlayerControls();
      updatePlayerButtonFocus();
    }
  }

  function movePlaylistQueueDrawerFocus(direction) {
    var queue = playbackQueueModel();
    if (!queue) { return; }
    playlistQueueDrawerIndex = playlistQueueFocusedIndex(
      playlistQueueCurrentIndex(queue),
      playlistQueueDrawerIndex + direction,
      queue.items.length
    );
    updatePlaylistQueueDrawerFocus();
  }

  function playlistQueueVersionAffinity() {
    var snapshot = detailPreferenceState.snapshot();
    var index;
    if (!snapshot.override || snapshot.override.mediaIndex === null || !currentPlayback || !VersionSelection) { return null; }
    for (index = 0; index < (currentPlayback.mediaVersions || []).length; index += 1) {
      if (currentPlayback.mediaVersions[index].mediaIndex === currentPlayback.mediaIndex &&
          currentPlayback.mediaVersions[index].partIndex === currentPlayback.partIndex) {
        return VersionSelection.signature(currentPlayback.mediaVersions[index]);
      }
    }
    return null;
  }

  function switchPlayerQueueItem(index) {
    var queue = playbackQueueModel();
    var video = document.getElementById('player-video');
    var currentIndex;
    var target;
    var versionAffinity;
    if (!queue || appView !== 'player') { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    index = playlistQueueFocusedIndex(currentIndex, index, queue.items.length);
    if (index === currentIndex) { closePlaylistQueueDrawer(true); return; }
    target = queue.items[index];
    if (!target) { return; }
    versionAffinity = playlistQueueVersionAffinity();
    closePlaylistQueueDrawer(false);
    PlexClient.loadMetadata(config, target.ratingKey, function (metadataError, detail) {
      var itemIndex;
      if (metadataError || appView !== 'player') {
        if (appView === 'player') {
          lastDiagnosticsError = DiagnosticsState.sanitizeText(metadataError || t('status.metadataUnavailable'));
          setText('player-status', t('status.streamError'));
          showPlayerError(false, function () { switchPlayerQueueItem(index); });
        }
        return;
      }
      resetSkipPrompt();
      cancelAutoplayCountdown();
      sendPlayerTimeline('stopped');
      playerBufferingIndicator.stop();
      playerStreamSwitching = true;
      setPlayerLoading(true);
      root.clearInterval(timelineTimer);
      root.clearInterval(estimatedEndTimer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (queue.kind === 'series') {
        detailSeasonIndex = Number(target.queueSeasonIndex || 0);
        seriesContext.episodes = target.queueEpisodes || [];
        detailEpisodeIndex = Number(target.queueEpisodeIndex || 0);
        for (itemIndex = 0; itemIndex < seriesContext.seasons.length; itemIndex += 1) {
          seriesContext.seasons[itemIndex].selected = itemIndex === detailSeasonIndex;
        }
      } else {
        detailSeasonIndex = 0;
        detailEpisodeIndex = index;
        playlistPlaybackQueue.index = index;
      }
      for (itemIndex = 0; itemIndex < seriesContext.episodes.length; itemIndex += 1) {
        seriesContext.episodes[itemIndex].selected = itemIndex === detailEpisodeIndex;
      }
      currentDetail = detail;
      queueDetailMediaProfile(detail);
      renderSeasonTabs();
      renderEpisodeStrip();
      updatePlaylistQueueButton();
      startCurrentPlayback(null, versionAffinity);
    });
  }

  function handlePlaylistQueuePointerOverCapture(event) {
    var button = closestButton(event.target);
    if (!playlistQueueDrawerOpen || !button || !button.hasAttribute('data-playlist-queue-index')) { return; }
    pointerSelectionActive = true;
    playlistQueueDrawerIndex = Number(button.getAttribute('data-playlist-queue-index'));
    updatePlaylistQueueDrawerFocus();
  }

  function clearPlaylistPlaybackQueue() {
    playlistPlaybackLoadToken += 1;
    playlistPlaybackAutoToken += 1;
    if (playlistPlaybackRequest && playlistPlaybackRequest.abort) { playlistPlaybackRequest.abort(); }
    playlistPlaybackRequest = null;
    playlistPlaybackQueue = null;
    resetSeriesPlaybackQueue();
    closePlaylistQueueDrawer(false);
    updatePlaylistQueueButton();
  }

  function playlistQueueContainer() {
    var snapshot = libraryLifecycle && libraryLifecycle.snapshot ? libraryLifecycle.snapshot() : null;
    var container = snapshot && snapshot.container;
    return playbackQueueContainerKind(container) ? container : null;
  }

  function applyHydratedPlaylistQueue(items, item, container, preferredIndex, token) {
    var activeIndex = preferredIndex;
    var activeRatingKey = item.ratingKey;
    var nextQueue;
    if (token !== playlistPlaybackLoadToken) { return; }
    if (seriesContext && seriesContext.playlistQueue && detailEpisodeIndex >= 0 && currentDetail) {
      activeIndex = detailEpisodeIndex;
      activeRatingKey = currentDetail.ratingKey;
    }
    nextQueue = createPlaylistQueue(items, activeRatingKey, container.title, activeIndex);
    if (!nextQueue) { return; }
    playlistPlaybackQueue = nextQueue;
    if (seriesContext && seriesContext.playlistQueue) {
      seriesContext = playlistQueueSeriesContext(nextQueue);
      detailSeasonIndex = 0;
      detailEpisodeIndex = nextQueue.index;
      if (appView === 'player') { updateEpisodeCommands(); }
    }
    updatePlaylistQueueButton();
    if (playlistQueueDrawerOpen) { renderPlaylistQueueDrawer(); updatePlaylistQueueDrawerFocus(); }
  }

  function hydratePlaylistPlaybackQueue(container, item, preferredIndex) {
    var token = playlistPlaybackLoadToken += 1;
    var items = [];
    function loadPage(start) {
      playlistPlaybackRequest = PlexClient.loadLibraryContainerPage(config, container, start, 60, function (error, page) {
        var total;
        if (token !== playlistPlaybackLoadToken) { return; }
        playlistPlaybackRequest = null;
        if (error || !page) { return; }
        items = items.concat(page.items || []);
        total = Math.max(items.length, Number(page.totalSize || 0));
        if (items.length < total) { loadPage(items.length); return; }
        applyHydratedPlaylistQueue(items, item, container, preferredIndex, token);
      });
    }
    loadPage(0);
  }

  function preparePlaylistPlaybackQueue(item) {
    var container = playlistQueueContainer();
    var grid = libraryGridView && libraryGridView.snapshot ? libraryGridView.snapshot() : null;
    var preferredIndex = grid && grid.focus ? Number(grid.focus.index || 0) : 0;
    clearPlaylistPlaybackQueue();
    if (!container || !grid || !item) { return false; }
    playlistPlaybackQueue = createPlaylistQueue(grid.items || [], item.ratingKey, container.title, preferredIndex);
    if (!playlistPlaybackQueue) { return false; }
    updatePlaylistQueueButton();
    hydratePlaylistPlaybackQueue(container, item, preferredIndex);
    return true;
  }

  function activatePlaylistPlaybackQueue() {
    var ratingKey = currentDetail && currentDetail.ratingKey;
    var activeIndex;
    if (!playlistPlaybackQueue || !ratingKey) { return false; }
    if (seriesContext && seriesContext.playlistQueue && seriesContext.episodes[detailEpisodeIndex] &&
        String(seriesContext.episodes[detailEpisodeIndex].ratingKey || '') === String(ratingKey)) {
      activeIndex = detailEpisodeIndex;
    } else {
      activeIndex = playlistQueueFindIndex(playlistPlaybackQueue.items, ratingKey, playlistPlaybackQueue.index);
    }
    if (activeIndex < 0) { clearPlaylistPlaybackQueue(); return false; }
    playlistPlaybackQueue.index = activeIndex;
    seriesContext = playlistQueueSeriesContext(playlistPlaybackQueue);
    detailSeasonIndex = 0;
    detailEpisodeIndex = activeIndex;
    updatePlaylistQueueButton();
    return true;
  }

  function finishPlaylistDirectPlayTransition() {
    root.setTimeout(function () {
      document.body.className = document.body.className.replace(/\s*is-playlist-direct-start/g, '');
    }, 0);
  }

  function completePlaylistDirectPlayStart() {
    playlistDirectPlayPending = false;
  }

  function restorePlaylistDirectPlayOrigin() {
    var focused;
    if (!playlistDirectPlayOrigin) { return false; }
    playlistDirectPlayToken += 1;
    playlistDirectPlayOrigin = false;
    playlistDirectPlayPending = false;
    finishPlaylistDirectPlayTransition();
    clearPlaylistPlaybackQueue();
    leaveDetail();
    appView = 'library';
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('library-view').className = 'library-view' +
      (activeLibrary && activeLibrary.globalPlaylists ? ' is-global-playlists' : '');
    updateLibraryFocus();
    focused = libraryGridView && libraryGridView.focusedItem ? libraryGridView.focusedItem() : null;
    if (focused) { scheduleTheme(focused); }
    return true;
  }

  function failPlaylistDirectPlayStart(message) {
    restorePlaylistDirectPlayOrigin();
    showMessage(message || t('status.metadataUnavailable'));
  }

  function startPlaylistContainerPlayback(container) {
    var token;
    var items = [];
    if (!container || playbackQueueContainerKind(container) !== 'playlist' || playlistDirectPlayPending) { return false; }
    clearPlaylistPlaybackQueue();
    playlistDirectPlayOrigin = true;
    playlistDirectPlayPending = true;
    token = playlistDirectPlayToken += 1;
    document.body.className = document.body.className.replace(/\s*is-playlist-direct-start/g, '') + ' is-playlist-direct-start';

    function openTarget(playable) {
      var targetIndex = playlistQueueFirstUnwatchedIndex(playable);
      var target = targetIndex >= 0 ? playable[targetIndex] : null;
      if (!target || token !== playlistDirectPlayToken) { failPlaylistDirectPlayStart(t('status.mediaUnavailable')); return; }
      playlistPlaybackQueue = createPlaylistQueue(playable, target.ratingKey, container.title, targetIndex);
      if (!playlistPlaybackQueue) { failPlaylistDirectPlayStart(t('status.mediaUnavailable')); return; }
      prepareDetailTransition(target);
      selectedItem = target;
      detailReturnView = 'library';
      detailPlayPending = false;
      detailPreferenceState.clear();
      seriesContext = playlistQueueSeriesContext(playlistPlaybackQueue);
      detailSeasonIndex = 0;
      detailEpisodeIndex = playlistPlaybackQueue.index;
      detailZone = 'play';
      detailActionIndex = 0;
      appView = 'detail';
      setDetailViewMode(false);
      document.getElementById('detail-view').className = 'detail-view is-hidden';
      PlexClient.loadMetadata(config, target.ratingKey, function (error, detail) {
        if (token !== playlistDirectPlayToken || !playlistDirectPlayOrigin) { return; }
        if (error || !detail) { failPlaylistDirectPlayStart(t('status.metadataUnavailable')); return; }
        renderDetail(detail, true);
        activatePlaylistPlaybackQueue();
        openPlayer();
        finishPlaylistDirectPlayTransition();
      });
    }

    function loadPage(start) {
      playlistPlaybackRequest = PlexClient.loadLibraryContainerPage(config, container, start, 60, function (error, page) {
        var total;
        if (token !== playlistDirectPlayToken) { return; }
        playlistPlaybackRequest = null;
        if (error || !page) { failPlaylistDirectPlayStart(t('status.libraryUnavailable')); return; }
        items = items.concat(page.items || []);
        total = Math.max(items.length, Number(page.totalSize || 0));
        if (items.length < total) { loadPage(items.length); return; }
        openTarget(playlistQueuePlayable(items));
      });
    }

    loadPage(0);
    return true;
  }

  function consumePlaylistEvent(event) {
    if (event.preventDefault) { event.preventDefault(); }
    if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); }
    else if (event.stopPropagation) { event.stopPropagation(); }
  }

  function openPlaylistLibraryItem(item, playImmediately) {
    var token;
    var attempts = 0;
    if (!preparePlaylistPlaybackQueue(item)) { return false; }
    if (!playImmediately) { openDetail(item); return true; }
    token = playlistPlaybackAutoToken;
    openDetail(item);
    function attemptPlayback() {
      if (token !== playlistPlaybackAutoToken || appView !== 'detail') { return; }
      if (currentDetail && currentDetail.ratingKey && String(currentDetail.ratingKey) === String(item.ratingKey)) {
        activatePlaylistPlaybackQueue();
        openPlayer();
        return;
      }
      attempts += 1;
      if (attempts < 240) { root.setTimeout(attemptPlayback, 25); }
    }
    root.setTimeout(attemptPlayback, 0);
    return true;
  }

  function clearPlaylistQueueForExternalSelection(button) {
    if (!button) { return; }
    if (button.hasAttribute('data-row-index') || button.hasAttribute('data-search-index') ||
        button.hasAttribute('data-watchlist-index') || button.hasAttribute('data-episode-position') ||
        button.hasAttribute('data-nav-index')) {
      clearPlaylistPlaybackQueue();
    }
  }

  function handlePlaylistQueueKeyCapture(event) {
    var item;
    var playImmediately;
    if (playlistDirectPlayPending && appView !== 'player') {
      consumePlaylistEvent(event);
      if (event.keyCode === 27 || event.keyCode === 461) { restorePlaylistDirectPlayOrigin(); }
      return;
    }
    if (appView === 'player') {
      if (playlistQueueDrawerOpen) {
        consumePlaylistEvent(event);
        if (event.keyCode === 38) { movePlaylistQueueDrawerFocus(-1); }
        else if (event.keyCode === 40) { movePlaylistQueueDrawerFocus(1); }
        else if (event.keyCode === 13 || event.keyCode === 415) { switchPlayerQueueItem(playlistQueueDrawerIndex); }
        else if (event.keyCode === 27 || event.keyCode === 461 || event.keyCode === 37) { closePlaylistQueueDrawer(true); }
        return;
      }
      if (playerControlsMode === 'full' && playerZone === 'buttons' && playerButtonIndex === 3 &&
          (event.keyCode === 13 || event.keyCode === 415)) {
        consumePlaylistEvent(event);
        openPlaylistQueueDrawer();
        return;
      }
    }
    if (appView === 'library' && libraryZone === 'grid' && event.keyCode === 415) {
      item = libraryGridView.focusedItem();
      if (item && item.containerKey && playbackQueueContainerKind(item) === 'playlist') {
        consumePlaylistEvent(event);
        startPlaylistContainerPlayback(item);
        return;
      }
    }
    if (appView === 'library' && libraryZone === 'grid' && (event.keyCode === 13 || event.keyCode === 415)) {
      item = libraryGridView.focusedItem();
      if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
        consumePlaylistEvent(event);
        playImmediately = event.keyCode === 415;
        openPlaylistLibraryItem(item, playImmediately);
        return;
      }
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && playlistPlaybackQueue && currentDetail &&
        (event.keyCode === 13 || event.keyCode === 415) && detailZone === 'episodes') {
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && playlistPlaybackQueue && currentDetail &&
        ((event.keyCode === 415 && detailZone !== 'episodes') ||
         (event.keyCode === 13 && detailZone === 'play' && detailActionIndex === 0))) {
      if (activatePlaylistPlaybackQueue()) {
        consumePlaylistEvent(event);
        openPlayer();
      }
      return;
    }
    if ((event.keyCode === 13 || event.keyCode === 415) && navigationHasFocus()) {
      clearPlaylistPlaybackQueue();
      return;
    }
    if ((appView === 'home' || appView === 'search' || appView === 'watchlist') &&
        (event.keyCode === 13 || event.keyCode === 415)) {
      clearPlaylistPlaybackQueue();
    }
  }

  function handlePlaylistQueuePointerCapture(event) {
    var button = closestButton(event.target);
    var item;
    if (playlistDirectPlayPending && appView !== 'player') { consumePlaylistEvent(event); return; }
    if (!button || button.disabled) { return; }
    if (appView === 'player' && button.id === 'player-playlist-queue-button') {
      consumePlaylistEvent(event);
      openPlaylistQueueDrawer();
      return;
    }
    if (appView === 'player' && playlistQueueDrawerOpen && button.hasAttribute('data-playlist-queue-index')) {
      consumePlaylistEvent(event);
      playlistQueueDrawerIndex = Number(button.getAttribute('data-playlist-queue-index'));
      switchPlayerQueueItem(playlistQueueDrawerIndex);
      return;
    }
    if (appView === 'player' && playlistQueueDrawerOpen) { consumePlaylistEvent(event); return; }
    if (appView === 'library' && (button.hasAttribute('data-library-index') || button.hasAttribute('data-library-recommendation-row'))) {
      libraryGridView.pointerFocus(button);
      item = libraryGridView.focusedItem();
      if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
        consumePlaylistEvent(event);
        openPlaylistLibraryItem(item, false);
        return;
      }
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && button.id === 'detail-play' && activatePlaylistPlaybackQueue()) {
      consumePlaylistEvent(event);
      openPlayer();
      return;
    }
    clearPlaylistQueueForExternalSelection(button);
  }

  ensurePlaylistQueueUi();
  updatePlaylistQueueButton();
  document.addEventListener('keydown', handlePlaylistQueueKeyCapture, true);
  document.addEventListener('click', handlePlaylistQueuePointerCapture, true);
  document.addEventListener('mouseover', handlePlaylistQueuePointerOverCapture, true);
