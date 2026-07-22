  // Global input dispatch, view closure, event wiring, Home loading, bootstrap.
  function leaveDetail() {
    hideViewState();
    hideDetailMetadataStatus();
    setDetailViewMode(false);
    document.body.className = document.body.className.replace(/\s*is-movie-detail/g, '');
    selectedItem = null;
    detailPlayPending = false;
    currentDetail = null;
    detailPreferenceState.clear();
    detailMediaProfileRatingKey = '';
    detailMediaProfileLoading = false;
    seasonTransitionMediaKey = '';
    detailMediaLoadingLabelVisible = false;
    detailMediaProfileToken += 1;
    root.clearTimeout(detailMediaProfileTimer);
    detailMediaProfileTimer = null;
    root.clearTimeout(detailMediaLoadingLabelTimer);
    detailMediaLoadingLabelTimer = null;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    seriesContext = null;
    episodeResolver.cancel();
    root.clearTimeout(detailMetadataTimer);
    root.clearTimeout(seasonPreviewTimer);
    seasonPreviewToken += 1;
    if (detailEpisodeView) { detailEpisodeView.reset(); }
    posterLoader.cancelScope('detail');
    document.getElementById('detail-play').className = 'detail-action';
    document.getElementById('detail-refresh-metadata').disabled = false;
    detailRefreshPending = false;
    document.getElementById('detail-view').className = 'detail-view is-hidden';
  }

  function closeDetail() {
    var returnToSearch = detailReturnView === 'search';
    var returnToLibrary = detailReturnView === 'library';
    var returnToWatchlist = detailReturnView === 'watchlist';
    leaveDetail();
    appView = returnToSearch ? 'search' : (returnToLibrary ? 'library' : (returnToWatchlist ? 'watchlist' : 'home'));
    if (returnToSearch) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('search-view').className = 'search-view';
      if (searchSnapshot().query.length >= 2) { scheduleSearch(); }
      updateSearchFocus();
    } else if (returnToLibrary) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('library-view').className = 'library-view' + (activeLibrary && activeLibrary.globalPlaylists ? ' is-global-playlists' : '');
      loadLibraryContent(true);
      updateLibraryFocus();
    } else if (returnToWatchlist) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('watchlist-view').className = 'watchlist-view';
      renderWatchlistGrid(); updateWatchlistFocus();
    } else {
      revealHome({ focus: 'preserve' });
    }
  }

  function directionForKey(keyCode) {
    return { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[keyCode];
  }

  function recoverActiveViewAfterNetwork() {
    if (appView === 'home') { loadHomeRows(); }
    else if (appView === 'library') { loadLibraryContent(true); }
    else if (appView === 'watchlist') { loadWatchlistData(true); }
    else if (appView === 'search' && searchSnapshot().query.replace(/^\s+|\s+$/g, '').length >= 2) { scheduleSearch(); }
    else if (appView === 'detail' && selectedItem) { loadSelectedDetail(selectedItem); }
  }

  function renderAutoplayCountdown() {
    setText('autoplay-title', t('player.nextEpisode', { seconds: autoplaySeconds }));
  }

  function cancelAutoplayCountdown() {
    autoplayVisible = false;
    root.clearTimeout(autoplayTimer);
    autoplayTimer = null;
    document.getElementById('autoplay-prompt').className = 'autoplay-prompt is-hidden';
  }

  function confirmAutoplayCountdown() {
    if (!autoplayVisible) { return; }
    cancelAutoplayCountdown();
    switchPlayerEpisode(1);
  }

  function startAutoplayCountdown() {
    var context = episodeNavigationContext();
    if (appSettings.autoplayDelay === 0 || !context || !episodeResolver.canMove(context, 1)) { return; }
    autoplayVisible = true;
    autoplaySeconds = appSettings.autoplayDelay;
    document.getElementById('autoplay-prompt').className = 'autoplay-prompt';
    renderAutoplayCountdown();
    function tick() {
      autoplayTimer = root.setTimeout(function () {
        if (!autoplayVisible || appView !== 'player') { return; }
        autoplaySeconds -= 1;
        if (autoplaySeconds <= 0) { confirmAutoplayCountdown(); }
        else { renderAutoplayCountdown(); tick(); }
      }, 1000);
    }
    tick();
  }

  function handleSearchKeyDown(event, direction) {
    var snapshot = searchSnapshot();
    event.preventDefault();
    if (appSettings.searchT9Input && searchView.inputKeyCode(event.keyCode)) { return; }
    if (event.keyCode === 27 || event.keyCode === 461) {
      searchView.back();
      return;
    }
    if (event.keyCode === 8) {
      if (searchView.backspaceT9()) { return; }
      searchView.applyKey('backspace');
      return;
    }
    if (event.keyCode === 415 && snapshot.focus.zone === 'results') {
      playHomeItem(snapshot.results[snapshot.focus.index]);
      return;
    }
    if (direction) {
      searchView.flushT9();
      searchView.handleDirection(direction);
      return;
    }
    if (event.keyCode !== 13) { return; }
    searchView.flushT9();
    searchView.activate();
  }

  function handleLibraryBack() {
    var now = new Date().getTime();
    if (closeLibraryContainer()) { libraryBackLockedUntil = now + 600; return; }
    if (libraryZone === 'nav') { closeLibrary(); return; }
    if (libraryZone !== 'tabs') {
      libraryZone = 'tabs';
      libraryBackLockedUntil = now + 600;
      document.getElementById('library-grid').scrollTop = 0;
      updateLibraryFocus();
      return;
    }
    if (now < libraryBackLockedUntil) { return; }
    closeLibrary();
  }

  function handleLibraryKeyDown(event, direction) {
    var next;
    wheelNavigationActive = false;
    if (libraryFilterView.isOpen()) { handleLibraryFilterKeyDown(event, direction); return; }
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) { handleLibraryBack(); return; }
    if (event.keyCode === 415 && libraryZone === 'grid') {
      var playItem = libraryGridView.focusedItem();
      if (!playItem || playItem.containerKey) { return; }
      playHomeItem(playItem); return;
    }
    if (libraryZone === 'nav') {
      if (direction === 'left' || direction === 'right') {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); updateLibraryFocus();
        scheduleNavigationPreview(state.navIndex);
      } else if (direction === 'down') { libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'grid' : 'tabs'; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
        else { enterActiveNavigationView(); }
      }
      return;
    }
    if (libraryZone === 'tabs') {
      if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); return; }
      if (direction === 'left' || direction === 'right') {
        if (direction === 'right' && libraryTabIndex === LibraryContainers.views().length - 1) { libraryZone = 'actions'; libraryActionIndex = 0; updateLibraryFocus(); return; }
        next = nextLibraryTab(direction === 'left' ? -1 : 1);
        if (next !== libraryTabIndex) {
          selectLibraryTab(next);
        }
        return;
      }
      if (direction === 'down' || event.keyCode === 13) { focusLibraryTabContent(); }
      return;
    }
    if (libraryZone === 'actions') {
      if (direction === 'left') {
        if (libraryActionIndex > 0) { libraryActionIndex -= 1; }
        else { libraryZone = 'tabs'; libraryTabIndex = LibraryContainers.views().length - 1; }
        updateLibraryFocus();
      } else if (direction === 'right') {
        libraryActionIndex = Math.min(1, libraryActionIndex + 1); updateLibraryFocus();
      } else if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (direction === 'down') { libraryZone = libraryViewKey() === 'catalog' ? 'filter' : 'grid'; libraryControlIndex = 0; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (libraryActionIndex === 0) { refreshActiveLibrary(); }
        else { refreshActiveLibraryMetadata(); }
      }
      return;
    }
    if (libraryViewKey() === 'recommended') {
      next = libraryGridView.handleDirection(direction);
      if (next.leave) { libraryZone = 'tabs'; updateLibraryFocus(); return; }
      if (event.keyCode === 13 && libraryGridView.focusedItem()) {
        openDetail(libraryGridView.focusedItem());
        return;
      }
      updateLibraryFocus();
      return;
    }
    if (libraryZone === 'sort') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('sort', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up' || direction === 'down') {
        next = LibraryContainers.moveControlVertical('sort', direction);
        if (next.zone !== 'grid' || libraryGridView.snapshot().items.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) { activateLibrarySort(['titleSort', 'audienceRating', 'year'][libraryControlIndex]); }
      return;
    }
    if (libraryZone === 'filter') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('filter', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up') {
        libraryZone = 'actions'; libraryActionIndex = 0; updateLibraryFocus();
      }
      else if (direction === 'down') {
        next = LibraryContainers.moveControlVertical('filter', direction);
        if (next.zone !== 'grid' || libraryGridView.snapshot().items.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) {
        if (libraryControlIndex === 3) { openLibraryFilterDrawer(); }
        else { activateLibraryFilter(['all','unwatched','watched'][libraryControlIndex]); }
      }
      return;
    }
    next = libraryGridView.handleDirection(direction);
    if (next.leave) {
      libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'nav' : (libraryViewKey() === 'catalog' ? 'filter' : 'tabs');
      libraryControlIndex = ['all','unwatched','watched'].indexOf(libraryWatchedFilter);
    } else if (event.keyCode === 13 && libraryGridView.focusedItem()) {
      if (libraryGridView.focusedItem().containerKey) { openLibraryContainer(libraryGridView.focusedItem()); }
      else { openDetail(libraryGridView.focusedItem()); }
      return;
    }
    var librarySnapshot = libraryGridView.snapshot();
    if (libraryUsesGridScroll() && librarySnapshot.items.length < librarySnapshot.totalSize && librarySnapshot.focus.index >= librarySnapshot.items.length - librarySnapshot.layout.columns * 2) { loadLibraryContent(false); }
    updateLibraryFocus();
  }

  function handleWatchlistKeyDown(event, direction) {
    watchlistView.handleKeyDown(event, direction);
  }

  function handleSetupBack() {
    setupController.back();
  }

  function handleSetupKeyDown(event) {
    var buttons = document.querySelectorAll('#setup-view button');
    var active = document.activeElement;
    var keyCode = event.keyCode;
    if (keyCode === 27 || keyCode === 461) { event.preventDefault(); handleSetupBack(); return; }
    if (setupStage === 'profile-pin') {
      if (keyCode === 8) { event.preventDefault(); setupController.backspace(); return; }
      if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
        event.preventDefault(); setupController.inputDigit(keyCode); return;
      }
      if (keyCode === 13 && active && active.id === 'setup-address') {
        event.preventDefault(); setupController.activate('unlock-profile'); return;
      }
    }
    if (active && active.id === 'setup-address') {
      if (keyCode === 13) {
        event.preventDefault();
        if (setupStage === 'manual') { setupController.activate('connect-manual', { address: active.value }); }
      } else if ((keyCode === 38 || keyCode === 40) && buttons.length) {
        event.preventDefault();
        setupController.setFocus(0, buttons.length);
      }
      return;
    }
    event.preventDefault();
    if (!buttons.length) { return; }
    if (keyCode === 38 || keyCode === 37) { setupController.moveFocus(-1, buttons.length); }
    else if (keyCode === 40 || keyCode === 39) { setupController.moveFocus(1, buttons.length); }
    else if (keyCode === 13 && buttons[setupController.snapshot().focusIndex]) {
      activateSetupButton(buttons[setupController.snapshot().focusIndex]);
    }
  }

  function onKeyDown(event) {
    var direction = directionForKey(event.keyCode);
    var layout;

    if (direction && pageScrollPendingFocus) {
      syncFocusAfterPageScroll();
      pageScrollPendingFocus = false;
    }

    if (choiceDialogView.snapshot().open) {
      event.preventDefault();
      if (event.keyCode === 38) { choiceDialogView.move(-1); }
      else if (event.keyCode === 40) { choiceDialogView.move(1); }
      else if (event.keyCode === 13) { closeChoiceDialog(true); }
      else if (event.keyCode === 27 || event.keyCode === 461) { closeChoiceDialog(false); }
      return;
    }

    if (appView === 'setup') {
      handleSetupKeyDown(event);
      return;
    }

    if (appView === 'diagnostics') {
      handleDiagnosticsKey(event, direction);
      return;
    }

    if (handleViewStateKey(event, direction)) { event.preventDefault(); return; }

    if (navigationHasFocus() && navReorderMode) {
      event.preventDefault();
      if (direction === 'left') { moveNavLibrary(-1); }
      else if (direction === 'right') { moveNavLibrary(1); }
      else if (event.keyCode === 27 || event.keyCode === 461) { finishNavReorder(false); }
      else if (event.keyCode === 13 && navReorderReady) { finishNavReorder(true); }
      return;
    }

    if (appView === 'library') {
      handleLibraryKeyDown(event, direction);
      return;
    }

    if (appView === 'watchlist') {
      handleWatchlistKeyDown(event, direction);
      return;
    }

    if (appView === 'settings') {
      var settingsSnapshot = settingsView.snapshot();
      event.preventDefault();
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (serverEditorView.snapshot().open) { closeServerEditor(); }
        else if (settingsSnapshot.languageKind) { closeLanguageEditor(); }
        else { closeAppSettings(); }
      } else if (settingsSnapshot.zone === 'nav') {
        if (direction === 'left' || direction === 'right') {
          state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
          renderNavigation();
          updateSettingsFocus();
          scheduleNavigationPreview(state.navIndex);
        } else if (direction === 'down') {
          settingsView.focusList(settingsSnapshot.index, settingsRows().length);
          renderAppSettings();
        } else if (event.keyCode === 13) {
          if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
          else { enterActiveNavigationView(); }
        }
      } else if (serverEditorView.snapshot().open) {
        if (event.keyCode === 38 && serverEditorView.snapshot().index === 0) { closeServerEditor(); }
        else if (event.keyCode === 38) { serverEditorView.focus(serverEditorView.snapshot().index - 1, serverState.servers.length + 2); renderServerEditor(); }
        else if (event.keyCode === 40) { serverEditorView.focus(serverEditorView.snapshot().index + 1, serverState.servers.length + 2); renderServerEditor(); }
        else if (event.keyCode === 13) { activateServerEditorRow(); }
      } else if (settingsSnapshot.languageKind) {
        if (event.keyCode === 38) { settingsView.focusLanguage(settingsSnapshot.languageIndex - 1, orderedEditorLanguages().length); renderLanguageEditor(); }
        else if (event.keyCode === 40) { settingsView.focusLanguage(settingsSnapshot.languageIndex + 1, orderedEditorLanguages().length); renderLanguageEditor(); }
        else if (event.keyCode === 37) { moveEditorLanguage(-1); }
        else if (event.keyCode === 39) { moveEditorLanguage(1); }
        else if (event.keyCode === 13) { toggleEditorLanguage(); }
      } else if (event.keyCode === 38 && settingsSnapshot.index === 0) {
        settingsView.focusNavigation();
        renderNavigation();
        updateSettingsFocus();
      } else if (event.keyCode === 38) {
        settingsView.focusList(settingsSnapshot.index - 1, settingsRows().length); renderAppSettings();
      } else if (event.keyCode === 40) {
        settingsView.focusList(settingsSnapshot.index + 1, settingsRows().length); renderAppSettings();
      } else if (event.keyCode === 37) {
        changeSetting(-1);
      } else if (event.keyCode === 39) {
        changeSetting(1);
      } else if (event.keyCode === 13) {
        openAppSettingChoice();
      }
      return;
    }

    if (appView === 'search') {
      handleSearchKeyDown(event, direction);
      return;
    }

    if (appView === 'player') {
      event.preventDefault();
      if (handleResumeChoiceKey(event, direction)) { return; }
      if (handlePlayerErrorKey(event, direction)) { return; }
      if (handleSubtitleEditorKey(event, direction)) { return; }
      if (event.keyCode === 27 || event.keyCode === 461) { handlePlayerBack(); return; }
      if (autoplayVisible && (event.keyCode === 13 || event.keyCode === 415)) { confirmAutoplayCountdown(); return; }
      if (event.keyCode === 415) {
        document.getElementById('player-video').play();
        return;
      }
      if (event.keyCode === 19) {
        document.getElementById('player-video').pause();
        return;
      }
      if (chapterState.open) {
        showPlayerControls();
        if (event.keyCode === 37 || event.keyCode === 39) {
          chapterState = ChapterState.move(chapterState, playerChapters().length, event.keyCode === 37 ? -1 : 1);
          updateChapterFocus();
        } else if (event.keyCode === 38) {
          closeChapterDrawer(true);
        } else if (event.keyCode === 13) {
          activateChapter();
        }
        return;
      }
      if (playerControlsMode === 'full' && event.keyCode === 40 && playerZone === 'buttons' && playerButtonIndex === 1 && playerChapters().length) {
        openChapterDrawer();
        return;
      }
      if (event.keyCode === 13 && playerZone === 'skip' && skipMarkerState.visible) {
        activateSkipMarker();
        return;
      }
      if (event.keyCode === 413) {
        closePlayer();
      } else if (settingsOpen) {
        showPlayerControls();
        if (event.keyCode === 38) { movePlayerSetting(-1); }
        else if (event.keyCode === 40) { movePlayerSetting(1); }
        else if (event.keyCode === 37) { cycleSetting(-1); }
        else if (event.keyCode === 39) { cycleSetting(1); }
        else if (event.keyCode === 13) {
          openPlayerSettingChoice();
        }
      } else if (playerControlsMode === 'hidden' && event.keyCode === 13) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'ok');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode !== 'full' && (event.keyCode === 37 || event.keyCode === 39 || event.keyCode === 412 || event.keyCode === 417)) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'seek');
        playerZone = 'timeline';
        seekPlayer(event.keyCode === 37 || event.keyCode === 412 ? -1 : 1);
        showPlayerTimeline();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode === 'timeline' && event.keyCode === 13) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'ok');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode !== 'full' && (event.keyCode === 38 || event.keyCode === 40)) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'navigate');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (event.keyCode === 38 && playerZone === 'timeline' && skipMarkerState.visible) {
        showPlayerControls();
        playerZone = 'skip'; updatePlayerButtonFocus();
      } else if (event.keyCode === 40 && playerZone === 'skip') {
        showPlayerControls();
        playerZone = 'timeline'; updatePlayerButtonFocus();
      } else if (event.keyCode === 38) {
        showPlayerControls();
        playerZone = 'timeline'; updatePlayerButtonFocus();
      } else if (event.keyCode === 40) {
        showPlayerControls();
        playerZone = 'buttons'; updatePlayerButtonFocus();
      } else if (playerZone === 'skip' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        playerZone = 'buttons'; playerButtonIndex = 1; updatePlayerButtonFocus();
      } else if (playerZone === 'timeline' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        seekPlayer(event.keyCode === 37 ? -1 : 1);
      } else if (playerZone === 'buttons' && event.keyCode === 37 && chapterHintVisible() &&
          (playerButtonIndex === 0 || (playerButtonIndex === 1 && !playerButtonAvailable(0)))) {
        showPlayerControls();
        playerZone = 'chapter-hint'; updatePlayerButtonFocus();
      } else if (playerZone === 'chapter-hint' && event.keyCode === 39) {
        showPlayerControls();
        playerZone = 'buttons'; playerButtonIndex = playerButtonAvailable(0) ? 0 : 1; updatePlayerButtonFocus();
      } else if (playerZone === 'buttons' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        movePlayerButton(event.keyCode === 37 ? -1 : 1);
      } else if (event.keyCode === 13) {
        showPlayerControls();
        if (playerZone === 'skip') { activateSkipMarker(); return; }
        if (playerZone === 'chapter-hint') { openChapterDrawer(); return; }
        if (playerZone === 'timeline') { return; }
        if (playerButtonIndex === 0) { switchPlayerEpisode(-1); }
        else if (playerButtonIndex === 2) { switchPlayerEpisode(1); }
        else if (playerButtonIndex === 3) { setSettingsOpen(true); }
        else { togglePlayback(); }
      } else if (event.keyCode === 412 || event.keyCode === 417) {
        showPlayerControls();
        seekPlayerTo(playerAbsoluteTime() + (event.keyCode === 412 ? -10 : 10));
      }
      return;
    }

    if (appView === 'detail') {
      if (detailPresentationSnapshot().mediaInfoDialogOpen) {
        event.preventDefault();
        if (event.keyCode === 27 || event.keyCode === 461) { closeDetailMediaInfo(); }
        else if (direction === 'up') { scrollDetailMediaInfo(-1); }
        else if (direction === 'down') { scrollDetailMediaInfo(1); }
        return;
      }
      if (detailPresentationSnapshot().summaryDialogOpen) {
        event.preventDefault();
        if (event.keyCode === 27 || event.keyCode === 461) { closeDetailSummary(); }
        else if (direction === 'up') { scrollDetailSummary(-1); }
        else if (direction === 'down') { scrollDetailSummary(1); }
        return;
      }
      if (event.keyCode === 415) {
        event.preventDefault();
        if (detailZone === 'episodes' && seriesContext) { playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]); }
        else { openPlayer(); }
      } else if ((event.keyCode === 27 || event.keyCode === 461) && new Date().getTime() >= detailBackLockedUntil) {
        event.preventDefault();
        closeDetail();
      } else if (direction) {
        event.preventDefault();
        navigateDetail(direction);
      } else if (event.keyCode === 13) {
        event.preventDefault();
        if (detailZone === 'nav') {
          if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
          else { enterActiveNavigationView(); }
        } else if (detailZone === 'seasons') {
          loadSelectedSeason();
        } else if (detailZone === 'episodes') {
          playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]);
        } else if (detailZone === 'audio') {
          openDetailChoice('audio');
        } else if (detailZone === 'subtitles') {
          openDetailChoice('subtitles');
        } else if (detailZone === 'version') {
          openDetailChoice('version');
        } else if (detailZone === 'summary') {
          openDetailSummary();
        } else if (detailZone === 'media-info') {
          openDetailMediaInfo();
        } else if (detailActionIndex === 1) {
          toggleCurrentWatched();
        } else if (detailActionIndex === 2) {
          toggleCurrentWatchlist();
        } else if (detailActionIndex === 3) {
          refreshCurrentMetadata();
        } else {
          openPlayer();
        }
      }
      return;
    }

    if (appView === 'home' && state.area === 'nav') {
      if (event.keyCode === 13) {
        event.preventDefault();
        if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') {
          startNavHold(state.navIndex);
        } else {
          activateNavigationSelection();
        }
        return;
      }
    }

    if (event.keyCode === 415 && state.area === 'media') {
      event.preventDefault();
      playHomeItem(data.rows[state.rowIndex].items[state.column]);
      return;
    }

    if (direction) {
      event.preventDefault();
      layout = {
        navCount: navigationFocusCount(),
        rowLengths: data.rows.map(function (row) { return row.items.length; })
      };
      state = FocusModel.move(state, direction, layout);
      updateFocus();
      if (state.area === 'nav' && (direction === 'left' || direction === 'right')) { scheduleNavigationPreview(state.navIndex); }
    } else if (event.keyCode === 13) {
      event.preventDefault();
      activate();
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      event.preventDefault();
      focusHomeStart();
    }
  }

  function updateClock() {
    var now = new Date();
    var hours = String(now.getHours());
    var minutes = String(now.getMinutes());
    document.getElementById('clock').innerHTML =
      (hours.length < 2 ? '0' : '') + hours + ':' +
      (minutes.length < 2 ? '0' : '') + minutes;
  }

  function passiveHomeState(messageKey) {
    if (state.area !== 'nav') { return false; }
    hideViewState();
    showMessage(t(messageKey));
    updateFocus();
    return true;
  }

  function usePlexRows(rows, navIndex, options) {
    var availableRows = HomeState.normalizeRows(rows);
    var baseState;
    var selectedKey;
    options = options || {};

    if (!availableRows.length) {
      completeStartup();
      if (appView === 'home' && !passiveHomeState('state.homeEmpty')) { showViewState('empty', 'home', null, openSetup); }
      return;
    }
    hideViewState();
    data.rows = availableRows;
    renderRows();
    baseState = options.focus === 'nav'
      ? { area: 'nav', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
      : (options.focus === 'first'
        ? { area: 'media', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
        : { area: 'media', navIndex: navIndex || 0, rowIndex: state.rowIndex || 0, column: state.column || 0 });
    selectedKey = options.focus === 'preserve' ? (options.selectionKey || lastHomeSelectionKey) : '';
    state = HomeState.restoreFocus(availableRows, baseState, selectedKey);
    homeDomDirty = false;
    if (options.focus === 'first') { document.getElementById('content').scrollTop = 0; }
    updateFocus();
    completeStartup();
  }

  function loadHomeRows() {
    if (appView === 'home' && !data.rows.length && !passiveHomeState('state.homeLoading')) { showViewState('loading', 'home', null, null); }
    homeRefreshCoordinator.refresh();
  }

  function loadPlex() {
    if (!config.apiBaseUrl || !PlexClient) {
      return;
    }
    scheduleServerActivityPoll(0);
    PlexClient.loadNavigation(config, function (error, items) {
      if (error) {
        attemptServerFailover(error, function (switched) {
          if (switched) { loadPlex(); return; }
          loadHomeRows();
        });
        return;
      }
      serverFailoverFailedUris = {};
      if (!error && items.length) {
        applyNavigationVisibility(NavigationModel.applyLibraryOrder(items, NavigationModel.load(root.localStorage)));
        data.navigation = items.map(function (item) { return item.title; });
        renderNavigation();
      }
      loadHomeRows();
      if (watchlistAvailable()) { loadWatchlistData(false); }
    });
    if (!config.token) { return; }
    PlexClient.loadAccountProfile(config, function (error, account) {
      if (!error && account) {
        appSettings = Settings.seedFromPlex(appSettings, account);
        saveAppSettings();
        renderNavigation();
        if (appView === 'settings') { renderAppSettings(); }
      }
    });
  }

  function bootstrapPlex() {
    var selected = serverForUri(serverState.activeUri);
    saveAppSettings();
    renderActiveProfile();
    if (AuthStore && AuthStore.needsOnboarding(serverState, authState)) {
      openSetup();
      return;
    }
    if (!authState.setupComplete && serverState.activeUri) {
      authState.setupComplete = true;
      authState.mode = 'offline';
      authState = AuthStore.save(root.localStorage, authState);
    }
    if (!selected && configuredServer) { selected = serverForUri(configuredServer.uri) || configuredServer; }
    if (!selected && serverState.servers.length) { selected = serverState.servers[0]; }
    if (selected) {
      applyServer(selected);
      resumeRemoteConnectionVerification(selected);
    }
    if (config.apiBaseUrl) { loadPlex(); }
    discoverLocalServers(function () {
      if (!config.apiBaseUrl && serverState.servers.length) {
        applyServer(serverState.servers[0]);
        loadPlex();
      }
    });
  }

  function closestButton(node) {
    while (node && node !== document) {
      if (node.tagName && node.tagName.toLowerCase() === 'button') { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function syncPointerFocus(button) {
    var index;
    if (!button || button.disabled) { return; }
    pageScrollPendingFocus = false;
    pointerSelectionActive = true;
    if (button.hasAttribute('data-subtitle-editor') && subtitleEditorOpen) {
      var subtitleControls = subtitleEditorControls();
      for (index = 0; index < subtitleControls.length; index += 1) {
        if (subtitleControls[index] === button) { subtitleEditorIndex = index; break; }
      }
      renderSubtitleEditor();
    } else if (button.hasAttribute('data-diagnostics-action') && appView === 'diagnostics') {
      diagnosticsView.setFocus(button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1);
    } else if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      renderResumeChoice();
    } else if (button.hasAttribute('data-setup-language') || button.hasAttribute('data-setup-action') || button.hasAttribute('data-setup-server') || button.hasAttribute('data-setup-profile')) {
      var setupButtons = document.querySelectorAll('#setup-view button');
      for (index = 0; index < setupButtons.length; index += 1) {
        if (setupButtons[index] === button) { setupController.setFocus(index, setupButtons.length); break; }
      }
    } else if (button.hasAttribute('data-nav-index')) {
      state.navIndex = Number(button.getAttribute('data-nav-index'));
      state.area = 'nav';
      if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
      else if (appView === 'search') { searchView.focusNavigation(state.navIndex); }
      else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (appView === 'watchlist') { watchlistView.focusNavigation(); }
      else if (appView === 'settings') { settingsView.focusNavigation(); updateSettingsFocus(); }
      else if (appView === 'home') { updateFocus(); }
    } else if (button.hasAttribute('data-row-index')) {
      state.area = 'media';
      state.rowIndex = Number(button.getAttribute('data-row-index'));
      state.column = Number(button.getAttribute('data-column'));
      updateFocus();
    } else if (button.hasAttribute('data-season-position')) {
      detailZone = 'seasons';
      detailSeasonIndex = Number(button.getAttribute('data-season-position'));
      updateDetailFocus();
    } else if (button.hasAttribute('data-episode-position')) {
      detailZone = 'episodes';
      detailEpisodeIndex = Number(button.getAttribute('data-episode-position'));
      updateDetailFocus();
    } else if (button.id === 'detail-play' || button.id === 'detail-watched' || button.id === 'detail-watchlist' || button.id === 'detail-refresh-metadata') {
      detailZone = 'play';
      detailActionIndex = button.id === 'detail-play' ? 0 : (button.id === 'detail-watched' ? 1 : (button.id === 'detail-watchlist' ? 2 : 3));
      updateDetailFocus();
    } else if (button.id === 'detail-audio' || button.id === 'detail-subtitles' || button.id === 'detail-version') {
      detailZone = button.id === 'detail-audio' ? 'audio' : (button.id === 'detail-subtitles' ? 'subtitles' : 'version');
      updateDetailFocus();
    } else if (button.id === 'detail-summary-button') {
      detailZone = 'summary';
      updateDetailFocus();
    } else if (button.id === 'detail-media-info-button') {
      detailZone = 'media-info';
      updateDetailFocus();
    } else if (button.hasAttribute('data-setting-index')) {
      settingsView.focusList(Number(button.getAttribute('data-setting-index')), settingsRows().length);
      renderAppSettings();
    } else if (button.hasAttribute('data-language-index')) {
      settingsView.focusLanguage(Number(button.getAttribute('data-language-index')), orderedEditorLanguages().length);
      renderLanguageEditor();
    } else if (button.hasAttribute('data-server-index')) {
      serverEditorView.focus(Number(button.getAttribute('data-server-index')), serverState.servers.length + 2);
      renderServerEditor();
    } else if (button.hasAttribute('data-search-key')) {
      searchView.pointerFocus(button);
    } else if (button.hasAttribute('data-search-index')) {
      searchView.pointerFocus(button);
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      libraryZone = 'tabs';
      clearLogicalFocus();
      button.className += ' is-focused';
    } else if (button.id === 'library-refresh' || button.id === 'library-refresh-metadata') {
      libraryZone = 'actions'; libraryActionIndex = button.id === 'library-refresh' ? 0 : 1; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-sort')) {
      libraryZone = 'sort'; libraryControlIndex = ['titleSort', 'audienceRating', 'year'].indexOf(button.getAttribute('data-library-sort')); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-filter')) {
      libraryZone = 'filter'; libraryControlIndex = ['all','unwatched','watched'].indexOf(button.getAttribute('data-library-filter')); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-filter-open')) {
      libraryZone = 'filter'; libraryControlIndex = 3; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-advanced-filter') || button.hasAttribute('data-library-filter-option') || button.hasAttribute('data-library-filter-action')) {
      libraryFilterView.pointerFocus(button);
    } else if (button.hasAttribute('data-library-index')) {
      libraryZone = 'grid'; libraryGridView.pointerFocus(button); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-recommendation-row')) {
      libraryZone = 'grid'; libraryGridView.pointerFocus(button); updateLibraryFocus();
    } else if (button.hasAttribute('data-watchlist-index')) {
      watchlistView.pointerFocus(button);
    } else if (button.id === 'player-timeline-button') {
      playerZone = 'timeline'; updatePlayerButtonFocus();
    } else if (button.id === 'player-skip-marker') {
      playerZone = 'skip'; updatePlayerButtonFocus();
    } else if (button.id === 'player-chapters-hint') {
      playerZone = 'chapter-hint'; updatePlayerButtonFocus();
    } else if (button.hasAttribute('data-chapter-index')) {
      chapterState.index = Number(button.getAttribute('data-chapter-index'));
      playerZone = 'chapters'; updatePlayerButtonFocus();
    } else if (button.className.indexOf('player-button') !== -1) {
      var buttons = document.querySelectorAll('.player-button');
      for (index = 0; index < buttons.length; index += 1) {
        if (buttons[index] === button) { playerButtonIndex = index; break; }
      }
      playerZone = 'buttons'; updatePlayerButtonFocus();
    } else if (button.hasAttribute('data-choice-index') && choiceDialogView.snapshot().open) {
      choiceDialogView.focus(Number(button.getAttribute('data-choice-index')));
    } else if (button.className.indexOf('setting-row') !== -1) {
      var settingRows = document.querySelectorAll('.setting-row');
      for (index = 0; index < settingRows.length; index += 1) {
        if (settingRows[index] === button) { settingIndex = index; break; }
      }
      updateSettingsDisplay();
    }
    pointerSelectionActive = false;
  }

  function notePlayerPointerActivity(button) {
    var controls;
    var settings;
    if (appView !== 'player' || playerControlsMode !== 'full' || !button) { return; }
    controls = document.getElementById('player-controls');
    settings = document.getElementById('player-settings');
    if ((controls && controls.contains(button)) ||
        (settings && settings.contains(button)) ||
        button.id === 'player-skip-marker' ||
        button.id === 'player-chapters-hint' ||
        button.hasAttribute('data-chapter-index')) {
      schedulePlayerControlsTimeout();
    }
  }

  function onPointerOver(event) {
    var button = closestButton(event.target);
    if (wheelPointerLocked || new Date().getTime() < pointerSuppressedUntil) {
      return;
    }
    if (!pointerPrimed) {
      if (!pointerOriginTarget) { pointerOriginTarget = button; }
      return;
    }
    if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) { return; }
    if (button !== pointerCurrentButton) {
      pointerCurrentButton = button;
      syncPointerFocus(button);
      notePlayerPointerActivity(button);
    }
  }

  function onPointerMove(event) {
    var x = Number(event.clientX);
    var y = Number(event.clientY);
    var button = closestButton(event.target);
    var distance;
    if (!isFinite(x) || !isFinite(y)) { return; }
    pointerLastX = x;
    pointerLastY = y;
    if (wheelPointerLocked) {
      if (wheelPointerLockX === null || wheelPointerLockY === null) {
        wheelPointerLockX = x;
        wheelPointerLockY = y;
        return;
      }
      distance = Math.sqrt(Math.pow(x - wheelPointerLockX, 2) + Math.pow(y - wheelPointerLockY, 2));
      if (distance < wheelPointerUnlockDistance) { return; }
      wheelPointerLocked = false;
      wheelPointerLockX = null;
      wheelPointerLockY = null;
      pointerCurrentButton = null;
    }
    if (new Date().getTime() < pointerSuppressedUntil) { return; }
    if (pointerOriginX === null || pointerOriginY === null) {
      pointerOriginX = x;
      pointerOriginY = y;
      pointerOriginTarget = button;
      return;
    }
    if (!pointerPrimed) {
      distance = Math.sqrt(Math.pow(x - pointerOriginX, 2) + Math.pow(y - pointerOriginY, 2));
      if (distance < 20 || button === pointerOriginTarget) { return; }
      pointerPrimed = true;
    }
    if (appView === 'player' && playerControlsMode === 'timeline' && !settingsOpen) {
      playerControlsMode = PlayerControlsState.next(playerControlsMode, 'pointer');
      playerZone = 'buttons';
      playerButtonIndex = 1;
      showPlayerControls();
      updatePlayerButtonFocus();
    }
    if (button && button !== pointerCurrentButton) {
      pointerCurrentButton = button;
      syncPointerFocus(button);
      notePlayerPointerActivity(button);
    }
  }

  function wheelKeyEvent(direction) {
    return { keyCode: direction < 0 ? 38 : 40, preventDefault: function () {} };
  }

  function pageScrollContainer() {
    if (appView === 'home' && state.area === 'media') { return document.getElementById('content'); }
    if (appView === 'library' && libraryZone === 'grid') { return document.getElementById(libraryViewKey() === 'recommended' ? 'library-recommended' : 'library-grid'); }
    if (appView === 'watchlist' && watchlistSnapshot().zone === 'grid') { return document.getElementById('watchlist-grid'); }
    if (appView === 'search' && searchSnapshot().focus.zone === 'results') { return document.getElementById('search-results'); }
    if (appView === 'settings' && serverEditorView.snapshot().open) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && !settingsView.snapshot().languageKind) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && settingsView.snapshot().languageKind) { return document.getElementById('language-editor-list'); }
    return null;
  }

  function firstVisibleButton(container, selector) {
    var buttons = container ? container.querySelectorAll(selector) : [];
    var containerRect = container ? container.getBoundingClientRect() : null;
    var best = null;
    var bestScore = Infinity;
    var index;
    var rect;
    var score;
    for (index = 0; index < buttons.length; index += 1) {
      rect = buttons[index].getBoundingClientRect();
      if (!containerRect || rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) { continue; }
      score = Math.abs(rect.top - containerRect.top) + Math.abs(rect.left - containerRect.left) / 100;
      if (score < bestScore) { best = buttons[index]; bestScore = score; }
    }
    return best;
  }

  function syncFocusAfterPageScroll() {
    var container = pageScrollContainer();
    var button;
    if (!container) { return; }
    if (appView === 'home') {
      button = firstVisibleButton(container, '[data-row-index][data-column]');
      if (button) {
        state.area = 'media';
        state.rowIndex = Number(button.getAttribute('data-row-index'));
        state.column = Number(button.getAttribute('data-column'));
      }
    } else if (appView === 'library') {
      button = firstVisibleButton(container, libraryViewKey() === 'recommended' ? '[data-library-recommendation-row]' : '[data-library-index]');
      if (button) {
        libraryZone = 'grid';
        libraryGridView.restoreFocus(button);
      }
    } else if (appView === 'watchlist') {
      button = firstVisibleButton(container, '[data-watchlist-index]');
      if (button) { watchlistView.restoreFocus(button); }
    } else if (appView === 'search') {
      button = firstVisibleButton(container, '[data-search-index]');
      if (button) {
        searchView.focusResult(Number(button.getAttribute('data-search-index')));
      }
    } else if (appView === 'settings' && serverEditorView.snapshot().open) {
      button = firstVisibleButton(container, '[data-server-index]');
      if (button) { serverEditorView.focus(Number(button.getAttribute('data-server-index')), serverState.servers.length + 2); }
    } else if (appView === 'settings' && settingsView.snapshot().languageKind) {
      button = firstVisibleButton(container, '[data-language-index]');
      if (button) { settingsView.focusLanguage(Number(button.getAttribute('data-language-index')), orderedEditorLanguages().length); }
    } else if (appView === 'settings') {
      button = firstVisibleButton(container, '[data-setting-index]');
      if (button) { settingsView.focusList(Number(button.getAttribute('data-setting-index')), settingsRows().length); }
    }
  }

  function scrollCurrentPage(direction) {
    var container = pageScrollContainer();
    var amount;
    if (!container) { return false; }
    pageScrollPendingFocus = true;
    amount = Math.max(180, Math.round(container.clientHeight * 0.55));
    wheelNavigationActive = true;
    root.clearTimeout(libraryWheelScrollTimer);
    if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
    libraryWheelScrollTimer = root.setTimeout(function () {
      libraryWheelScrollTimer = null;
      wheelNavigationActive = false;
    }, 350);
    if (container.scrollBy) { container.scrollBy({ top: direction * amount, left: 0, behavior: 'smooth' }); }
    else { container.scrollTop += direction * amount; }
    return true;
  }

  function onWheel(event) {
    var delta = Number(event.deltaY);
    var direction;
    if (!isFinite(delta) || delta === 0) { delta = -Number(event.wheelDelta || 0); }
    if (!isFinite(delta) || delta === 0) { return; }
    event.preventDefault();
    if (wheelDebounceTimer) { return; }
    direction = delta < 0 ? -1 : 1;
    wheelPointerLocked = true;
    wheelPointerLockX = pointerLastX;
    wheelPointerLockY = pointerLastY;
    pointerSuppressedUntil = new Date().getTime() + 500;
    wheelDebounceTimer = root.setTimeout(function () { wheelDebounceTimer = null; }, 70);
    if (detailPresentationSnapshot().mediaInfoDialogOpen) {
      scrollDetailMediaInfo(direction);
      return;
    }
    if (detailPresentationSnapshot().summaryDialogOpen) {
      scrollDetailSummary(direction);
      return;
    }
    if (appSettings.wheelBehavior === 'items') {
      onKeyDown(wheelKeyEvent(direction));
    } else if (appSettings.wheelBehavior === 'page' && scrollCurrentPage(direction)) {
      return;
    } else {
      onKeyDown(wheelKeyEvent(direction));
    }
  }

  function onPointerDown(event) {
    var button = closestButton(event.target);
    if (!button || !button.hasAttribute('data-nav-index') || !navigationHasFocus() || navReorderMode) { return; }
    syncPointerFocus(button);
    startNavHold(Number(button.getAttribute('data-nav-index')));
  }

  function onPointerUp() {
    if (navHoldTriggered && navReorderMode) {
      navReorderReady = true;
      suppressNextPointerClick = true;
      navHoldTriggered = false;
    }
    cancelNavHold();
  }

  function seekTimelineFromPointer(event, button) {
    var rect = button.getBoundingClientRect();
    var clientX = Number(event.clientX);
    var ratio;
    var total;
    if (!isFinite(clientX) && isFinite(Number(event.pageX))) { clientX = Number(event.pageX) - Number(root.pageXOffset || 0); }
    if (rect.width <= 0 || !isFinite(clientX) || !currentPlayback || playerStreamSwitching) { return; }
    total = Number(currentPlayback.duration || 0) / 1000;
    if (!isFinite(total) || total <= 0) { return; }
    ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (!isFinite(ratio)) { return; }
    event.preventDefault();
    seekPlayerTo(ratio * total);
  }

  function onPointerClick(event) {
    var button = closestButton(event.target);
    var accentColor = event.target && event.target.getAttribute ? event.target.getAttribute('data-accent-color') : '';
    if (!button || button.disabled) { return; }
    if (suppressNextPointerClick) { suppressNextPointerClick = false; return; }
    if (typeof button.onclick === 'function') {
      notePlayerPointerActivity(button);
      return;
    }
    if (navReorderMode && button.hasAttribute('data-nav-index')) {
      if (navReorderReady) { finishNavReorder(true); }
      return;
    }
    syncPointerFocus(button);
    notePlayerPointerActivity(button);
    if (button.hasAttribute('data-choice-index') && choiceDialogView.snapshot().open) {
      choiceDialogView.focus(Number(button.getAttribute('data-choice-index')));
      closeChoiceDialog(true);
    } else if (accentColor && button.hasAttribute('data-setting-index')) {
      selectAccentColor(accentColor);
    } else if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      activateResumeChoice();
    } else if (button.hasAttribute('data-diagnostics-action') && appView === 'diagnostics') {
      diagnosticsView.setFocus(button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1);
      activateDiagnosticsAction();
    } else if (button.hasAttribute('data-profile-shortcut')) {
      openProfileManager();
    } else if (button.hasAttribute('data-setup-language') || button.hasAttribute('data-setup-action') || button.hasAttribute('data-setup-server') || button.hasAttribute('data-setup-profile')) {
      activateSetupButton(button);
    } else if (button.hasAttribute('data-nav-index')) {
      if (appView === 'search') { activateSearchNav(); return; }
      activateNavigationIndex(Number(button.getAttribute('data-nav-index')));
    } else if (button.hasAttribute('data-row-index')) {
      activate();
    } else if (button.hasAttribute('data-setting-index')) {
      openAppSettingChoice();
    } else if (button.hasAttribute('data-language-index')) {
      toggleEditorLanguage();
    } else if (button.hasAttribute('data-server-index')) {
      activateServerEditorRow();
    } else if (button.hasAttribute('data-search-key')) {
      searchView.applyKey(button.getAttribute('data-search-key'));
    } else if (button.hasAttribute('data-search-index')) {
      openDetail(searchSnapshot().results[Number(button.getAttribute('data-search-index'))]);
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      selectLibraryTab(Number(button.getAttribute('data-library-tab')));
    } else if (button.hasAttribute('data-library-sort')) {
      activateLibrarySort(button.getAttribute('data-library-sort'));
    } else if (button.hasAttribute('data-library-filter')) {
      activateLibraryFilter(button.getAttribute('data-library-filter'));
    } else if (button.hasAttribute('data-library-filter-open')) {
      openLibraryFilterDrawer();
    } else if (button.hasAttribute('data-library-advanced-filter') || button.hasAttribute('data-library-filter-option') || button.hasAttribute('data-library-filter-action')) {
      libraryFilterView.activatePointer(button);
    } else if (button.hasAttribute('data-library-index')) {
      libraryGridView.pointerFocus(button);
      var libraryItem = libraryGridView.focusedItem();
      if (libraryItem && libraryItem.containerKey) { openLibraryContainer(libraryItem); }
      else { openDetail(libraryItem); }
    } else if (button.hasAttribute('data-library-recommendation-row')) {
      libraryGridView.pointerFocus(button);
      openDetail(libraryGridView.focusedItem());
    } else if (button.hasAttribute('data-watchlist-index')) {
      button = watchlistView.activatePointer(button);
      if (button) { openDetail(button); }
    } else if (button.id === 'library-refresh') {
      refreshActiveLibrary();
    } else if (button.id === 'library-refresh-metadata') {
      refreshActiveLibraryMetadata();
    } else if (button.id === 'player-timeline-button') {
      seekTimelineFromPointer(event, button);
    } else if (button.id === 'player-skip-marker') {
      activateSkipMarker();
    } else if (button.id === 'player-chapters-hint') {
      openChapterDrawer();
    } else if (button.hasAttribute('data-chapter-index') && chapterState.open) {
      chapterState.index = Number(button.getAttribute('data-chapter-index'));
      activateChapter();
    } else if (button.className.indexOf('setting-row') !== -1 && settingsOpen) {
      openPlayerSettingChoice();
    } else if (button.hasAttribute('data-subtitle-editor') && subtitleEditorOpen) {
      activateSubtitleEditorControl(button.getAttribute('data-subtitle-editor'));
    }
  }

  applyCardScale();
  applyAccentColor();
  translateStaticUi();
  renderNavigation();
  updateClock();
  root.setInterval(updateClock, 30000);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('mouseover', onPointerOver, false);
  document.addEventListener('mousemove', onPointerMove, false);
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('mousewheel', onWheel, { passive: false });
  document.addEventListener('mousedown', onPointerDown, false);
  document.addEventListener('mouseup', onPointerUp, false);
  document.addEventListener('click', onPointerClick, false);
  document.getElementById('library-grid').addEventListener('scroll', onLibraryGridScroll, false);
  document.addEventListener('keyup', function (event) {
    if (event.keyCode === 37 || event.keyCode === 39) { seekRepeatCount = 0; }
    if (event.keyCode === 13 && navigationHasFocus()) {
      if (navHoldTriggered && navReorderMode) {
        navReorderReady = true;
        navHoldTriggered = false;
      } else if (navHoldTimer) {
        cancelNavHold();
        enterActiveNavigationView();
      }
    }
  }, false);
  root.addEventListener('resize', function () {
    root.clearTimeout(navbarResizeTimer);
    navbarResizeTimer = root.setTimeout(function () {
      renderNavigation();
      if (appView === 'detail') { updateDetailSummaryOverflow(); updateDetailMediaInfoOverflow(); }
    }, 100);
  }, false);
  document.getElementById('detail-play').onclick = openPlayer;
  document.getElementById('detail-watched').onclick = toggleCurrentWatched;
  document.getElementById('detail-watchlist').onclick = toggleCurrentWatchlist;
  document.getElementById('detail-refresh-metadata').onclick = refreshCurrentMetadata;
  document.getElementById('detail-audio').onclick = function () { openDetailChoice('audio'); };
  document.getElementById('detail-subtitles').onclick = function () { openDetailChoice('subtitles'); };
  document.getElementById('detail-version').onclick = function () { openDetailChoice('version'); };
  document.getElementById('detail-summary-button').onclick = openDetailSummary;
  document.getElementById('detail-media-info-button').onclick = openDetailMediaInfo;
  document.getElementById('player-previous').onclick = function () { switchPlayerEpisode(-1); };
  document.getElementById('player-toggle').onclick = function () {
    togglePlayback();
  };
  document.getElementById('player-next').onclick = function () { switchPlayerEpisode(1); };
  document.getElementById('player-settings-button').onclick = function () { setSettingsOpen(true); };
  document.getElementById('player-error-retry').onclick = retryPlaybackFromError;
  document.getElementById('player-error-settings').onclick = function () { hidePlayerError(); setSettingsOpen(true); };
  document.getElementById('player-error-back').onclick = function () { hidePlayerError(); closePlayer(); };
  document.getElementById('player-video').addEventListener('click', function () { if (subtitleEditorOpen) { return; } showPlayerControls(); togglePlayback(); }, false);
  document.getElementById('autoplay-play').onclick = confirmAutoplayCountdown;
  document.getElementById('autoplay-cancel').onclick = cancelAutoplayCountdown;
  document.getElementById('player-video').addEventListener('playing', function () {
    playerBufferingIndicator.stop();
    root.clearTimeout(playerResumeTimer);
    playerStreamSwitching = false;
    playerBuffering = false;
    playbackClock = PlaybackClock.freeze(playbackClock, false);
    playerRecoveryState = PlaybackRecovery.playing(playerRecoveryState);
    hidePlayerError();
    startTranscodeKeepalive();
    if (!playerNativeSeekPending) { setPlayerLoading(false); }
    setText('player-status', t('status.playing'));
    if (pendingPlaybackRestore) { restartTimelineAfterSubtitleRestore(); }
    sendPlayerTimeline('playing');
    updatePlayerDisplay();
  }, false);
  document.getElementById('player-video').addEventListener('canplay', function () {
    var video = document.getElementById('player-video');
    var directTarget;
    if (appView !== 'player') { return; }
    playerBufferingIndicator.stop();
    if (playerBuffering) {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
    }
    if (currentPlayback && currentPlayback.directSeekTarget !== null && currentPlayback.directSeekTarget !== undefined) {
      directTarget = Number(currentPlayback.directSeekTarget || 0);
      if (directTarget > 0.25) {
        playerNativeSeekPending = true;
        armNativeSeekVerification(directTarget, directTarget);
        try { video.currentTime = directTarget; } catch (seekError) { playerNativeSeekPending = false; playerNativeSeekTarget = null; root.clearTimeout(playerNativeSeekVerificationTimer); recoverPlaybackError(); return; }
      }
      currentPlayback.directSeekTarget = null;
    }
    if (playerStreamSwitching) { resumeRebuiltStream(); }
    else if (video.paused) { video.play(); }
  }, false);
  document.getElementById('player-video').addEventListener('waiting', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBufferingIndicator.signal();
  }, false);
  document.getElementById('player-video').addEventListener('stalled', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBufferingIndicator.signal();
  }, false);
  document.getElementById('player-video').addEventListener('seeking', function () {
    if (appView !== 'player' || !currentPlayback) { return; }
    playbackClock = PlaybackClock.freeze(playbackClock, true);
  }, false);
  document.getElementById('player-video').addEventListener('seeked', function () {
    var video = document.getElementById('player-video');
    var observation;
    var expectedSeek = playerNativeSeekPending;
    var expectedNativeTime = playerNativeSeekTarget;
    if (appView !== 'player' || !currentPlayback) { return; }
    root.clearTimeout(playerClockRepairFallbackTimer);
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekVerificationTimer = null;
    playerClockRepairFallbackTimer = null;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    if (expectedSeek && expectedNativeTime !== null && !PlayerSeekController.reached(expectedNativeTime, video.currentTime)) {
      rebuildCurrentStream(Number(currentPlayback.offsetBase || 0) + Number(expectedNativeTime || 0), false);
      return;
    }
    if (!playerStreamSwitching && !playerBuffering) {
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), expectedSeek);
      playbackClock = observation.state;
      if (observation.desynced) { schedulePlayerClockRepair(); }
      setPlayerLoading(false);
      updatePlayerDisplay();
    }
  }, false);
  document.getElementById('player-video').addEventListener('pause', function () {
    playerBufferingIndicator.stop();
    if (playerStreamSwitching) { return; }
    if (appView === 'player') {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
      setText('player-status', t('status.paused'));
      sendPlayerTimeline('paused');
      updatePlayerDisplay();
    }
  }, false);
  document.getElementById('player-video').addEventListener('timeupdate', updatePlayerDisplay, false);
  document.getElementById('player-video').addEventListener('timeupdate', updateSubtitleEditorPlayback, false);
  document.getElementById('player-video').addEventListener('ended', function () { if (playerStreamSwitching) { return; } sendPlayerTimeline('stopped'); setText('player-status', t('status.ended')); startAutoplayCountdown(); }, false);
  document.getElementById('player-video').addEventListener('error', function () { if (appView === 'player') { setText('player-status', t('status.playbackError')); recoverPlaybackError(); } }, false);
  root.addEventListener('offline', function () {
    homePoller.stop();
    if (appView === 'player' && currentPlayback) { setText('player-status', t('player.waitingNetwork')); }
  }, false);
  root.addEventListener('online', function () {
    if (appView === 'player' && currentPlayback && playerRecoveryState.status === 'waiting-network') {
      playerRecoveryState = PlaybackRecovery.online(playerRecoveryState);
      hidePlayerError();
      applyCurrentPlaybackAttempt(true);
      return;
    }
    recoverActiveViewAfterNetwork();
    homePoller.schedule();
  }, false);
  document.addEventListener('visibilitychange', function () {
    var video = document.getElementById('player-video');
    if (document.hidden) {
      homePoller.stop();
      root.clearInterval(timelineTimer);
      root.clearInterval(estimatedEndTimer);
    } else {
      homePoller.schedule();
      if (appView === 'player' && currentPlayback) {
        root.clearInterval(timelineTimer);
        timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
        startEstimatedEndTimer();
      }
    }
  }, false);
  DeviceCapabilities.detect(root, function (capabilities) { playbackCapabilities = capabilities; });
  bootstrapPlex();
}(this, /** @type {*} */ (document)));
