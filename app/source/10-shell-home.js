  // Shared shell, navigation, Home, focus, artwork, and backdrop behavior.
  function searchMediaKey(item) {
    return String(item.ratingKey || item.key || item.image || item.title || '');
  }

  function updateNodeText(node, value) {
    node.innerHTML = '';
    node.appendChild(document.createTextNode(value || ''));
  }

  function t(key, parameters) {
    return I18n.t(appSettings.uiLanguage, key, parameters);
  }

  function completeStartup() {
    var splash = document.getElementById('startup-splash');
    var elapsed;
    var delay;
    function finish() {
      document.body.className = document.body.className.replace(/\s*is-booting/g, '');
      if (!splash) { return; }
      splash.className = 'startup-splash is-leaving';
      root.setTimeout(function () { splash.className = 'startup-splash is-hidden'; }, 250);
    }
    if (startupComplete) {
      document.body.className = document.body.className.replace(/\s*is-booting/g, '');
      return;
    }
    startupComplete = true;
    elapsed = new Date().getTime() - startupStartedAt;
    delay = Math.max(0, 1000 - elapsed);
    root.clearTimeout(startupTimer);
    startupTimer = root.setTimeout(finish, delay);
  }

  function setHomeRefreshVisualActive(active) {
    active = !!active;
    if (homeRefreshVisualActive === active) { return; }
    homeRefreshVisualActive = active;
    renderServerActivities();
  }

  function cardMetrics() {
    return CardLayout.metrics(appSettings.cardScale);
  }

  function applyCardScale() {
    var metrics = cardMetrics();
    var wide = CardLayout.wideMetrics(appSettings.cardScale);
    var style = document.documentElement.style;
    style.setProperty('--poster-card-width', metrics.width + 'px');
    style.setProperty('--poster-image-height', metrics.imageHeight + 'px');
    style.setProperty('--poster-caption-height', metrics.captionHeight + 'px');
    style.setProperty('--poster-card-height', metrics.height + 'px');
    style.setProperty('--poster-card-gap', Math.max(7, metrics.columnStep - metrics.width) + 'px');
    style.setProperty('--wide-card-width', wide.width + 'px');
    style.setProperty('--wide-image-height', wide.imageHeight + 'px');
    style.setProperty('--wide-card-height', wide.height + 'px');
    style.setProperty('--poster-title-font', Math.max(16, Math.round(23 * appSettings.cardScale / 100)) + 'px');
    style.setProperty('--poster-meta-font', Math.max(13, Math.round(18 * appSettings.cardScale / 100)) + 'px');
  }

  function navigationTitle(item) {
    return item.labelKey ? t(item.labelKey) : item.title;
  }

  function mediaTitle(item) { return MediaLabels.title(item, t); }
  function mediaMeta(item) { return MediaLabels.meta(item, t); }
  function mediaDetail(item) { return MediaLabels.detail(item, t); }
  function mediaCardMeta(item) { return MediaLabels.cardMeta(item, t); }
  function mediaCardDetail(item) { return MediaLabels.cardDetail(item, t); }
  function mediaDescription(item) { return MediaLabels.description(item, t); }

  function watchlistAccountToken() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return authState.mode === 'plex' ? String(profile && profile.accountToken || authState.ownerToken || '') : '';
  }

  function watchlistAvailable() {
    return !!(WatchlistState && WatchlistClient && WatchlistState.available(authState.mode, watchlistAccountToken()));
  }

  function watchlistIdentity() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return [activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || '', profile && (profile.id || profile.uuid || profile.title) || 'local'].join('|');
  }

  function translateStaticUi() {
    setText('startup-splash-label', t('startup.loading'));
    document.getElementById('navigation').setAttribute('aria-label', t('nav.main'));
    setText('detail-play', t('detail.play'));
    setText('detail-refresh-metadata', t('detail.refreshMetadata'));
    setText('detail-version-label', t('detail.version'));
    setText('detail-media-info-subtitle-languages-label', t('detail.subtitleLanguages'));
    setText('detail-media-info-video-label', t('detail.video'));
    setText('detail-media-info-audio-label', t('detail.audio'));
    setText('detail-media-info-bitrate-label', t('detail.bitrate'));
    setText('library-refresh-metadata', t('library.refreshMetadata'));
    document.getElementById('library-refresh').title = t('library.refresh');
    document.getElementById('library-refresh').setAttribute('aria-label', t('library.refresh'));
    setText('player-settings-title', t('player.settings'));
    setText('setting-audio-label', t('player.audio'));
    setText('setting-subtitles-label', t('player.subtitles'));
    setText('setting-size-label', t('player.subtitleSize'));
    setText('setting-subtitle-advanced-label', t('player.advancedSubtitles'));
    setText('setting-version-label', t('detail.version'));
    setText('setting-quality-label', t('settings.videoQuality'));
    setText('setting-playback-mode-label', t('settings.playbackMode'));
    setText('player-track-audio-label', t('player.audio') + ': ');
    setText('player-track-subtitles-label', t('player.subtitles') + ': ');
    setText('playback-info-file-label', t('player.infoFile'));
    setText('playback-info-size-label', t('player.infoSize'));
    setText('playback-info-source-label', t('player.infoSource'));
    setText('playback-info-hdr-label', t('player.infoHdr'));
    setText('playback-info-mode-label', t('player.infoMode'));
    setText('autoplay-play', t('detail.play'));
    setText('autoplay-cancel', t('player.cancel'));
    setText('player-error-title', t('player.errorTitle'));
    setText('player-error-retry', t('player.retry'));
    setText('player-error-settings', t('player.settings'));
    setText('player-error-back', t('player.back'));
    setText('player-chapters-hint-label', t('player.chapters'));
    setText('player-chapters-title', t('player.chapters'));
    document.getElementById('player-previous').setAttribute('aria-label', t('player.previous'));
    document.getElementById('player-next').setAttribute('aria-label', t('player.next'));
    document.getElementById('player-timeline-button').setAttribute('aria-label', t('player.timeline'));
    document.getElementById('player-settings-button').setAttribute('aria-label', t('player.settings'));
    setText('subtitle-editor-title', t('player.advancedSubtitles'));
    setText('subtitle-editor-track-label', t('player.subtitles'));
    setText('subtitle-editor-size-label', t('player.subtitleSize'));
    setText('subtitle-editor-loop-label', t('player.subtitleLoop'));
    setText('subtitle-editor-apply-label', t('player.subtitleApply'));
    setText('subtitle-editor-cancel-label', t('player.cancel'));
  }

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    node.className = className || '';
    if (typeof text === 'string') {
      node.appendChild(document.createTextNode(text));
    }
    return node;
  }

  function updateViewStateFocus() {
    var buttons = document.querySelectorAll('#view-state-actions button');
    var index;
    if (!activeViewState || !buttons.length) { return; }
    for (index = 0; index < buttons.length; index += 1) { buttons[index].className = index === activeViewState.index ? 'is-focused' : ''; }
    buttons[activeViewState.index].focus();
  }

  function showViewState(kind, scope, retryAction, backAction) {
    var model = ViewState.model(kind, scope);
    var actions = document.getElementById('view-state-actions');
    var section = document.getElementById('view-state');
    activeViewState = { model: model, index: 0, retry: retryAction || null, back: backAction || null };
    setText('view-state-title', t(model.titleKey));
    setText('view-state-message', t(model.messageKey));
    actions.innerHTML = '';
    model.actions.forEach(function (action) {
      var button = element('button', '', t('state.' + action));
      button.type = 'button';
      button.setAttribute('data-view-state-action', action);
      button.onclick = function () {
        if (action === 'retry' && activeViewState && activeViewState.retry) { hideViewState(); activeViewState = null; retryAction(); }
        else if (action === 'back') { hideViewState(); if (backAction) { backAction(); } }
      };
      actions.appendChild(button);
    });
    section.className = 'view-state' + (kind === 'loading' ? ' is-loading' : '');
    updateViewStateFocus();
  }

  function hideViewState() {
    document.getElementById('view-state').className = 'view-state is-hidden';
    activeViewState = null;
  }

  function handleViewStateKey(event, direction) {
    var actions;
    var action;
    if (!activeViewState) { return false; }
    actions = activeViewState.model.actions;
    if ((event.keyCode === 27 || event.keyCode === 461) && activeViewState.back) {
      var loadingBack = activeViewState.back; hideViewState(); loadingBack(); return true;
    }
    if (!actions.length) { return true; }
    if (direction === 'left' || direction === 'right') {
      activeViewState.index = ViewState.focusIndex(activeViewState.index, actions.length, direction === 'left' ? -1 : 1);
      updateViewStateFocus();
    } else if (event.keyCode === 13) {
      action = actions[activeViewState.index];
      if (action === 'retry' && activeViewState.retry) { var retry = activeViewState.retry; hideViewState(); retry(); }
      else if (action === 'back') { var back = activeViewState.back; hideViewState(); if (back) { back(); } }
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      var backAction = activeViewState.back; hideViewState(); if (backAction) { backAction(); }
    }
    return true;
  }

  function progressivePosterSpecification(source, width, height, priority, scope) {
    var preview = ProgressiveImages.previewSize(width, height, 96);
    return {
      source: source,
      previewWidth: preview.width,
      previewHeight: preview.height,
      width: width,
      height: height,
      priority: priority,
      scope: scope
    };
  }

  function renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight) {
    var rect = image && image.getBoundingClientRect ? image.getBoundingClientRect() : null;
    var width;
    var height;
    if (rect && rect.width && rect.height) {
      width = Math.ceil(rect.width);
      height = Math.ceil(rect.height);
    } else {
      width = Math.ceil(image.clientWidth || fallbackWidth || 154);
      height = Math.ceil(image.clientHeight || fallbackHeight || 224);
    }
    return progressivePosterSpecification(source, width, height, priority, scope);
  }

  function loadRenderedPoster(image, source, priority, scope, fallbackWidth, fallbackHeight) {
    posterLoader.load(image, renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight));
  }

  function prioritizePoster(card) {
    var images = card ? card.getElementsByTagName('img') : [];
    if (images.length) { posterLoader.prioritize(images[0]); }
  }

  function navigationButton(entry) {
    var item = element('button', 'nav-item', navigationTitle(entry.item));
    item.type = 'button';
    item.setAttribute('data-nav-index', entry.index);
    if (entry.item.kind === 'watchlist' && !watchlistAvailable()) {
      item.className += ' is-disabled';
      item.setAttribute('aria-disabled', 'true');
    }
    if (entry.index === state.navIndex) {
      item.className += ' is-selected';
      if (navReorderMode) { item.className += ' is-reordering'; }
    }
    return item;
  }

  function visibleNavigationItems(items) {
    return (items || []).filter(function (item) {
      if (item.kind === 'watchlist') { return appSettings.showWatchlist; }
      if (item.kind === 'playlists') { return appSettings.showPlaylists; }
      return true;
    });
  }

  function applyNavigationVisibility(items) {
    var activeItem = navigationItems[state.navIndex];
    var activeIndex;
    availableNavigationItems = (items || availableNavigationItems).slice();
    navigationItems = visibleNavigationItems(availableNavigationItems);
    activeIndex = navigationItems.indexOf(activeItem);
    state.navIndex = activeIndex >= 0 ? activeIndex : Math.max(0, Math.min(state.navIndex, navigationItems.length - 1));
  }

  applyNavigationVisibility();

  function renderNavigation() {
    var navigation = document.getElementById('navigation');
    var home = element('div', 'navigation-home');
    var libraries = element('div', 'navigation-libraries');
    var fixed = element('div', 'navigation-fixed');
    var libraryEntries = [];
    var libraryButtons = [];
    var widths = [];
    var focusedLibraryIndex = navbarLibraryWindowStart;
    var windowState;
    var index;
    var entry;
    var button;

    navigation.innerHTML = '';
    for (index = 0; index < navigationItems.length; index += 1) {
      entry = { item: navigationItems[index], index: index };
      if (entry.item.kind === 'home') {
        home.appendChild(navigationButton(entry));
      } else if (entry.item.kind === 'library') {
        if (index === state.navIndex) { focusedLibraryIndex = libraryEntries.length; }
        libraryEntries.push(entry);
      } else {
        fixed.appendChild(navigationButton(entry));
      }
    }
    navigation.appendChild(home);
    navigation.appendChild(libraries);
    navigation.appendChild(fixed);
    for (index = 0; index < libraryEntries.length; index += 1) {
      button = navigationButton(libraryEntries[index]);
      libraries.appendChild(button);
      libraryButtons.push(button);
      widths.push(button.offsetWidth + 12);
    }
    if (NavbarWindow && libraryEntries.length) {
      windowState = NavbarWindow.calculate(widths, libraries.clientWidth, focusedLibraryIndex, navbarLibraryWindowStart);
      navbarLibraryWindowStart = windowState.start;
      libraries.className += windowState.canScrollLeft ? ' is-clipped-left' : '';
      libraries.className += windowState.canScrollRight ? ' is-clipped-right' : '';
      for (index = libraryButtons.length - 1; index >= 0; index -= 1) {
        if (index < windowState.start || index >= windowState.end) { libraries.removeChild(libraryButtons[index]); }
      }
    }
    renderActiveProfile();
    renderServerActivities();
  }

  function activeProfileShortcutVisible() {
    if (authState.mode !== 'plex') { return !!authState.setupComplete; }
    return !!(AuthStore && AuthStore.activeProfile(authState));
  }

  function navigationFocusCount() {
    return navigationItems.length + 1 + (activeProfileShortcutVisible() ? 1 : 0);
  }

  function isActivityNavIndex(index) {
    return Number(index) === navigationItems.length;
  }

  function isProfileNavIndex(index) {
    return activeProfileShortcutVisible() && Number(index) === navigationItems.length + 1;
  }

  function selectorForNavIndex(index) {
    var selector;
    if (isProfileNavIndex(index)) { return '[data-profile-shortcut]'; }
    if (isActivityNavIndex(index)) { return '[data-activity-shortcut]'; }
    selector = '[data-nav-index="' + index + '"]';
    if (!document.querySelector(selector) && navigationItems[index] && navigationItems[index].kind === 'library') {
      renderNavigation();
    }
    return selector;
  }

  function createCard(item, rowIndex, column, shape) {
    var card = element('button', 'media-card ' + shape + (item.viewed ? ' is-viewed' : ''));
    var image = element('img', 'card-image');
    var caption = element('span', 'card-caption');

    card.type = 'button';
    image.alt = '';
    caption.appendChild(element('span', 'card-title'));
    caption.appendChild(element('span', 'card-meta'));
    card.appendChild(image);
    card.appendChild(caption);
    updateHomeCard(card, item, rowIndex, column, shape);
    return card;
  }

  function updateHomeCard(card, item, rowIndex, column, shape) {
    var caption = card.querySelector('.card-caption');
    var detail = card.querySelector('.card-detail');
    var progress = card.querySelector('.progress-track');
    var progressValue;
    card.className = 'media-card ' + shape + (item.viewed ? ' is-viewed' : '');
    card.setAttribute('data-row-index', rowIndex);
    card.setAttribute('data-column', column);
    card.setAttribute('data-media-key', HomeState.mediaKey(item));
    card.setAttribute('aria-label', mediaDescription(item));
    updateNodeText(card.querySelector('.card-title'), mediaTitle(item));
    updateNodeText(card.querySelector('.card-meta'), mediaCardMeta(item));
    if (mediaCardDetail(item)) {
      if (!detail) { detail = element('span', 'card-detail'); caption.appendChild(detail); }
      updateNodeText(detail, mediaCardDetail(item));
    } else if (detail) {
      caption.removeChild(detail);
    }

    if (typeof item.progress === 'number') {
      if (!progress) {
        progress = element('span', 'progress-track');
        progress.appendChild(element('span', 'progress-value'));
        card.appendChild(progress);
      }
      progressValue = progress.querySelector('.progress-value');
      progressValue.style.width = item.progress + '%';
    } else if (progress) {
      card.removeChild(progress);
    }
  }

  function startNavHold(index) {
    var item = navigationItems[index];
    if (navHoldTimer || navReorderMode) { return; }
    navHoldTriggered = false;
    if (!navigationHasFocus() || !item || item.kind !== 'library') { return; }
    navHoldTimer = root.setTimeout(function () {
      navHoldTimer = null;
      navHoldTriggered = true;
      navReorderMode = true;
      navReorderReady = false;
      navReorderOriginalItems = navigationItems.slice();
      navigationPreviewScheduler.cancel();
      renderNavigation();
      focusCurrentNavigation();
    }, 800);
  }

  function cancelNavHold() {
    root.clearTimeout(navHoldTimer);
    navHoldTimer = null;
  }

  function moveNavLibrary(direction) {
    var moved = NavigationModel.moveLibrary(navigationItems, state.navIndex, direction);
    navigationItems = moved.items;
    state.navIndex = moved.index;
    renderNavigation();
    focusCurrentNavigation();
  }

  function finishNavReorder(save) {
    if (!navReorderMode) { return; }
    if (save) {
      NavigationModel.save(root.localStorage, NavigationModel.libraryKeys(navigationItems));
    } else if (navReorderOriginalItems) {
      navigationItems = navReorderOriginalItems;
    }
    navReorderMode = false;
    navReorderReady = false;
    navReorderOriginalItems = null;
    renderNavigation();
    focusCurrentNavigation();
  }

  function focusHomeStart() {
    var rowIndex;
    for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      if (data.rows[rowIndex].items && data.rows[rowIndex].items.length) {
        state = { area: 'media', navIndex: 0, rowIndex: rowIndex, column: 0 };
        document.getElementById('content').scrollTop = 0;
        updateFocus();
        return;
      }
    }
  }

  function renderRows() {
    var content = document.getElementById('content');
    var existingSections = [];
    var sectionsByKey = {};
    var renderToken = String(new Date().getTime()) + ':' + String(Math.random());
    var rowIndex;
    var column;
    var rowData;
    var rowKey;
    var section;
    var row;
    var image;
    var posterJobs = [];

    function reconcileCards() {
      var existingCards = [];
      var cardsByKey = {};
      var assignments = [];
      var used = [];
      var recyclable = [];
      var children = row.children;
      var card;
      var key;
      var index;
      for (index = 0; index < children.length; index += 1) {
        card = children[index];
        if (!card.hasAttribute('data-media-key')) { continue; }
        existingCards.push(card);
        key = card.getAttribute('data-media-key') || '';
        cardsByKey[key] = cardsByKey[key] || [];
        cardsByKey[key].push(card);
      }
      for (index = 0; index < rowData.items.length; index += 1) {
        key = HomeState.mediaKey(rowData.items[index]);
        card = cardsByKey[key] && cardsByKey[key].length ? cardsByKey[key].shift() : null;
        assignments[index] = card;
        if (card) { used.push(card); }
      }
      for (index = 0; index < existingCards.length; index += 1) {
        if (used.indexOf(existingCards[index]) === -1) { recyclable.push(existingCards[index]); }
      }
      for (index = 0; index < rowData.items.length; index += 1) {
        card = assignments[index] || recyclable.shift() || createCard(rowData.items[index], rowIndex, index, rowData.shape);
        updateHomeCard(card, rowData.items[index], rowIndex, index, rowData.shape);
        row.appendChild(card);
        image = card.getElementsByTagName('img')[0];
        posterJobs.push({
          target: image,
          specification: renderedPosterSpecification(
            image,
            rowData.items[index].image,
            rowIndex < 2 ? 1 : 2,
            'home',
            rowData.shape === 'wide' ? CardLayout.wideMetrics(appSettings.cardScale).width : cardMetrics().width,
            rowData.shape === 'wide' ? CardLayout.wideMetrics(appSettings.cardScale).imageHeight : cardMetrics().imageHeight
          )
        });
      }
      recyclable.forEach(function (cardToRemove) {
        if (cardToRemove.parentNode === row) { row.removeChild(cardToRemove); }
      });
    }

    for (rowIndex = 0; rowIndex < content.children.length; rowIndex += 1) {
      section = content.children[rowIndex];
      if (!section.hasAttribute('data-home-row-key')) { continue; }
      existingSections.push(section);
      rowKey = section.getAttribute('data-home-row-key') || '';
      sectionsByKey[rowKey] = sectionsByKey[rowKey] || [];
      sectionsByKey[rowKey].push(section);
    }

    for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      rowData = data.rows[rowIndex];
      rowKey = HomeState.rowKey(rowData);
      section = sectionsByKey[rowKey] && sectionsByKey[rowKey].length ? sectionsByKey[rowKey].shift() : null;
      if (!section) {
        section = element('section', 'media-section');
        section.appendChild(element('h2', 'section-title'));
        section.appendChild(element('div', 'media-row'));
      }
      section.setAttribute('data-home-row-key', rowKey);
      section.setAttribute('data-home-render-token', renderToken);
      updateNodeText(section.querySelector('.section-title'), rowData.title);
      row = section.querySelector('.media-row');
      reconcileCards();
      content.appendChild(section);
    }
    for (column = 0; column < existingSections.length; column += 1) {
      section = existingSections[column];
      if (section.getAttribute('data-home-render-token') !== renderToken && section.parentNode === content) {
        content.removeChild(section);
      }
    }
    posterLoader.loadBatch(posterJobs);
  }

  function selectorForState() {
    if (state.area === 'nav') {
      return selectorForNavIndex(state.navIndex);
    }
    return '[data-row-index="' + state.rowIndex + '"][data-column="' + state.column + '"]';
  }

  function artworkUrl(item) {
    var source = item.art || item.image || '';
    return source
      .replace('/400/600', '/1280/720')
      .replace('/640/360', '/1280/720');
  }

  function clearBackdropPresentation() {
    var first = document.getElementById('backdrop-a');
    var second = document.getElementById('backdrop-b');
    backdropRequest += 1;
    root.clearTimeout(backdropTimer);
    backdropTimer = null;
    posterLoader.cancelScope('backdrop');
    posterLoader.load(first, { source: '', scope: 'backdrop' });
    posterLoader.load(second, { source: '', scope: 'backdrop' });
    first.className = 'backdrop-image';
    second.className = 'backdrop-image';
    activeBackdrop = 0;
    activeBackdropSource = '';
  }

  function activateBackdrop(nextIndex, source, request) {
    var current;
    var next;
    if (request !== backdropRequest) { return; }
    current = document.getElementById(activeBackdrop === 0 ? 'backdrop-a' : 'backdrop-b');
    next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
    current.className = current.className.replace(/\s*is-active/g, '');
    if (next.className.indexOf('is-active') === -1) { next.className += ' is-active'; }
    activeBackdrop = nextIndex;
    activeBackdropSource = source;
  }

  function loadBackdropItem(item, request) {
    var nextIndex;
    var next;
    var source = artworkUrl(item);
    if (!source) { if (request === backdropRequest) { clearBackdropPresentation(); } return; }
    if (source === activeBackdropSource) { return; }
    nextIndex = activeBackdrop === 0 ? 1 : 0;
    next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
    if (next.__plexProgressiveSource === source && (next.__plexProgressiveState === 'preview' || next.__plexProgressiveState === 'full')) {
      activateBackdrop(nextIndex, source, request);
      return;
    }
    posterLoader.cancelScope('backdrop');
    next.className = next.className.replace(/\s*is-active/g, '');
    posterLoader.load(next, {
      source: source,
      previewWidth: 320,
      previewHeight: 180,
      width: 1920,
      height: 1080,
      priority: 0,
      scope: 'backdrop',
      onPreview: function () { activateBackdrop(nextIndex, source, request); }
    });
  }

  function loadBackdrop(request) {
    if (state.area !== 'media') { return; }
    loadBackdropItem(data.rows[state.rowIndex].items[state.column], request);
  }

  function scheduleBackdrop() {
    backdropRequest += 1;
    root.clearTimeout(backdropTimer);
    backdropTimer = root.setTimeout(function () {
      loadBackdrop(backdropRequest);
    }, 250);
  }

  function scheduleViewBackdrop(item, expectedView, delay) {
    var request;
    backdropRequest += 1;
    request = backdropRequest;
    root.clearTimeout(backdropTimer);
    backdropTimer = root.setTimeout(function () {
      if (appView === expectedView && request === backdropRequest) {
        loadBackdropItem(item, request);
      }
    }, delay);
  }

  function scheduleDetailBackdrop(detail) {
    scheduleViewBackdrop(detail, 'detail', 0);
  }

  function scheduleSearchBackdrop(item) {
    scheduleViewBackdrop(item, 'search', 250);
  }

  function scheduleTheme(item) {
    var cached;
    var cacheKey;
    var token;
    themeLookupToken += 1;
    token = themeLookupToken;
    root.clearTimeout(themeLookupTimer);
    if (!appSettings.backgroundMusic || !item) {
      backgroundAudio.stop();
      return;
    }
    cacheKey = item.themeLookupKey || item.ratingKey;
    cached = cacheKey ? themeLookupCache[cacheKey] : null;
    if (item.themeUrl || cached) {
      backgroundAudio.schedule(item.themeUrl ? item : cached, { delay: appSettings.backgroundDelay, volume: appSettings.backgroundVolume });
      return;
    }
    backgroundAudio.stop();
    if (!item.ratingKey) { return; }
    themeLookupTimer = root.setTimeout(function () {
      PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
        var oldKey;
        if (error || token !== themeLookupToken || !detail || !detail.themeUrl) { return; }
        themeLookupCache[cacheKey] = detail;
        themeLookupKeys.push(cacheKey);
        while (themeLookupKeys.length > 20) {
          oldKey = themeLookupKeys.shift();
          delete themeLookupCache[oldKey];
        }
        backgroundAudio.schedule(detail, { delay: 1, volume: appSettings.backgroundVolume });
      });
    }, appSettings.backgroundDelay);
  }

  function clearLogicalFocus() {
    var focused = document.querySelectorAll('.is-focused');
    var index;
    for (index = 0; index < focused.length; index += 1) {
      focused[index].className = focused[index].className.replace(/\s*is-focused/g, '');
    }
  }

  function updateFocus() {
    var next;

    clearLogicalFocus();
    next = document.querySelector(selectorForState());
    if (next) {
      next.className += ' is-focused';
      if (state.area === 'media') { prioritizePoster(next); }
      if (!pointerSelectionActive) {
        next.focus();
        keepFocusVisible(next);
      }
    }
    if (appView === 'home' && state.area === 'media' && data.rows[state.rowIndex] && data.rows[state.rowIndex].items[state.column]) {
      lastHomeSelectionKey = HomeState.mediaKey(data.rows[state.rowIndex].items[state.column]);
    }
    scheduleBackdrop();
    if (state.area === 'media') { scheduleTheme(data.rows[state.rowIndex].items[state.column]); }
    else { backgroundAudio.stop(); }
  }

  function keepFocusVisible(focused) {
    var content;
    var section;
    var contentRect;
    var sectionRect;
    var margin = 18;
    var lowerComfortLine;

    if (state.area !== 'media') {
      return;
    }
    content = document.getElementById('content');
    section = focused.parentNode.parentNode;
    contentRect = content.getBoundingClientRect();
    sectionRect = section.getBoundingClientRect();
    lowerComfortLine = contentRect.top + contentRect.height * 0.75;

    if (sectionRect.bottom > lowerComfortLine) {
      content.scrollTop += sectionRect.bottom - lowerComfortLine + margin;
    } else if (sectionRect.top < contentRect.top + margin) {
      content.scrollTop -= contentRect.top - sectionRect.top + margin;
    }
  }

  function showMessage(text) {
    var message = document.getElementById('message');
    root.clearTimeout(messageTimer);
    message.innerHTML = '';
    message.appendChild(document.createTextNode(text));
    message.className = 'message is-visible';
    messageTimer = root.setTimeout(function () {
      message.className = 'message';
    }, 1600);
  }

  function hideDetailMetadataStatus() {
    root.clearTimeout(detailMetadataStatusTimer);
    detailMetadataStatusTimer = null;
    detailMetadataStatusTemporary = false;
    document.getElementById('detail-metadata-status').className = 'detail-metadata-status is-hidden';
  }

  function showDetailMetadataStatus(text, temporary) {
    root.clearTimeout(detailMetadataStatusTimer);
    detailMetadataStatusTemporary = !!temporary;
    setText('detail-metadata-status', text);
    document.getElementById('detail-metadata-status').className = 'detail-metadata-status';
    if (temporary) {
      detailMetadataStatusTimer = root.setTimeout(hideDetailMetadataStatus, 2200);
    }
  }
