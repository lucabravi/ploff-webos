(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffShellController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var services = values.services || {};
    var presentation = values.presentation || {};
    var modules = values.modules || {};
    var actions = values.actions || {};
    var access = values.access || {};
    var timerRoot = values.clock || values.root || {};
    var document = values.document;
    var now = values.now || function () { return new Date().getTime(); };
    var nowDate = values.nowDate || function () { return new Date(); };
    var HomeState = modules.HomeState;
    var FocusModel = modules.FocusModel;
    var NavigationModel = modules.NavigationModel;
    var NavbarWindow = modules.NavbarWindow;
    var CardLayout = modules.CardLayout;
    var MediaLabels = modules.MediaLabels;
    var homeOptions = values.home || null;
    var destroyed = false;
    var homeGeneration = 0;
    var backdropGeneration = 0;
    var themeGeneration = 0;
    var homeLoading = false;
    var startupStartedAt = now();
    var startupComplete = false;
    var homeReadyNotified = false;
    var startupTimer = null;
    var homeRefreshCoordinator = null;
    var homePoller = null;
    var focus = copyFocus(values.initialFocus || { area: 'media', navIndex: 0, rowIndex: 0, column: 0 });
    var rows = [];
    var navigationItems = [];
    var availableNavigationItems = [];
    var navigationStart = 0;
    var lastSelectionKey = '';
    var homeDirty = true;
    var backdropTimer = null;
    var activeBackdrop = 0;
    var activeBackdropSource = '';
    var themeTimer = null;
    var themeKeys = [];
    var themeCache = {};
    var messageTimer = null;
    var activeCardProfile = null;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }

    function array(value) {
      return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
    }

    function copyFocus(source) {
      source = source || {};
      return {
        area: source.area === 'nav' ? 'nav' : 'media',
        navIndex: Math.max(0, Number(source.navIndex) || 0),
        rowIndex: Math.max(0, Number(source.rowIndex) || 0),
        column: Math.max(0, Number(source.column) || 0)
      };
    }

    function replaceArray(target, source) {
      var index;
      target.splice(0, target.length);
      source = array(source);
      for (index = 0; index < source.length; index += 1) { target.push(source[index]); }
      return target;
    }

    function settings() { return call(access.settings) || {}; }
    function authState() { return call(access.authState) || {}; }
    function currentView() { return String(call(access.currentView) || 'home'); }
    function pointerSelectionActive() { return call(access.pointerSelectionActive) === true; }
    function navigationHasFocus() { return call(access.navigationHasFocus) === true; }
    function watchlistAvailable() { return call(access.watchlistAvailable) === true; }
    function translate(key, parameters) { return call(presentation.translate, key, parameters) || String(key || ''); }
    function element(tagName, className, text) { return call(presentation.element, tagName, className, text); }
    function updateText(node, value) { call(presentation.updateText, node, value); }

    function setHomeLoading(loading) {
      if (homeLoading === loading) { return; }
      homeLoading = loading;
      call(presentation.setHomeLoading, loading);
    }

    function loadHome(callback) {
      var generation;
      if (destroyed || typeof services.loadHome !== 'function') { return; }
      generation = homeGeneration += 1;
      setHomeLoading(true);
      try {
        return services.loadHome(function (error, nextRows) {
          if (destroyed || generation !== homeGeneration) { return; }
          setHomeLoading(false);
          callback(error || null, nextRows || []);
        });
      } catch (error) {
        if (destroyed || generation !== homeGeneration) { return null; }
        setHomeLoading(false);
        callback(error, []);
        return null;
      }
    }

    function refreshHome(focusMode) {
      var generation;
      if (homeRefreshCoordinator) {
        homeRefreshCoordinator.refresh();
        return;
      }
      if (destroyed || typeof services.loadHome !== 'function') { return; }
      generation = homeGeneration += 1;
      setHomeLoading(true);
      services.loadHome(function (error, nextRows) {
        if (destroyed || generation !== homeGeneration) { return; }
        setHomeLoading(false);
        if (!error) {
          if (HomeState && HomeState.normalizeRows) { useHomeRows(nextRows || [], 0, { focus: focusMode || 'preserve' }); }
          else { call(presentation.applyHome, nextRows || [], { focus: focusMode || 'preserve', error: null }); }
        }
        call(presentation.applyHomeResult, error || null, nextRows || [], focusMode || 'preserve');
      });
    }

    function initializeHomeLifecycle() {
      if (!HomeState || !homeOptions || typeof services.loadHome !== 'function' || !timerRoot) { return; }
      homeRefreshCoordinator = HomeState.createRefreshCoordinator(function (callback) {
        return loadHome(callback);
      }, function (error, nextRows, changed, initial) {
        if (destroyed) { return; }
        call(homeOptions.onResult, error, nextRows, changed, initial);
        if (homePoller) { homePoller.schedule(); }
      });
      homePoller = HomeState.createPoller(timerRoot, {
        interval: homeOptions.interval || 10000,
        canRefresh: homeOptions.canRefresh || function () { return false; },
        isLoading: function () { return homeRefreshCoordinator.isLoading(); },
        refresh: function () { homeRefreshCoordinator.refresh(); }
      });
    }

    function setRows(nextRows) {
      replaceArray(rows, HomeState && HomeState.normalizeRows ? HomeState.normalizeRows(nextRows) : array(nextRows));
      return rows;
    }

    function clearHome() {
      rows.splice(0, rows.length);
      lastSelectionKey = '';
      homeDirty = true;
      call(actions.onHomeCleared);
    }

    function setHomeDirty(value) { homeDirty = value !== false; return homeDirty; }
    function isHomeDirty() { return homeDirty; }
    function selectionKey() { return lastSelectionKey; }
    function clearSelectionKey() { lastSelectionKey = ''; }

    function focusState() { return focus; }

    function setFocus(next) {
      next = copyFocus(next);
      focus.area = next.area;
      focus.navIndex = next.navIndex;
      focus.rowIndex = next.rowIndex;
      focus.column = next.column;
      return focus;
    }

    function mediaKey(item) {
      if (HomeState && HomeState.mediaKey) { return HomeState.mediaKey(item); }
      item = item || {};
      return String(item.ratingKey || item.key || item.image || item.title || '');
    }

    function rowKey(row) {
      if (HomeState && HomeState.rowKey) { return HomeState.rowKey(row); }
      row = row || {};
      return String(row.title || '') + '|' + String(row.shape || 'poster');
    }

    function homeSelectionKey() {
      var row = rows[focus.rowIndex];
      var item = row && row.items && row.items[focus.column];
      if (!item) { return ''; }
      if (HomeState && HomeState.selectionKey) { return HomeState.selectionKey(rows, focus); }
      return JSON.stringify([rowKey(row), mediaKey(item)]);
    }

    function mediaTitle(item) { return MediaLabels ? MediaLabels.title(item, translate) : String(item && item.title || ''); }
    function mediaCardMeta(item) { return MediaLabels ? MediaLabels.cardMeta(item, translate) : String(item && item.meta || ''); }
    function mediaCardDetail(item) { return MediaLabels ? MediaLabels.cardDetail(item, translate) : String(item && item.detail || ''); }
    function mediaDescription(item) { return MediaLabels ? MediaLabels.description(item, translate) : mediaTitle(item); }

    function cardProfile() {
      if (!activeCardProfile) { activeCardProfile = CardLayout.profile(settings().cardScale); }
      return activeCardProfile;
    }

    function cardMetrics() { return cardProfile().metrics; }

    function applyCardScale() {
      var current = settings();
      activeCardProfile = CardLayout.profile(current.cardScale);
      var profile = activeCardProfile;
      var metrics = profile.metrics;
      var wide = profile.wideMetrics;
      var style;
      if (!document || !document.documentElement) { return; }
      style = document.documentElement.style;
      style.setProperty('--poster-card-width', metrics.width + 'px');
      style.setProperty('--poster-image-height', metrics.imageHeight + 'px');
      style.setProperty('--poster-caption-height', metrics.captionHeight + 'px');
      style.setProperty('--poster-card-height', metrics.height + 'px');
      style.setProperty('--poster-card-gap', profile.posterGap + 'px');
      style.setProperty('--wide-card-width', wide.width + 'px');
      style.setProperty('--wide-image-height', wide.imageHeight + 'px');
      style.setProperty('--wide-card-height', wide.height + 'px');
      style.setProperty('--poster-title-font', profile.titleFont + 'px');
      style.setProperty('--poster-meta-font', profile.metaFont + 'px');
    }

    function navigationTitle(item) { return item && item.labelKey ? translate(item.labelKey) : String(item && item.title || ''); }

    function activeProfileShortcutVisible() {
      var current = authState();
      if (current.mode !== 'plex') { return !!current.setupComplete; }
      return call(access.activeProfileVisible) === true;
    }

    function navigationFocusCount() { return navigationItems.length + 1 + (activeProfileShortcutVisible() ? 1 : 0); }
    function isActivityNavIndex(index) { return Number(index) === navigationItems.length; }
    function isProfileNavIndex(index) { return activeProfileShortcutVisible() && Number(index) === navigationItems.length + 1; }

    function visibleNavigationItems(items) {
      return NavigationModel && NavigationModel.visibleItems ? NavigationModel.visibleItems(items, settings()) : array(items).slice();
    }

    function applyNavigationVisibility(items) {
      var previous = navigationItems.slice();
      var activeIndex;
      if (items) { replaceArray(availableNavigationItems, items); }
      replaceArray(navigationItems, visibleNavigationItems(availableNavigationItems));
      activeIndex = NavigationModel && NavigationModel.restoreVisibleIndex ? NavigationModel.restoreVisibleIndex(previous, navigationItems, focus.navIndex) : Math.min(focus.navIndex, Math.max(0, navigationItems.length - 1));
      focus.navIndex = activeIndex;
      return navigationItems;
    }

    function setNavigationItems(items) {
      replaceArray(availableNavigationItems, items || []);
      applyNavigationVisibility();
      return navigationItems;
    }

    function navigationButton(entry) {
      var item = element('button', 'nav-item', navigationTitle(entry.item));
      item.type = 'button';
      item.setAttribute('data-nav-index', entry.index);
      if (entry.item.kind === 'watchlist' && !watchlistAvailable()) {
        item.className += ' is-disabled';
        item.setAttribute('aria-disabled', 'true');
      }
      if (entry.index === focus.navIndex) {
        item.className += ' is-selected';
        if (navigationHasFocus()) { item.className += ' is-focused'; }
        if (call(access.navigationReorderMode) === true) { item.className += ' is-reordering'; }
      }
      return item;
    }

    function renderNavigation() {
      var navigation;
      var home;
      var libraries;
      var fixed;
      var libraryEntries = [];
      var libraryButtons = [];
      var widths = [];
      var focusedLibraryIndex = navigationStart;
      var windowState;
      var index;
      var entry;
      var button;
      if (!document || !document.getElementById) { return; }
      navigation = document.getElementById('navigation');
      if (!navigation) { return; }
      home = element('div', 'navigation-home');
      libraries = element('div', 'navigation-libraries');
      fixed = element('div', 'navigation-fixed');
      navigation.innerHTML = '';
      for (index = 0; index < navigationItems.length; index += 1) {
        entry = { item: navigationItems[index], index: index };
        if (entry.item.kind === 'home') { home.appendChild(navigationButton(entry)); }
        else if (entry.item.kind === 'library') {
          if (index === focus.navIndex) { focusedLibraryIndex = libraryEntries.length; }
          libraryEntries.push(entry);
        } else { fixed.appendChild(navigationButton(entry)); }
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
        windowState = NavbarWindow.calculate(widths, libraries.clientWidth, focusedLibraryIndex, navigationStart);
        navigationStart = windowState.start;
        libraries.className += windowState.canScrollLeft ? ' is-clipped-left' : '';
        libraries.className += windowState.canScrollRight ? ' is-clipped-right' : '';
        for (index = libraryButtons.length - 1; index >= 0; index -= 1) {
          if (index < windowState.start || index >= windowState.end) { libraries.removeChild(libraryButtons[index]); }
        }
      }
      call(presentation.renderActiveProfile);
      call(presentation.renderServerActivities);
    }

    function selectorForNavIndex(index) {
      var selector;
      if (isProfileNavIndex(index)) { return '[data-profile-shortcut]'; }
      if (isActivityNavIndex(index)) { return '[data-activity-shortcut]'; }
      selector = '[data-nav-index="' + index + '"]';
      if (document && !document.querySelector(selector) && navigationItems[index] && navigationItems[index].kind === 'library') {
        renderNavigation();
      }
      return selector;
    }

    function createCard(item, rowIndex, column, shape, showLibraryBadge) {
      var card = element('button', 'media-card ' + shape + (item.viewed ? ' is-viewed' : ''));
      var image = element('img', 'card-image');
      var caption = element('span', 'card-caption');
      card.type = 'button';
      image.alt = '';
      caption.appendChild(element('span', 'card-title'));
      caption.appendChild(element('span', 'card-meta'));
      card.appendChild(image);
      card.appendChild(caption);
      updateHomeCard(card, item, rowIndex, column, shape, showLibraryBadge);
      return card;
    }

    function updateHomeCard(card, item, rowIndex, column, shape, showLibraryBadge) {
      var caption = card.querySelector('.card-caption');
      var libraryBadge = card.querySelector('.home-library-badge');
      var libraryTitle = showLibraryBadge === true ? String(item.libraryTitle || '') : '';
      var detail = card.querySelector('.card-detail');
      var progress = card.querySelector('.progress-track');
      var progressValue;
      card.className = 'media-card ' + shape + (item.viewed ? ' is-viewed' : '');
      card.setAttribute('data-row-index', rowIndex);
      card.setAttribute('data-column', column);
      card.setAttribute('data-media-key', mediaKey(item));
      card.setAttribute('aria-label', mediaDescription(item) + (libraryTitle ? ', ' + libraryTitle : ''));
      updateText(card.querySelector('.card-title'), mediaTitle(item));
      updateText(card.querySelector('.card-meta'), mediaCardMeta(item));
      if (mediaCardDetail(item)) {
        if (!detail) { detail = element('span', 'card-detail'); caption.appendChild(detail); }
        updateText(detail, mediaCardDetail(item));
      } else if (detail) { caption.removeChild(detail); }
      if (libraryTitle) {
        if (!libraryBadge) {
          libraryBadge = element('span', 'home-library-badge media-library-badge');
          card.appendChild(libraryBadge);
        }
        updateText(libraryBadge, libraryTitle);
      } else if (libraryBadge) { card.removeChild(libraryBadge); }
      if (typeof item.progress === 'number') {
        if (!progress) {
          progress = element('span', 'progress-track');
          progress.appendChild(element('span', 'progress-value'));
          card.appendChild(progress);
        }
        progressValue = progress.querySelector('.progress-value');
        progressValue.style.width = item.progress + '%';
      } else if (progress) { card.removeChild(progress); }
    }

    function fixedPosterSpecification(source, size, priority, scope) {
      var result = call(presentation.fixedPosterSpecification, source, size, priority, scope);
      size = size || {};
      return result || {
        source: source,
        previewWidth: Math.max(1, Number(size.previewWidth || size.width) || 1),
        previewHeight: Math.max(1, Number(size.previewHeight || size.height) || 1),
        width: Math.max(1, Number(size.width) || 1),
        height: Math.max(1, Number(size.height) || 1),
        priority: priority,
        scope: scope
      };
    }

    function renderRows() {
      var content;
      var existingSections = [];
      var sectionsByKey = {};
      var renderToken = String(now()) + ':' + String(Math.random());
      var rowIndex;
      var column;
      var rowData;
      var currentRowKey;
      var section;
      var row;
      var image;
      var posterJobs = [];
      var posterLoader = services.posterLoader;
      var layoutProfile;
      if (!document || !document.getElementById) { return; }
      content = document.getElementById('content');
      if (!content) { return; }
      layoutProfile = cardProfile();

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
          key = mediaKey(rowData.items[index]);
          card = cardsByKey[key] && cardsByKey[key].length ? cardsByKey[key].shift() : null;
          assignments[index] = card;
          if (card) { used.push(card); }
        }
        for (index = 0; index < existingCards.length; index += 1) {
          if (used.indexOf(existingCards[index]) === -1) { recyclable.push(existingCards[index]); }
        }
        for (index = 0; index < rowData.items.length; index += 1) {
          card = assignments[index] || recyclable.shift() || createCard(rowData.items[index], rowIndex, index, rowData.shape, rowData.showLibraryBadge);
          updateHomeCard(card, rowData.items[index], rowIndex, index, rowData.shape, rowData.showLibraryBadge);
          row.appendChild(card);
          image = card.getElementsByTagName('img')[0];
          posterJobs.push({
            target: image,
            specification: fixedPosterSpecification(
              rowData.items[index].image,
              rowData.shape === 'wide' ? layoutProfile.widePoster : layoutProfile.poster,
              rowIndex < 2 ? 1 : 2,
              'home'
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
        currentRowKey = section.getAttribute('data-home-row-key') || '';
        sectionsByKey[currentRowKey] = sectionsByKey[currentRowKey] || [];
        sectionsByKey[currentRowKey].push(section);
      }
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        rowData = rows[rowIndex];
        currentRowKey = rowKey(rowData);
        section = sectionsByKey[currentRowKey] && sectionsByKey[currentRowKey].length ? sectionsByKey[currentRowKey].shift() : null;
        if (!section) {
          section = element('section', 'media-section');
          section.appendChild(element('h2', 'section-title'));
          section.appendChild(element('div', 'media-row'));
        }
        section.setAttribute('data-home-row-key', currentRowKey);
        section.setAttribute('data-home-render-token', renderToken);
        updateText(section.querySelector('.section-title'), rowData.title);
        row = section.querySelector('.media-row');
        reconcileCards();
        content.appendChild(section);
      }
      for (column = 0; column < existingSections.length; column += 1) {
        section = existingSections[column];
        if (section.getAttribute('data-home-render-token') !== renderToken && section.parentNode === content) { content.removeChild(section); }
      }
      if (posterLoader && posterLoader.loadBatch) { posterLoader.loadBatch(posterJobs); }
    }

    function selectorForState() {
      if (focus.area === 'nav') { return selectorForNavIndex(focus.navIndex); }
      return '[data-row-index="' + focus.rowIndex + '"][data-column="' + focus.column + '"]';
    }

    function clearLogicalFocus() {
      var focused;
      var index;
      if (!document || !document.querySelectorAll) { return; }
      focused = document.querySelectorAll('.is-focused');
      for (index = 0; index < focused.length; index += 1) {
        focused[index].className = focused[index].className.replace(/\s*is-focused/g, '');
      }
    }

    function keepFocusVisible(target) {
      var content;
      var section;
      var contentRect;
      var sectionRect;
      var margin = 18;
      var lowerComfortLine;
      if (focus.area !== 'media' || !target) { return; }
      content = document.getElementById('content');
      section = target.parentNode && target.parentNode.parentNode;
      if (!content || !section || !content.getBoundingClientRect || !section.getBoundingClientRect) { return; }
      contentRect = content.getBoundingClientRect();
      sectionRect = section.getBoundingClientRect();
      lowerComfortLine = contentRect.top + contentRect.height * 0.75;
      if (sectionRect.bottom > lowerComfortLine) { content.scrollTop += sectionRect.bottom - lowerComfortLine + margin; }
      else if (sectionRect.top < contentRect.top + margin) { content.scrollTop = Math.max(0, content.scrollTop - (contentRect.top - sectionRect.top + margin)); }
    }

    function updateFocus() {
      var next;
      var item;
      clearLogicalFocus();
      if (!document || !document.querySelector) { return; }
      next = document.querySelector(selectorForState());
      if (next) {
        next.className += ' is-focused';
        if (focus.area === 'media') { call(presentation.prioritizePoster, next); }
        if (!pointerSelectionActive()) {
          if (next.focus) { next.focus(); }
          keepFocusVisible(next);
        }
      }
      if (currentView() === 'home' && focus.area === 'media' && rows[focus.rowIndex] && rows[focus.rowIndex].items[focus.column]) {
        lastSelectionKey = homeSelectionKey();
      }
      scheduleBackdrop();
      item = focus.area === 'media' && rows[focus.rowIndex] ? rows[focus.rowIndex].items[focus.column] : null;
      if (item) { scheduleTheme(item); }
      else { call(services.stopTheme); }
    }

    function focusHomeStart() {
      var rowIndex;
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].items && rows[rowIndex].items.length) {
          setFocus({ area: 'media', navIndex: 0, rowIndex: rowIndex, column: 0 });
          if (document && document.getElementById('content')) { document.getElementById('content').scrollTop = 0; }
          updateFocus();
          return true;
        }
      }
      return false;
    }

    function isHomeStart() {
      var rowIndex;
      var content;
      if (currentView() !== 'home' || focus.area !== 'media' || focus.column !== 0) { return false; }
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].items && rows[rowIndex].items.length) { break; }
      }
      if (rowIndex >= rows.length || focus.rowIndex !== rowIndex) { return false; }
      content = document && document.getElementById ? document.getElementById('content') : null;
      return !content || Number(content.scrollTop || 0) <= 1;
    }

    function useHomeRows(nextRows, navIndex, options) {
      var normalized = HomeState.normalizeRows(nextRows);
      var baseState;
      var selected;
      options = options || {};
      if (!normalized.length) {
        completeStartup();
        call(actions.onHomeEmpty);
        return false;
      }
      setRows(normalized);
      call(actions.hideViewState);
      renderRows();
      baseState = options.focus === 'nav'
        ? { area: 'nav', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
        : (options.focus === 'first'
          ? { area: 'media', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
          : { area: 'media', navIndex: navIndex || 0, rowIndex: focus.rowIndex || 0, column: focus.column || 0 });
      selected = options.focus === 'preserve' ? (options.selectionKey || lastSelectionKey) : '';
      setFocus(HomeState.restoreFocus(rows, baseState, selected));
      homeDirty = false;
      if ((options.focus === 'first' || (selected && HomeState.selectionKey(rows, focus) !== selected)) && document && document.getElementById('content')) {
        document.getElementById('content').scrollTop = 0;
      }
      updateFocus();
      completeStartup();
      if (!homeReadyNotified) { homeReadyNotified = true; call(actions.onHomeReady); }
      call(actions.scheduleAdjacentLibraryPrefetch);
      return true;
    }

    function artworkUrl(item) {
      var source = item && (item.art || item.image) || '';
      return source.replace('/400/600', '/1280/720').replace('/640/360', '/1280/720');
    }

    function isBackdropCurrent(generation) { return !destroyed && generation === backdropGeneration; }
    function beginBackdrop() { return backdropGeneration += 1; }
    function isThemeCurrent(generation) { return !destroyed && generation === themeGeneration; }
    function beginTheme() { return themeGeneration += 1; }

    function clearBackdropPresentation() {
      var first;
      var second;
      var posterLoader = services.posterLoader;
      beginBackdrop();
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      backdropTimer = null;
      if (!document || !document.getElementById) { return; }
      first = document.getElementById('backdrop-a');
      second = document.getElementById('backdrop-b');
      if (posterLoader && posterLoader.cancelScope) { posterLoader.cancelScope('backdrop'); }
      if (posterLoader && posterLoader.load) {
        posterLoader.load(first, { source: '', scope: 'backdrop' });
        posterLoader.load(second, { source: '', scope: 'backdrop' });
      }
      if (first) { first.className = 'backdrop-image'; }
      if (second) { second.className = 'backdrop-image'; }
      activeBackdrop = 0;
      activeBackdropSource = '';
    }

    function activateBackdrop(nextIndex, source, request) {
      var current;
      var next;
      if (!isBackdropCurrent(request) || !document) { return; }
      current = document.getElementById(activeBackdrop === 0 ? 'backdrop-a' : 'backdrop-b');
      next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
      if (!current || !next) { return; }
      current.className = current.className.replace(/\s*is-active/g, '');
      if (next.className.indexOf('is-active') === -1) { next.className += ' is-active'; }
      activeBackdrop = nextIndex;
      activeBackdropSource = source;
    }

    function loadBackdropItem(item, request) {
      var nextIndex;
      var next;
      var source = artworkUrl(item);
      var posterLoader = services.posterLoader;
      if (!source) {
        if (isBackdropCurrent(request)) { clearBackdropPresentation(); }
        return;
      }
      if (source === activeBackdropSource || !document) { return; }
      nextIndex = activeBackdrop === 0 ? 1 : 0;
      next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
      if (!next) { return; }
      if (next.__plexProgressiveSource === source && (next.__plexProgressiveState === 'preview' || next.__plexProgressiveState === 'full')) {
        activateBackdrop(nextIndex, source, request);
        return;
      }
      if (posterLoader && posterLoader.cancelScope) { posterLoader.cancelScope('backdrop'); }
      next.className = next.className.replace(/\s*is-active/g, '');
      if (posterLoader && posterLoader.load) {
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
    }

    function loadBackdrop(request) {
      if (focus.area !== 'media' || !rows[focus.rowIndex]) { return; }
      loadBackdropItem(rows[focus.rowIndex].items[focus.column], request);
    }

    function scheduleBackdrop() {
      var request = beginBackdrop();
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      if (!timerRoot.setTimeout) { loadBackdrop(request); return; }
      backdropTimer = timerRoot.setTimeout(function () {
        backdropTimer = null;
        loadBackdrop(request);
      }, 250);
    }

    function scheduleViewBackdrop(item, expectedView, delay) {
      var request = beginBackdrop();
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      if (!timerRoot.setTimeout) {
        if (currentView() === expectedView && isBackdropCurrent(request)) { loadBackdropItem(item, request); }
        return;
      }
      backdropTimer = timerRoot.setTimeout(function () {
        backdropTimer = null;
        if (currentView() === expectedView && isBackdropCurrent(request)) { loadBackdropItem(item, request); }
      }, delay);
    }

    function scheduleTheme(item) {
      var current = settings();
      var cached;
      var cacheKey;
      var token = beginTheme();
      if (themeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(themeTimer); }
      themeTimer = null;
      if (!current.backgroundMusic || !item) { call(services.stopTheme); return; }
      cacheKey = String(call(access.themeIdentity) || '') + '|' + String(item.themeLookupKey || item.themeKey || item.ratingKey || '');
      cached = cacheKey ? themeCache[cacheKey] : null;
      if (item.themeUrl || cached) {
        call(services.playTheme, item.themeUrl ? item : cached, { delay: current.backgroundDelay, volume: current.backgroundVolume });
        return;
      }
      call(services.stopTheme);
      if (!item.ratingKey || typeof services.loadThemeMetadata !== 'function') { return; }
      themeTimer = timerRoot.setTimeout(function () {
        themeTimer = null;
        services.loadThemeMetadata(item.ratingKey, function (error, detail) {
          var oldKey;
          if (error || !isThemeCurrent(token) || !detail || !detail.themeUrl) { return; }
          themeCache[cacheKey] = detail;
          themeKeys.push(cacheKey);
          while (themeKeys.length > 20) { oldKey = themeKeys.shift(); delete themeCache[oldKey]; }
          call(services.playTheme, detail, { delay: 1, volume: settings().backgroundVolume });
        });
      }, current.backgroundDelay);
    }

    function handleHomeKey(event, direction) {
      var layout;
      var item;
      if (destroyed) { return false; }
      if (currentView() === 'home' && focus.area === 'nav' && event.keyCode === 13) {
        if (event.preventDefault) { event.preventDefault(); }
        item = navigationItems[focus.navIndex];
        if (item && item.kind === 'library') { call(actions.startNavHold, focus.navIndex); }
        else { call(actions.activateNavigationSelection); }
        return true;
      }
      if (event.keyCode === 415 && focus.area === 'media') {
        if (event.preventDefault) { event.preventDefault(); }
        if (rows[focus.rowIndex]) { call(actions.playHomeItem, rows[focus.rowIndex].items[focus.column]); }
        return true;
      }
      if (direction) {
        if (event.preventDefault) { event.preventDefault(); }
        layout = { navCount: navigationFocusCount(), rowLengths: rows.map(function (row) { return row.items.length; }) };
        setFocus(FocusModel.move(focus, direction, layout));
        updateFocus();
        if (focus.area === 'nav' && (direction === 'left' || direction === 'right')) { call(actions.scheduleNavigationPreview, focus.navIndex); }
        return true;
      }
      if (event.keyCode === 13) {
        if (event.preventDefault) { event.preventDefault(); }
        call(actions.activateHome);
        return true;
      }
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (event.preventDefault) { event.preventDefault(); }
        if (isHomeStart()) { call(actions.requestExit); }
        else { focusHomeStart(); }
        return true;
      }
      return false;
    }

    function showMessage(text) {
      var message;
      if (!document || !document.getElementById) { return; }
      message = document.getElementById('message');
      if (!message) { return; }
      if (messageTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(messageTimer); }
      message.innerHTML = '';
      message.appendChild(document.createTextNode(text));
      message.className = 'message is-visible';
      messageTimer = timerRoot.setTimeout(function () { messageTimer = null; message.className = 'message'; }, 1600);
    }

    function completeStartup() {
      var splash = document && document.getElementById ? document.getElementById('startup-splash') : null;
      var elapsed;
      var delay;
      function finish() {
        if (document && document.body) { document.body.className = document.body.className.replace(/\s*is-booting/g, ''); }
        if (!splash) { return; }
        splash.className = 'startup-splash is-leaving';
        timerRoot.setTimeout(function () { splash.className = 'startup-splash is-hidden'; }, 250);
      }
      if (startupComplete) {
        if (document && document.body) { document.body.className = document.body.className.replace(/\s*is-booting/g, ''); }
        return;
      }
      startupComplete = true;
      elapsed = now() - startupStartedAt;
      delay = Math.max(0, 1000 - elapsed);
      if (startupTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(startupTimer); }
      startupTimer = timerRoot.setTimeout(finish, delay);
    }

    function updateClock() {
      var value;
      var hours;
      var minutes;
      var node;
      if (!document || !document.getElementById) { return; }
      value = nowDate();
      hours = String(value.getHours());
      minutes = String(value.getMinutes());
      node = document.getElementById('clock');
      if (!node) { return; }
      node.textContent = (hours.length < 2 ? '0' : '') + hours + ':' + (minutes.length < 2 ? '0' : '') + minutes;
    }

    function snapshot() {
      return {
        focus: copyFocus(focus),
        rows: rows.slice(),
        navigationItems: navigationItems.slice(),
        availableNavigationItems: availableNavigationItems.slice(),
        navigationStart: navigationStart,
        lastSelectionKey: lastSelectionKey,
        homeDirty: homeDirty,
        homeLoading: homeLoading,
        activeBackdrop: activeBackdrop,
        activeBackdropSource: activeBackdropSource,
        destroyed: destroyed
      };
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      homeGeneration += 1;
      backdropGeneration += 1;
      themeGeneration += 1;
      if (homePoller) { homePoller.stop(); }
      if (homeRefreshCoordinator) { homeRefreshCoordinator.reset(); }
      if (startupTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(startupTimer); }
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      if (themeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(themeTimer); }
      if (messageTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(messageTimer); }
      startupTimer = null;
      backdropTimer = null;
      themeTimer = null;
      messageTimer = null;
    }

    setNavigationItems(values.navigationItems || []);
    setRows(values.rows || []);
    initializeHomeLifecycle();

    return {
      activeBackdropSource: function () { return activeBackdropSource; },
      activeProfileShortcutVisible: activeProfileShortcutVisible,
      applyCardScale: applyCardScale,
      applyNavigationVisibility: applyNavigationVisibility,
      availableNavigationItems: function () { return availableNavigationItems; },
      beginBackdrop: beginBackdrop,
      beginTheme: beginTheme,
      cardMetrics: cardMetrics,
      cardProfile: cardProfile,
      clearBackdrop: clearBackdropPresentation,
      clearHome: clearHome,
      clearLogicalFocus: clearLogicalFocus,
      clearSelectionKey: clearSelectionKey,
      completeStartup: completeStartup,
      createCard: createCard,
      destroy: destroy,
      focusHomeStart: focusHomeStart,
      focusState: focusState,
      handleHomeKey: handleHomeKey,
      isActivityNavIndex: isActivityNavIndex,
      isBackdropCurrent: isBackdropCurrent,
      isHomeDirty: isHomeDirty,
      isHomeLoading: function () { return homeLoading; },
      isProfileNavIndex: isProfileNavIndex,
      isThemeCurrent: isThemeCurrent,
      keepFocusVisible: keepFocusVisible,
      loadBackdropItem: loadBackdropItem,
      loadHome: loadHome,
      markHomeDirty: function () { return setHomeDirty(true); },
      navigationButton: navigationButton,
      navigationFocusCount: navigationFocusCount,
      navigationItems: function () { return navigationItems; },
      navigationWindow: function (length, capacity) {
        var count = Math.max(0, Number(length) || 0);
        var size = Math.max(1, Number(capacity) || 1);
        var maximum = Math.max(0, count - size);
        navigationStart = Math.min(navigationStart, maximum);
        return { start: navigationStart, end: Math.min(count, navigationStart + size) };
      },
      refreshHome: refreshHome,
      renderNavigation: renderNavigation,
      renderRows: renderRows,
      requestBackdrop: function (item) {
        var request;
        if (destroyed) { return; }
        request = beginBackdrop();
        if (typeof services.loadBackdrop === 'function') {
          services.loadBackdrop(item, function (error, source) {
            if (!isBackdropCurrent(request)) { return; }
            if (error || !source) { call(presentation.clearBackdrop); return; }
            call(presentation.applyBackdrop, item, source);
          });
        } else { loadBackdropItem(item, request); }
      },
      requestTheme: function (item) {
        var request;
        if (destroyed) { return; }
        request = beginTheme();
        if (typeof services.loadTheme === 'function') {
          services.loadTheme(item, function (error, theme) {
            if (!isThemeCurrent(request)) { return; }
            if (error || !theme) { call(presentation.clearTheme); return; }
            call(presentation.applyTheme, item, theme);
          });
        } else { scheduleTheme(item); }
      },
      resetHome: function () {
        homeGeneration += 1;
        if (homeRefreshCoordinator) { homeRefreshCoordinator.reset(); }
        setHomeLoading(false);
      },
      rows: function () { return rows; },
      scheduleBackdrop: scheduleBackdrop,
      scheduleDetailBackdrop: function (item) { scheduleViewBackdrop(item, 'detail', 0); },
      scheduleHomePolling: function () { if (homePoller) { homePoller.schedule(); } },
      scheduleSearchBackdrop: function (item) { scheduleViewBackdrop(item, 'search', 250); },
      scheduleTheme: scheduleTheme,
      selectionKey: selectionKey,
      selectorForNavIndex: selectorForNavIndex,
      selectorForState: selectorForState,
      setFocus: setFocus,
      setHomeDirty: setHomeDirty,
      setNavigationItems: setNavigationItems,
      setNavigationStart: function (value) { navigationStart = Math.max(0, Number(value) || 0); },
      setRows: setRows,
      showMessage: showMessage,
      snapshot: snapshot,
      stopHomePolling: function () { if (homePoller) { homePoller.stop(); } },
      updateClock: updateClock,
      updateFocus: updateFocus,
      updateHomeCard: updateHomeCard,
      useHomeRows: useHomeRows,
      visibleNavigationItems: visibleNavigationItems
    };
  }

  return { create: create };
}));
