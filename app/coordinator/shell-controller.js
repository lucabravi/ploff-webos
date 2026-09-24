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
    var viewRoot = values.root || {};
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
    var NavigationIcon = modules.NavigationIcon;
    var homeOptions = values.home || null;
    var destroyed = false;
    var homeGeneration = 0;
    var backdropGeneration = 0;
    var themeGeneration = 0;
    var homeLoading = false;
    var startupStartedAt = now();
    var startupComplete = false;
    var homeReadyNotified = false;
    var homeArtworkPreviewSettled = false;
    var homeArtworkPreviewReadyNotified = false;
    var homeArtworkStartupDeferred = false;
    var startupTimer = null;
    var homeRefreshCoordinator = null;
    var homePoller = null;
    var focus = copyFocus(values.initialFocus || { area: 'media', navIndex: 0, rowIndex: 0, column: 0 });
    var rows = [];
    var homeRowLengths = [];
    var navigationItems = [];
    var availableNavigationItems = [];
    var navigationStart = 0;
    var navigationWindowEnd = 0;
    var navigationViewportWidth = 0;
    var navigationRenderKey = '';
    var navigationRenderedFocus = -1;
    var navigationLibrariesNode = null;
    var navigationButtonsByIndex = {};
    var lastSelectionKey = '';
    var homePresentationKey = '';
    var homeDirty = true;
    var backdropTimer = null;
    var backdropPrefetchTimer = null;
    var backdropPrefetchGeneration = 0;
    var activeBackdrop = 0;
    var activeBackdropSource = '';
    var activeBackdropContextIdentity = '';
    var themeTimer = null;
    var themeRequest = null;
    var homePresentationTimer = null;
    var homePresentationGeneration = 0;
    var themeKeys = [];
    var themeCache = {};
    var messageTimer = null;
    var activeCardProfile = null;
    var visibleRowIndex = -1;
    var homeScrollFrame = null;
    var homeScrollGeneration = 0;
    var homeArtworkVisibilityFrame = null;
    var homeArtworkVisibilityGeneration = 0;
    var homeArtworkWarmTimer = null;
    var homeArtworkWarmGeneration = 0;
    var homeRowTopInset = null;
    var homeCardTargets = {};
    var homeFocusTarget = null;

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

    function setRows(nextRows, normalized) {
      cancelHomeScrollFrame();
      replaceArray(rows, normalized === true ? array(nextRows) : (HomeState && HomeState.normalizeRows ? HomeState.normalizeRows(nextRows) : array(nextRows)));
      homeRowLengths = rows.map(function (row) { return row.items.length; });
      cancelHomeArtworkWarm();
      return rows;
    }

    function clearHome() {
      rows.splice(0, rows.length);
      homeRowLengths = [];
      lastSelectionKey = '';
      homePresentationKey = '';
      visibleRowIndex = -1;
      cancelHomeScrollFrame();
      cancelHomeArtworkWarm();
      homeRowTopInset = null;
      homeCardTargets = {};
      homeFocusTarget = null;
      homeDirty = true;
      call(actions.onHomeCleared);
    }

    function setHomeDirty(value) { homeDirty = value !== false; return homeDirty; }
    function isHomeDirty() { return homeDirty; }
    function selectionKey() { return lastSelectionKey; }

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

    function sourceContextIdentity(context) {
      if (typeof presentation.sourceContextIdentity === 'function') { return String(presentation.sourceContextIdentity(context) || ''); }
      context = context || {};
      return String(context.serverMachineIdentifier || context.sourceId || '');
    }

    function sourceContextForItem(item) {
      return call(presentation.sourceContextForItem, item) || null;
    }

    function sourceIdentityForItem(item, sourceContext) {
      var resolved = call(presentation.sourceIdentityForItem, item, sourceContext);
      return String(resolved || sourceContextIdentity(sourceContext));
    }

    function sourceOwnerMachineIdentifier(item) {
      return String(item && (item.serverMachineIdentifier || item.machineIdentifier) || '');
    }

    function backdropKey(source, item, sourceContext) {
      return String(source || '') + '|' + sourceIdentityForItem(item, sourceContext);
    }

    function activeBackdropKey() {
      return String(activeBackdropSource || '') + '|' + String(activeBackdropContextIdentity || '');
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

    function homeTarget(rowIndex, column) {
      var row = rows[rowIndex];
      var item = row && row.items && row.items[column];
      var state;
      if (!item) { return null; }
      state = { area: 'media', navIndex: 0, rowIndex: rowIndex, column: column };
      return {
        item: item,
        rowIndex: rowIndex,
        column: column,
        key: HomeState && HomeState.selectionKey ? HomeState.selectionKey(rows, state) : JSON.stringify([rowKey(row), mediaKey(item)])
      };
    }

    function findHomePresentationTarget() {
      var state;
      var target;
      if (focus.area === 'media') {
        target = homeTarget(focus.rowIndex, focus.column);
        if (target) { homePresentationKey = target.key; return target; }
      }
      state = HomeState && HomeState.restoreFocus
        ? HomeState.restoreFocus(rows, { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }, homePresentationKey)
        : { area: 'media', navIndex: 0, rowIndex: Math.max(0, firstPopulatedRowIndex()), column: 0 };
      target = homeTarget(state.rowIndex, state.column);
      if (target) { homePresentationKey = target.key; return target; }
      homePresentationKey = '';
      return null;
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
      style.setProperty('--poster-title-font', String(profile.titleFont / 16) + 'rem');
      style.setProperty('--poster-meta-font', String(profile.metaFont / 16) + 'rem');
    }

    function navigationTitle(item) { return item && item.labelKey ? translate(item.labelKey) : String(item && item.title || ''); }

    function navigationDisplayMode(item) {
      var mode = String(item && item.displayMode || 'text');
      if (item && (item.kind === 'search' || item.kind === 'settings')) { return 'icon'; }
      if (item && (item.kind === 'home' || item.kind === 'library') && (mode === 'icon' || mode === 'icon-text')) { return mode; }
      return 'text';
    }

    function navigationIconName(item) {
      if (item && item.kind === 'search') { return 'search'; }
      if (item && item.kind === 'settings') { return 'settings'; }
      if (item && item.kind === 'home') { return String(item.icon || 'home'); }
      return String(item && item.icon || 'folder');
    }

    function appendNavigationIcon(button, item) {
      var name = NavigationIcon && NavigationIcon.normalize ? NavigationIcon.normalize(navigationIconName(item)) : navigationIconName(item);
      var icon = element('span', 'nav-item-icon');
      icon.setAttribute('data-nav-icon', name);
      icon.setAttribute('aria-hidden', 'true');
      if (NavigationIcon && typeof NavigationIcon.svg === 'function') { icon.innerHTML = NavigationIcon.svg(name); }
      button.appendChild(icon);
    }

    function navigationButtonMetrics(buttons) {
      var margin = 12;
      var focusGutter = 0;
      var style;
      var parsedMargin;
      var parsedFocusGutter;
      var styleButton;
      var index;
      var rect;
      var width;
      var result = [];
      if (buttons.length && typeof viewRoot.getComputedStyle === 'function') {
        styleButton = buttons[0];
        for (index = 0; index < buttons.length; index += 1) {
          if ((' ' + String(buttons[index].className || '') + ' ').indexOf(' is-focused ') !== -1) {
            styleButton = buttons[index];
            break;
          }
        }
        style = viewRoot.getComputedStyle(styleButton);
        parsedMargin = parseFloat(style && style.marginRight);
        if (isFinite(parsedMargin) && parsedMargin >= 0) { margin = parsedMargin; }
        parsedFocusGutter = parseFloat(style && typeof style.getPropertyValue === 'function' ? style.getPropertyValue('--navigation-focus-gutter') : '');
        if (isFinite(parsedFocusGutter) && parsedFocusGutter >= 0) { focusGutter = parsedFocusGutter; }
        if (NavbarWindow && typeof NavbarWindow.focusShadowOutset === 'function') {
          focusGutter = Math.max(focusGutter, NavbarWindow.focusShadowOutset(style && style.boxShadow));
        }
      }
      for (index = 0; index < buttons.length; index += 1) {
        rect = typeof buttons[index].getBoundingClientRect === 'function' ? buttons[index].getBoundingClientRect() : null;
        width = rect && isFinite(Number(rect.width)) && Number(rect.width) > 0 ? Number(rect.width) : Number(buttons[index].offsetWidth);
        result.push((isFinite(width) && width > 0 ? width : 1) + margin);
      }
      return { widths: result, margin: margin, focusGutter: focusGutter };
    }

    function navigationRightArrowOffset(containerRight, itemRight, margin, focusGutter) {
      var edge = Number(containerRight);
      var item = Number(itemRight);
      var gap = Math.max(0, Number(margin) || 0) / 2;
      var gutter = Math.max(0, Number(focusGutter) || 0);
      var arrowHalf = 5;
      var targetCenter;
      var maximumCenter;
      if (!isFinite(edge) || !isFinite(item)) { return null; }
      targetCenter = item + gap;
      maximumCenter = edge - gutter - arrowHalf;
      targetCenter = Math.min(targetCenter, maximumCenter);
      return Math.max(gutter, edge - targetCenter - arrowHalf);
    }

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
      var title = navigationTitle(entry.item);
      var mode = navigationDisplayMode(entry.item);
      var item = element('button', 'nav-item' + (mode === 'icon' ? ' is-icon-only' : (mode === 'icon-text' ? ' has-icon' : '')));
      item.type = 'button';
      item.setAttribute('data-nav-index', entry.index);
      item.setAttribute('aria-label', title);
      if (mode !== 'text') { appendNavigationIcon(item, entry.item); }
      if (mode !== 'icon') { item.appendChild(element('span', 'nav-item-label', title)); }
      if (entry.item.offline) {
        item.className += ' is-offline';
        if (mode === 'icon') { item.appendChild(element('span', 'nav-item-label', translate('common.offline'))); }
      }
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

    function navigationStructureKey() {
      var parts = [];
      var bodyClass = document && document.body ? String(document.body.className || '') : '';
      var index;
      var item;
      parts.push(bodyClass);
      parts.push(String(viewRoot && viewRoot.innerWidth || ''));
      parts.push(watchlistAvailable() ? 'watchlist:1' : 'watchlist:0');
      for (index = 0; index < navigationItems.length; index += 1) {
        item = navigationItems[index] || {};
        parts.push([
          String(item.kind || ''),
          navigationTitle(item),
          navigationDisplayMode(item),
          navigationIconName(item)
        ].join(':'));
      }
      return parts.join('|');
    }

    function libraryPositionForNavigationIndex(targetIndex) {
      var position = 0;
      var index;
      for (index = 0; index < navigationItems.length; index += 1) {
        if (navigationItems[index] && navigationItems[index].kind === 'library') {
          if (index === targetIndex) { return position; }
          position += 1;
        }
      }
      return -1;
    }

    function applyNavigationButtonFocus(button, index) {
      var className;
      if (!button) { return; }
      className = String(button.className || '')
        .replace(/\s*is-selected/g, '')
        .replace(/\s*is-focused/g, '')
        .replace(/\s*is-reordering/g, '');
      if (index === focus.navIndex) {
        className += ' is-selected';
        if (navigationHasFocus()) { className += ' is-focused'; }
        if (call(access.navigationReorderMode) === true) { className += ' is-reordering'; }
      }
      button.className = className;
    }

    function refreshNavigationFocus(navigation, structureKey) {
      var item = navigationItems[focus.navIndex];
      var libraryPosition;
      var previous;
      var next;
      var viewportWidth;
      if (!navigationLibrariesNode || navigationLibrariesNode.parentNode !== navigation || structureKey !== navigationRenderKey) { return false; }
      viewportWidth = Number(navigationLibrariesNode.clientWidth || 0);
      if (viewportWidth !== navigationViewportWidth) { return false; }
      if (item && item.kind === 'library') {
        libraryPosition = libraryPositionForNavigationIndex(focus.navIndex);
        if (libraryPosition < navigationStart || libraryPosition >= navigationWindowEnd) { return false; }
      }
      next = navigationButtonsByIndex[focus.navIndex] || null;
      if (focus.navIndex < navigationItems.length && !next) { return false; }
      previous = navigationButtonsByIndex[navigationRenderedFocus] || null;
      applyNavigationButtonFocus(previous, navigationRenderedFocus);
      if (next !== previous) { applyNavigationButtonFocus(next, focus.navIndex); }
      navigationRenderedFocus = focus.navIndex;
      call(presentation.renderActiveProfile);
      call(presentation.renderServerActivities);
      return true;
    }

    function renderNavigation() {
      var navigation;
      var home;
      var libraries;
      var fixed;
      var libraryEntries = [];
      var libraryButtons = [];
      var widths = [];
      var buttonMetrics;
      var focusedLibraryIndex = navigationStart;
      var windowState;
      var libraryViewportWidth;
      var alignment;
      var trailingPreview;
      var renderStart;
      var renderEnd;
      var containerRect;
      var lastRect;
      var arrowRect;
      var rightCorrection;
      var rightArrowOffset;
      var leadingMargin;
      var index;
      var entry;
      var button;
      var structureKey;
      if (!document || !document.getElementById) { return; }
      navigation = document.getElementById('navigation');
      if (!navigation) { return; }
      structureKey = navigationStructureKey();
      if (refreshNavigationFocus(navigation, structureKey)) { return; }
      home = element('div', 'navigation-home');
      libraries = element('div', 'navigation-libraries');
      fixed = element('div', 'navigation-fixed');
      navigationButtonsByIndex = {};
      navigation.innerHTML = '';
      for (index = 0; index < navigationItems.length; index += 1) {
        entry = { item: navigationItems[index], index: index };
        if (entry.item.kind === 'home') {
          button = navigationButton(entry);
          navigationButtonsByIndex[index] = button;
          home.appendChild(button);
        }
        else if (entry.item.kind === 'library') {
          if (index === focus.navIndex) { focusedLibraryIndex = libraryEntries.length; }
          libraryEntries.push(entry);
        } else {
          button = navigationButton(entry);
          navigationButtonsByIndex[index] = button;
          fixed.appendChild(button);
        }
      }
      navigation.appendChild(home);
      navigation.appendChild(libraries);
      navigation.appendChild(fixed);
      for (index = 0; index < libraryEntries.length; index += 1) {
        button = navigationButton(libraryEntries[index]);
        libraries.appendChild(button);
        libraryButtons.push(button);
        navigationButtonsByIndex[libraryEntries[index].index] = button;
      }
      buttonMetrics = navigationButtonMetrics(libraryButtons);
      widths = buttonMetrics.widths;
      if (NavbarWindow && libraryEntries.length) {
        libraryViewportWidth = Number(libraries.clientWidth || 0);
        windowState = NavbarWindow.calculate(widths, libraryViewportWidth, focusedLibraryIndex, navigationStart);
        navigationStart = windowState.start;
        navigationWindowEnd = windowState.end;
        alignment = typeof NavbarWindow.scrolledAlignment === 'function' ? NavbarWindow.scrolledAlignment(widths, libraryViewportWidth, windowState, buttonMetrics.focusGutter) : null;
        trailingPreview = !alignment && typeof NavbarWindow.trailingPreview === 'function' ? NavbarWindow.trailingPreview(widths, libraryViewportWidth, windowState, 48) : null;
        renderStart = alignment ? alignment.start : windowState.start;
        renderEnd = trailingPreview ? trailingPreview.index + 1 : windowState.end;
        home.className += windowState.canScrollLeft ? ' has-clipped-libraries' : '';
        libraries.className += windowState.canScrollRight ? ' is-clipped-right' : '';
        if (alignment && libraryButtons[renderStart]) { libraryButtons[renderStart].style.marginLeft = String(-alignment.leadingClip) + 'px'; }
        if (trailingPreview && libraryButtons[trailingPreview.index]) {
          libraryButtons[trailingPreview.index].className += ' is-trailing-preview';
          libraryButtons[trailingPreview.index].style.setProperty('--navigation-preview-visible-width', String(trailingPreview.visibleWidth) + 'px');
        }
        for (index = libraryButtons.length - 1; index >= 0; index -= 1) {
          if (index < renderStart || index >= renderEnd) {
            delete navigationButtonsByIndex[libraryEntries[index].index];
            libraries.removeChild(libraryButtons[index]);
          }
        }
        if (libraryButtons[renderStart] && libraryButtons[windowState.end - 1] &&
            typeof libraries.getBoundingClientRect === 'function' &&
            typeof libraryButtons[windowState.end - 1].getBoundingClientRect === 'function') {
          containerRect = libraries.getBoundingClientRect();
          lastRect = libraryButtons[windowState.end - 1].getBoundingClientRect();
          arrowRect = trailingPreview && libraryButtons[trailingPreview.index] && typeof libraryButtons[trailingPreview.index].getBoundingClientRect === 'function' ? libraryButtons[trailingPreview.index].getBoundingClientRect() : lastRect;
          rightCorrection = 0;
          if (typeof NavbarWindow.rightEdgeCorrection === 'function') {
            rightCorrection = NavbarWindow.rightEdgeCorrection(containerRect.right, lastRect.right, buttonMetrics.focusGutter);
            if (rightCorrection > 0) {
              leadingMargin = parseFloat(libraryButtons[renderStart].style.marginLeft) || 0;
              libraryButtons[renderStart].style.marginLeft = String(leadingMargin - rightCorrection) + 'px';
            }
          }
          if (windowState.canScrollRight && libraries.style && typeof libraries.style.setProperty === 'function') {
            rightArrowOffset = navigationRightArrowOffset(
              containerRect.right,
              arrowRect.right - rightCorrection,
              buttonMetrics.margin,
              buttonMetrics.focusGutter
            );
            if (rightArrowOffset !== null) {
              libraries.style.setProperty('--navigation-right-arrow-right', String(rightArrowOffset) + 'px');
            }
          }
        }
      } else { navigationWindowEnd = libraryEntries.length; }
      navigationLibrariesNode = libraries;
      navigationViewportWidth = Number(libraries.clientWidth || 0);
      navigationRenderKey = structureKey;
      navigationRenderedFocus = focus.navIndex;
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

    function navigationTarget(index) {
      var target;
      if (index < navigationItems.length) {
        target = navigationButtonsByIndex[index] || null;
        if (!target && navigationItems[index] && navigationItems[index].kind === 'library') {
          renderNavigation();
          target = navigationButtonsByIndex[index] || null;
        }
        if (target) { return target; }
      }
      return document && document.querySelector ? document.querySelector(selectorForNavIndex(index)) : null;
    }

    function createCard(item, rowIndex, column, shape, showLibraryBadge) {
      var card = element('button', 'media-card ' + shape + (item.viewed ? ' is-viewed' : ''));
      var image = element('img', 'card-image');
      var caption = element('span', 'card-caption');
      var title = element('span', 'card-title');
      var meta = element('span', 'card-meta');
      card.type = 'button';
      image.alt = '';
      caption.appendChild(title);
      caption.appendChild(meta);
      card.appendChild(image);
      card.appendChild(caption);
      card.__ploffHomeParts = {
        image: image, caption: caption, title: title, meta: meta,
        detail: null, libraryBadge: null, progress: null, progressValue: null
      };
      updateHomeCard(card, item, rowIndex, column, shape, showLibraryBadge);
      return card;
    }

    function homeCardParts(card) {
      var parts = card && card.__ploffHomeParts;
      var progress;
      if (parts) { return parts; }
      parts = {
        image: card && card.getElementsByTagName ? card.getElementsByTagName('img')[0] : null,
        caption: card && card.querySelector ? card.querySelector('.card-caption') : null,
        title: card && card.querySelector ? card.querySelector('.card-title') : null,
        meta: card && card.querySelector ? card.querySelector('.card-meta') : null,
        detail: card && card.querySelector ? card.querySelector('.card-detail') : null,
        libraryBadge: card && card.querySelector ? card.querySelector('.home-library-badge') : null,
        progress: card && card.querySelector ? card.querySelector('.progress-track') : null,
        progressValue: null
      };
      progress = parts.progress;
      parts.progressValue = progress && progress.querySelector ? progress.querySelector('.progress-value') : null;
      if (card) { card.__ploffHomeParts = parts; }
      return parts;
    }

    function homeSectionParts(section) {
      var parts = section && section.__ploffHomeParts;
      if (parts) { return parts; }
      parts = {
        title: section && section.querySelector ? section.querySelector('.section-title') : null,
        row: section && section.querySelector ? section.querySelector('.media-row') : null
      };
      if (section) { section.__ploffHomeParts = parts; }
      return parts;
    }

    function updateHomeCard(card, item, rowIndex, column, shape, showLibraryBadge) {
      var libraryTitle = showLibraryBadge === true ? String(item.libraryTitle || '') : '';
      var title = mediaTitle(item);
      if (item.unavailable) { title = '\u2298 ' + title; }
      var meta = mediaCardMeta(item);
      var cardDetail = mediaCardDetail(item);
      var key = mediaKey(item);
      var ariaLabel = mediaDescription(item) + (libraryTitle ? ', ' + libraryTitle : '');
      if (item.unavailable) { ariaLabel += ', ' + translate('status.mediaUnavailable'); }
      var viewed = item.viewed === true;
      var hasProgress = typeof item.progress === 'number' && item.progress > 0 && item.progress < 100;
      var progressValue = hasProgress ? item.progress : null;
      var previous = card.__homePresentation;
      var parts = homeCardParts(card);
      var caption = parts.caption;
      var libraryBadge = parts.libraryBadge;
      var detail = parts.detail;
      var progress = parts.progress;
      var progressNode = parts.progressValue;
      if (previous && previous.rowIndex === rowIndex && previous.column === column && previous.shape === shape &&
          previous.key === key && previous.ariaLabel === ariaLabel && previous.title === title && previous.meta === meta &&
          previous.detail === cardDetail && previous.libraryTitle === libraryTitle && previous.viewed === viewed &&
          previous.progress === progressValue) {
        return false;
      }
      if (!previous || previous.shape !== shape || previous.viewed !== viewed) {
        card.className = 'media-card ' + shape + (viewed ? ' is-viewed' : '');
      }
      if (!previous || previous.rowIndex !== rowIndex) { card.setAttribute('data-row-index', rowIndex); }
      if (!previous || previous.column !== column) { card.setAttribute('data-column', column); }
      if (!previous || previous.key !== key) { card.setAttribute('data-media-key', key); }
      if (!previous || previous.ariaLabel !== ariaLabel) { card.setAttribute('aria-label', ariaLabel); }
      if (!previous || previous.title !== title) { updateText(parts.title, title); }
      if (!previous || previous.meta !== meta) { updateText(parts.meta, meta); }
      if (!previous || previous.detail !== cardDetail) {
        if (cardDetail) {
          if (!detail) { detail = element('span', 'card-detail'); caption.appendChild(detail); }
          updateText(detail, cardDetail);
        } else if (detail) { caption.removeChild(detail); detail = null; }
        parts.detail = detail;
      }
      if (!previous || previous.libraryTitle !== libraryTitle) {
        if (libraryTitle) {
          if (!libraryBadge) {
            libraryBadge = element('span', 'home-library-badge media-library-badge');
            card.appendChild(libraryBadge);
          }
          updateText(libraryBadge, libraryTitle);
        } else if (libraryBadge) { card.removeChild(libraryBadge); libraryBadge = null; }
        parts.libraryBadge = libraryBadge;
      }
      if (!previous || previous.progress !== progressValue) {
        if (hasProgress) {
          if (!progress) {
            progress = element('span', 'progress-track');
            progressNode = element('span', 'progress-value');
            progress.appendChild(progressNode);
            card.appendChild(progress);
          }
          if (!progressNode && progress.querySelector) { progressNode = progress.querySelector('.progress-value'); }
          if (progressNode) { progressNode.style.width = progressValue + '%'; }
        } else if (progress) {
          card.removeChild(progress);
          progress = null;
          progressNode = null;
        }
        parts.progress = progress;
        parts.progressValue = progressNode;
      }
      card.__homePresentation = {
        rowIndex: rowIndex, column: column, shape: shape, key: key, ariaLabel: ariaLabel, title: title, meta: meta,
        detail: cardDetail, libraryTitle: libraryTitle, viewed: viewed, progress: progressValue
      };
      return true;
    }

    function homeCardPlaybackStateCurrent(card, item) {
      var previous = card && card.__homePresentation;
      var viewed;
      var progress;
      if (!previous || !item || previous.key !== mediaKey(item)) { return false; }
      viewed = item.viewed === true;
      progress = typeof item.progress === 'number' && item.progress > 0 && item.progress < 100 ? item.progress : null;
      return previous.viewed === viewed && previous.progress === progress;
    }

    function placeChild(parent, child, index) {
      var current;
      if (!parent || !child) { return; }
      current = parent.children[index] || null;
      if (current === child) { return; }
      if (current && parent.insertBefore) { parent.insertBefore(child, current); }
      else { parent.appendChild(child); }
    }

    function homeArtworkPressureActive() { return call(presentation.homeArtworkPressureActive) === true; }

    function homeVisibleColumnCount(shape, layoutProfile, contentWidth) {
      var step = shape === 'wide'
        ? Math.max(1, Number(layoutProfile.wideMetrics && layoutProfile.wideMetrics.width) + Number(layoutProfile.posterGap || 0))
        : Math.max(1, Number(layoutProfile.metrics && layoutProfile.metrics.columnStep) || 1);
      return Math.max(1, Math.ceil(Math.max(1, Number(contentWidth) || step) / step));
    }

    function homePosterPriority(rowIndex, column, visibleColumns, pressureActive) {
      if (rowIndex < 2 && column < visibleColumns) { return 0; }
      if (!pressureActive) { return rowIndex < 2 ? 1 : 2; }
      if (rowIndex < 2 && column < visibleColumns + 2) { return 1; }
      if (rowIndex === 2 && column < visibleColumns + 2) { return 1; }
      return 2;
    }

    function queueHomePoster(image, item, rowIndex, shape, layoutProfile, priority, artworkSignature, posterLoader, posterJobs) {
      var poster = shape === 'wide' ? layoutProfile.widePoster : layoutProfile.poster;
      var previewOnly = priority !== 0;
      var source = String(item && item.image || '');
      var sourceContext = sourceContextForItem(item);
      var previous = image && image.__ploffHomePoster;
      var next = {
        source: source,
        width: Math.max(1, Number(poster && poster.width) || 1),
        height: Math.max(1, Number(poster && poster.height) || 1),
        previewWidth: Math.max(1, Number(poster && poster.previewWidth) || Number(poster && poster.width) || 1),
        previewHeight: Math.max(1, Number(poster && poster.previewHeight) || Number(poster && poster.height) || 1),
        previewOnly: previewOnly,
        priority: priority,
        artworkSignature: artworkSignature,
        sourceContext: sourceContext,
        sourceContextIdentity: sourceIdentityForItem(item, sourceContext)
      };
      var shouldQueue = !previous || previous.source !== next.source || previous.width !== next.width || previous.height !== next.height ||
        previous.previewWidth !== next.previewWidth || previous.previewHeight !== next.previewHeight ||
        previous.artworkSignature !== next.artworkSignature ||
        previous.sourceContextIdentity !== next.sourceContextIdentity ||
        previous.previewOnly === true && next.previewOnly === false ||
        posterLoader && posterLoader.needsLoad && posterLoader.needsLoad(image, next.previewOnly);
      var specification;
      if (image) { image.__ploffHomePoster = next; }
      if (!shouldQueue) {
        if (!previewOnly && previous && next.priority < previous.priority && posterLoader && posterLoader.prioritize) {
          posterLoader.prioritize(image, next.priority);
        }
        return;
      }
      specification = fixedPosterSpecification(source, poster, priority, 'home', sourceContext, item);
      if (previewOnly) { specification.previewOnly = true; }
      posterJobs.push({ target: image, specification: specification });
    }

    function fixedPosterSpecification(source, size, priority, scope, sourceContext, sourceItem) {
      var result = call(presentation.fixedPosterSpecification, source, size, priority, scope, sourceContext, sourceItem);
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

    function renderRows(onPreviewBatchSettled) {
      var content;
      var existingSections = [];
      var sectionsByKey = {};
      var usedSections = [];
      var rowIndex;
      var column;
      var rowData;
      var currentRowKey;
      var section;
      var row;
      var image;
      var posterJobs = [];
      var deferredPosterJobs = [];
      var posterLoader = services.posterLoader;
      var layoutProfile;
      var currentSettings;
      var artworkSignature;
      var contentWidth;
      var pressureActive;
      var rowVisibleColumns;
      var sectionTitle;
      var sectionRow;
      var mountedCards = {};
      if (!document || !document.getElementById) { return; }
      content = document.getElementById('content');
      if (!content) { return; }
      layoutProfile = cardProfile();
      currentSettings = settings();
      artworkSignature = String(currentSettings.artworkQuality === undefined ? '' : currentSettings.artworkQuality);
      contentWidth = content.clientWidth;
      pressureActive = homeArtworkPressureActive();

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
        var priority;
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
          mountedCards[rowIndex + ':' + index] = card;
          placeChild(row, card, index);
          image = homeCardParts(card).image;
          priority = homePosterPriority(rowIndex, index, rowVisibleColumns, pressureActive);
          queueHomePoster(image, rowData.items[index], rowIndex, rowData.shape, layoutProfile, priority, artworkSignature, posterLoader,
            onPreviewBatchSettled && pressureActive && priority > 1 ? deferredPosterJobs : posterJobs);
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
          sectionTitle = element('h2', 'section-title');
          sectionRow = element('div', 'media-row');
          section = element('section', 'media-section');
          section.appendChild(sectionTitle);
          section.appendChild(sectionRow);
          section.__ploffHomeParts = { title: sectionTitle, row: sectionRow };
        }
        if (section.getAttribute('data-home-row-key') !== currentRowKey) { section.setAttribute('data-home-row-key', currentRowKey); }
        if (section.__ploffHomeRowTitle !== rowData.title) {
          updateText(homeSectionParts(section).title, rowData.title);
          section.__ploffHomeRowTitle = rowData.title;
        }
        row = homeSectionParts(section).row;
        rowVisibleColumns = homeVisibleColumnCount(rowData.shape, layoutProfile, contentWidth);
        reconcileCards();
        placeChild(content, section, rowIndex);
        usedSections.push(section);
      }
      for (column = 0; column < existingSections.length; column += 1) {
        section = existingSections[column];
        if (usedSections.indexOf(section) === -1 && section.parentNode === content) { content.removeChild(section); }
      }
      homeCardTargets = mountedCards;
      if (posterLoader && posterLoader.loadBatch) {
        if (deferredPosterJobs.length) { posterLoader.loadBatch(deferredPosterJobs); }
        posterLoader.loadBatch(posterJobs, onPreviewBatchSettled);
      } else if (typeof onPreviewBatchSettled === 'function') { onPreviewBatchSettled(); }
    }

    function warmHomeArtworkPreviews(callback) {
      var posterLoader = services.posterLoader;
      var keys = Object.keys(homeCardTargets);
      var targets = [];
      var index;
      var card;
      var parts;
      var image;
      var pending;
      var completed = false;
      function settleOne() {
        pending = Math.max(0, pending - 1);
        if (!completed && pending === 0) {
          completed = true;
          call(callback);
        }
      }
      if (destroyed || !posterLoader || typeof posterLoader.prioritizePreview !== 'function') { call(callback); return false; }
      for (index = 0; index < keys.length; index += 1) {
        card = homeCardTargets[keys[index]];
        parts = card ? homeCardParts(card) : null;
        image = parts && parts.image;
        if (image && image.__ploffHomePoster && Number(image.__ploffHomePoster.priority) > 1) { targets.push(image); }
      }
      pending = targets.length;
      if (!pending) { completed = true; call(callback); return false; }
      for (index = 0; index < targets.length; index += 1) { posterLoader.prioritizePreview(targets[index], 1, settleOne); }
      return true;
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
      homeFocusTarget = null;
    }

    function clearHomePreview() {
      var preview = document && document.getElementById ? document.getElementById('home-preview') : null;
      var ids = ['home-preview-kicker', 'home-preview-title', 'home-preview-meta', 'home-preview-summary'];
      var previous;
      var index;
      if (!preview) { return false; }
      previous = preview.__ploffHomePreview || {};
      if (preview.className !== 'home-preview is-empty') { preview.className = 'home-preview is-empty'; }
      for (index = 0; index < ids.length; index += 1) {
        if (previous[ids[index]] !== '') { updateText(document.getElementById(ids[index]), ''); }
      }
      preview.__ploffHomePreview = {
        'home-preview-kicker': '', 'home-preview-title': '', 'home-preview-meta': '', 'home-preview-summary': ''
      };
      return true;
    }

    function renderHomePreview(item, rowIndex) {
      var preview = document && document.getElementById ? document.getElementById('home-preview') : null;
      var row = rows[rowIndex] || {};
      var meta;
      var detail;
      var next;
      var previous;
      if (!preview || !item) { return false; }
      meta = MediaLabels && MediaLabels.cardMeta ? MediaLabels.cardMeta(item, translate) : String(item.meta || '');
      detail = MediaLabels && MediaLabels.cardDetail ? MediaLabels.cardDetail(item, translate) : String(item.detail || '');
      next = {
        'home-preview-kicker': row.title || '',
        'home-preview-title': MediaLabels && MediaLabels.title ? MediaLabels.title(item, translate) : String(item.title || ''),
        'home-preview-meta': [meta, detail].filter(function (value) { return !!value; }).join('  ·  '),
        'home-preview-summary': item.summary || item.tagline || ''
      };
      previous = preview.__ploffHomePreview || {};
      Object.keys(next).forEach(function (id) {
        if (previous[id] !== next[id]) { updateText(document.getElementById(id), next[id]); }
      });
      preview.__ploffHomePreview = next;
      if (preview.className !== 'home-preview') { preview.className = 'home-preview'; }
      return true;
    }

    function keepFocusVisible(target) {
      var content;
      var section;
      var contentRect;
      var sectionRect;
      var firstRowIndex;
      var targetTop;
      var scrollDelta;
      if (focus.area !== 'media' || !target) { return; }
      content = document.getElementById('content');
      section = target.parentNode && target.parentNode.parentNode;
      if (!content || !section || !content.getBoundingClientRect || !section.getBoundingClientRect) { return; }
      if (focus.rowIndex === visibleRowIndex) { return; }
      visibleRowIndex = focus.rowIndex;
      firstRowIndex = firstPopulatedRowIndex();
      if (focus.rowIndex === firstRowIndex) {
        content.scrollTop = 0;
      }
      contentRect = content.getBoundingClientRect();
      sectionRect = section.getBoundingClientRect();
      if (focus.rowIndex === firstRowIndex) {
        homeRowTopInset = Math.max(0, sectionRect.top - contentRect.top);
        return;
      }
      targetTop = contentRect.top + Math.max(0, Number(homeRowTopInset || 0));
      scrollDelta = sectionRect.top - targetTop;
      if (Math.abs(scrollDelta) > 1) { content.scrollTop = Math.max(0, content.scrollTop + scrollDelta); }
    }

    function cancelHomeScrollFrame() {
      homeScrollGeneration += 1;
      if (homeScrollFrame !== null && viewRoot.cancelAnimationFrame) { viewRoot.cancelAnimationFrame(homeScrollFrame); }
      homeScrollFrame = null;
    }

    function cancelVisibleHomeArtwork() {
      homeArtworkVisibilityGeneration += 1;
      if (homeArtworkVisibilityFrame !== null && viewRoot.cancelAnimationFrame) {
        viewRoot.cancelAnimationFrame(homeArtworkVisibilityFrame);
      }
      homeArtworkVisibilityFrame = null;
    }

    function prioritizeVisibleHomeArtwork(lookahead, focusedRowOnly) {
      var content = document && document.getElementById ? document.getElementById('content') : null;
      var contentRect;
      var rowIndex;
      var section;
      var sectionRect;
      var nextSection = null;
      var row;
      var column;
      var card;
      var cardRect;
      var low;
      var high;
      var middle;

      function prioritizeSection(targetSection, requireVerticalVisibility) {
        row = homeSectionParts(targetSection).row;
        low = 0;
        high = row ? row.children.length : 0;
        while (low < high) {
          middle = Math.floor((low + high) / 2);
          if (row.children[middle].getBoundingClientRect().right <= contentRect.left) { low = middle + 1; }
          else { high = middle; }
        }
        for (column = low; row && column < row.children.length; column += 1) {
          card = row.children[column];
          if (!card || !card.getBoundingClientRect) { continue; }
          cardRect = card.getBoundingClientRect();
          if (cardRect.left >= contentRect.right) { break; }
          if ((requireVerticalVisibility && (cardRect.bottom <= contentRect.top || cardRect.top >= contentRect.bottom)) ||
              cardRect.right <= contentRect.left || cardRect.left >= contentRect.right) { continue; }
          call(presentation.prioritizePoster, card);
        }
      }

      if (!content || currentView() !== 'home' || !content.getBoundingClientRect) { return false; }
      contentRect = content.getBoundingClientRect();
      if (focusedRowOnly && homeFocusTarget && focus.area === 'media') {
        prioritizeSection(homeFocusTarget.parentNode.parentNode, true);
        return true;
      }
      for (rowIndex = 0; rowIndex < content.children.length; rowIndex += 1) {
        section = content.children[rowIndex];
        if (!section || !section.hasAttribute || !section.hasAttribute('data-home-row-key') || !section.getBoundingClientRect) { continue; }
        sectionRect = section.getBoundingClientRect();
        if (sectionRect.bottom <= contentRect.top) { continue; }
        if (sectionRect.top >= contentRect.bottom) {
          if (!nextSection) { nextSection = section; }
          break;
        }
        prioritizeSection(section, true);
      }
      // Warm exactly one row below the viewport. Only its horizontally relevant
      // cards are promoted, so navigation gets HD artwork without eagerly
      // upgrading the rest of Home.
      if (lookahead && nextSection) { prioritizeSection(nextSection, false); }
      return true;
    }

    function scheduleVisibleHomeArtwork(lookahead, focusedRowOnly) {
      var generation;
      if (!viewRoot.requestAnimationFrame || currentView() !== 'home') { return false; }
      cancelVisibleHomeArtwork();
      generation = homeArtworkVisibilityGeneration;
      homeArtworkVisibilityFrame = viewRoot.requestAnimationFrame(function () {
        homeArtworkVisibilityFrame = null;
        if (destroyed || generation !== homeArtworkVisibilityGeneration) { return; }
        prioritizeVisibleHomeArtwork(lookahead, focusedRowOnly);
      });
      return true;
    }

    function scheduleKeepFocusVisible(target) {
      var generation;
      if (focus.area !== 'media' || !target || focus.rowIndex === visibleRowIndex) { return false; }
      cancelHomeScrollFrame();
      generation = homeScrollGeneration;
      if (!viewRoot.requestAnimationFrame) { keepFocusVisible(target); return true; }
      homeScrollFrame = viewRoot.requestAnimationFrame(function () {
        var currentTarget;
        homeScrollFrame = null;
        if (destroyed || generation !== homeScrollGeneration || currentView() !== 'home' || focus.area !== 'media') { return; }
        currentTarget = homeCardTargets[focus.rowIndex + ':' + focus.column] || target;
        keepFocusVisible(currentTarget);
        prioritizeVisibleHomeArtwork();
      });
      return true;
    }

    function cancelHomeArtworkWarm() {
      homeArtworkWarmGeneration += 1;
      if (homeArtworkWarmTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(homeArtworkWarmTimer); }
      homeArtworkWarmTimer = null;
    }

    function warmHomeArtworkNearFocus() {
      var generation;
      if (currentView() !== 'home' || focus.area !== 'media') { cancelHomeArtworkWarm(); return; }
      cancelHomeArtworkWarm();
      generation = homeArtworkWarmGeneration;
      if (!timerRoot.setTimeout) { return; }
      homeArtworkWarmTimer = timerRoot.setTimeout(function () {
        homeArtworkWarmTimer = null;
        if (destroyed || generation !== homeArtworkWarmGeneration || currentView() !== 'home' || focus.area !== 'media') { return; }
        prioritizeVisibleHomeArtwork(true);
      }, 160);
    }

    function scheduleHomePresentation(target, includeTheme) {
      var generation = homePresentationGeneration + 1;
      var item = target && target.item;
      homePresentationGeneration = generation;
      if (homePresentationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(homePresentationTimer); }
      homePresentationTimer = null;
      if (!item) { stopTheme(); return; }
      if (!timerRoot.setTimeout) {
        renderHomePreview(item, target.rowIndex);
        if (includeTheme) { scheduleTheme(item); }
        else { stopTheme(); }
        return;
      }
      if (!includeTheme) { stopTheme(); }
      homePresentationTimer = timerRoot.setTimeout(function () {
        var currentTarget = findHomePresentationTarget();
        homePresentationTimer = null;
        if (destroyed || generation !== homePresentationGeneration || currentView() !== 'home' || !currentTarget || currentTarget.key !== target.key) { return; }
        renderHomePreview(item, target.rowIndex);
        if (includeTheme && focus.area === 'media' && homeSelectionKey() === target.key) { scheduleTheme(item); }
      }, 80);
    }

    function updateFocus(deferPresentation) {
      var next;
      var item;
      var rowData;
      var presentationTarget;
      if (homeFocusTarget) {
        homeFocusTarget.className = String(homeFocusTarget.className || '').replace(/\s*is-focused/g, '');
        homeFocusTarget = null;
      } else { clearLogicalFocus(); }
      if (focus.area !== 'media') { visibleRowIndex = -1; }
      if (focus.area !== 'media') { cancelHomeScrollFrame(); cancelHomeArtworkWarm(); }
      if (!document) { return; }
      if (focus.area === 'media') { next = homeCardTargets[focus.rowIndex + ':' + focus.column] || null; }
      else if (focus.area === 'nav') { next = navigationTarget(focus.navIndex); }
      else if (document.querySelector) { next = document.querySelector(selectorForState()); }
      if (next) {
        if (focus.area === 'media') {
          rowData = rows[focus.rowIndex];
          item = rowData && rowData.items ? rowData.items[focus.column] : null;
          if (item && !homeCardPlaybackStateCurrent(next, item)) { updateHomeCard(next, item, focus.rowIndex, focus.column, rowData.shape, rowData.showLibraryBadge); }
        }
        next.className += ' is-focused';
        homeFocusTarget = next;
        if (focus.area === 'media') {
          call(presentation.prioritizePoster, next);
          warmHomeArtworkNearFocus();
        }
        if (!pointerSelectionActive()) {
          if (next.focus) { next.focus(); }
          if (!scheduleKeepFocusVisible(next)) { scheduleVisibleHomeArtwork(false, deferPresentation === true); }
        }
      }
      if (currentView() === 'home' && focus.area === 'media' && rows[focus.rowIndex] && rows[focus.rowIndex].items[focus.column]) {
        lastSelectionKey = homeSelectionKey();
      }
      presentationTarget = currentView() === 'home' ? findHomePresentationTarget() : null;
      scheduleBackdrop(presentationTarget && presentationTarget.item);
      item = presentationTarget && presentationTarget.item;
      if (deferPresentation === true) { scheduleHomePresentation(presentationTarget, focus.area === 'media'); }
      else if (item) {
        renderHomePreview(item, presentationTarget.rowIndex);
        if (focus.area === 'media') { scheduleTheme(item); }
        else { stopTheme(); }
      } else { scheduleHomePresentation(null, false); }
    }

    function firstPopulatedRowIndex() {
      var rowIndex;
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].items && rows[rowIndex].items.length) { return rowIndex; }
      }
      return -1;
    }

    function focusHomeStart() {
      var rowIndex = firstPopulatedRowIndex();
      if (rowIndex !== -1) {
        setFocus({ area: 'media', navIndex: 0, rowIndex: rowIndex, column: 0 });
        if (document && document.getElementById('content')) { document.getElementById('content').scrollTop = 0; }
        updateFocus();
        return true;
      }
      setFocus({ area: 'nav', navIndex: 0, rowIndex: 0, column: 0 });
      if (document && document.getElementById('content')) { document.getElementById('content').scrollTop = 0; }
      updateFocus();
      return true;
    }

    function resetHomeScroll() {
      var content = document && document.getElementById ? document.getElementById('content') : null;
      if (content) { content.scrollTop = 0; }
      return !!content;
    }

    function isHomeStart() {
      var rowIndex;
      var content;
      if (currentView() !== 'home') { return false; }
      rowIndex = firstPopulatedRowIndex();
      if (rowIndex === -1) { return focus.area === 'nav' && focus.navIndex === 0; }
      if (focus.area !== 'media' || focus.column !== 0) { return false; }
      if (focus.rowIndex !== rowIndex) { return false; }
      content = document && document.getElementById ? document.getElementById('content') : null;
      return !content || Number(content.scrollTop || 0) <= 1;
    }

    function useHomeRows(nextRows, navIndex, options) {
      var baseState;
      var normalized;
      var selected;
      options = options || {};
      normalized = options.normalized === true ? array(nextRows) : HomeState.normalizeRows(nextRows);
      if (!normalized.length) {
        setRows([], true);
        lastSelectionKey = '';
        homePresentationKey = '';
        visibleRowIndex = -1;
        homeDirty = false;
        setFocus({ area: 'nav', navIndex: navIndex || 0, rowIndex: 0, column: 0 });
        resetHomeScroll();
        renderRows(homeReadyNotified ? null : currentHomeArtworkPreviewSettler());
        clearHomePreview();
        updateFocus();
        completeStartup();
        publishHomeReady();
        call(actions.onHomeEmpty);
        call(actions.scheduleAdjacentLibraryPrefetch, false);
        return false;
      }
      setRows(normalized, true);
      call(actions.hideViewState);
      if (!homeArtworkStartupDeferred) {
        homeArtworkStartupDeferred = true;
        call(presentation.deferHomeArtworkLoads);
      }
      renderRows(homeReadyNotified ? null : currentHomeArtworkPreviewSettler());
      baseState = options.focus === 'nav'
        ? { area: 'nav', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
        : (options.focus === 'first'
          ? { area: 'media', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
          : { area: 'media', navIndex: navIndex || 0, rowIndex: focus.rowIndex || 0, column: focus.column || 0 });
      selected = options.focus === 'preserve' ? (options.selectionKey || lastSelectionKey) : '';
      setFocus(HomeState.restoreFocus(rows, baseState, selected));
      homeDirty = false;
      if (options.focus === 'nav' || options.focus === 'first' || (selected && HomeState.selectionKey(rows, focus) !== selected)) {
        resetHomeScroll();
      }
      updateFocus();
      completeStartup();
      publishHomeReady();
      call(actions.scheduleAdjacentLibraryPrefetch, false);
      return true;
    }

    function artworkUrl(item) {
      var source = item && (item.art || item.image) || '';
      return source.replace('/400/600', '/1280/720').replace('/640/360', '/1280/720');
    }

    function sampleBackdropSource(sourceRows) {
      var candidates = [];
      var availableRows = array(sourceRows === undefined ? rows : sourceRows);
      var rowIndex;
      var itemIndex;
      var item;
      if (sourceRows === undefined && activeBackdropSource) { return activeBackdropSource; }
      for (rowIndex = 0; rowIndex < availableRows.length; rowIndex += 1) {
        for (itemIndex = 0; itemIndex < array(availableRows[rowIndex] && availableRows[rowIndex].items).length; itemIndex += 1) {
          item = availableRows[rowIndex].items[itemIndex];
          if (item && item.art) { candidates.push(artworkUrl(item)); }
        }
      }
      if (!candidates.length) { return ''; }
      return candidates[Math.abs(Number(now()) || 0) % candidates.length];
    }

    function isBackdropCurrent(generation) { return !destroyed && generation === backdropGeneration; }
    function beginBackdrop() { return backdropGeneration += 1; }
    function isThemeCurrent(generation) { return !destroyed && generation === themeGeneration; }
    function beginTheme() { return themeGeneration += 1; }

    function cancelThemeWork() {
      if (themeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(themeTimer); }
      themeTimer = null;
      if (themeRequest && themeRequest.abort) { themeRequest.abort(); }
      themeRequest = null;
    }

    function stopTheme() {
      beginTheme();
      cancelThemeWork();
      call(services.stopTheme);
    }

    function clearBackdropPresentation() {
      var first;
      var second;
      var posterLoader = services.posterLoader;
      beginBackdrop();
      cancelBackdropPrefetch();
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
      activeBackdropContextIdentity = '';
    }

    function activateBackdrop(nextIndex, source, request, sourceContext, sourceIdentity) {
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
      activeBackdropContextIdentity = String(sourceIdentity || sourceContextIdentity(sourceContext));
    }

    function loadBackdropItem(item, request) {
      var nextIndex;
      var next;
      var source = artworkUrl(item);
      var sourceContext = sourceContextForItem(item);
      var contextIdentity = sourceIdentityForItem(item, sourceContext);
      var owner = sourceOwnerMachineIdentifier(item);
      var posterLoader = services.posterLoader;
      if (!source) {
        if (isBackdropCurrent(request)) { clearBackdropPresentation(); }
        return;
      }
      if (backdropKey(source, item, sourceContext) === activeBackdropKey() || !document) { return; }
      nextIndex = activeBackdrop === 0 ? 1 : 0;
      next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
      if (!next) { return; }
      if (next.__plexProgressiveSource === source && next.__ploffBackdropContextIdentity === contextIdentity &&
          (next.__plexProgressiveState === 'preview' || next.__plexProgressiveState === 'full')) {
        activateBackdrop(nextIndex, source, request, sourceContext, contextIdentity);
        return;
      }
      if (posterLoader && posterLoader.cancelScope) { posterLoader.cancelScope('backdrop'); }
      next.className = next.className.replace(/\s*is-active/g, '');
      next.__ploffBackdropContextIdentity = contextIdentity;
      if (posterLoader && posterLoader.load) {
        posterLoader.load(next, {
          source: source,
          previewWidth: 320,
          previewHeight: 180,
          width: 1920,
          height: 1080,
          priority: 0,
          scope: 'backdrop',
          sourceContext: sourceContext,
          sourceOwnerMachineIdentifier: owner,
          sourceIdentity: contextIdentity,
          onPreview: function () { activateBackdrop(nextIndex, source, request, sourceContext, contextIdentity); }
        });
      }
    }

    function loadBackdrop(request, item) {
      if (!item) { return; }
      loadBackdropItem(item, request);
    }

    function cancelInactiveBackdropLoad() {
      var target;
      var posterLoader = services.posterLoader;
      if (!document || !document.getElementById || !posterLoader || !posterLoader.cancel) { return; }
      target = document.getElementById(activeBackdrop === 0 ? 'backdrop-b' : 'backdrop-a');
      if (target) { posterLoader.cancel(target); }
    }

    function cancelBackdropPrefetch() {
      var posterLoader = services.posterLoader;
      backdropPrefetchGeneration += 1;
      if (backdropPrefetchTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropPrefetchTimer); }
      backdropPrefetchTimer = null;
      if (posterLoader && posterLoader.cancelPrefetch) { posterLoader.cancelPrefetch(); }
    }

    function scheduleBackdropPrefetch(items, expectedView) {
      var sources = [];
      var seen = {};
      var generation;
      var posterLoader = services.posterLoader;
      var index;
      var source;
      var sourceContext;
      var sourceIdentity;
      var owner;
      var key;
      cancelBackdropPrefetch();
      if (!posterLoader || !posterLoader.prefetch || !timerRoot.setTimeout) { return false; }
      generation = backdropPrefetchGeneration;
      backdropPrefetchTimer = timerRoot.setTimeout(function () {
        var sourceIndex = 0;
        backdropPrefetchTimer = null;
        if (destroyed || generation !== backdropPrefetchGeneration || (expectedView && currentView() !== expectedView)) { return; }
        items = array(typeof items === 'function' ? items() : items);
        for (index = 0; index < items.length && sources.length < 4; index += 1) {
          source = artworkUrl(items[index]);
          sourceContext = sourceContextForItem(items[index]);
          sourceIdentity = sourceIdentityForItem(items[index], sourceContext);
          owner = sourceOwnerMachineIdentifier(items[index]);
          key = String(source || '') + '|' + sourceIdentity;
          if (!source || key === activeBackdropKey() || seen[key]) { continue; }
          seen[key] = true;
          sources.push({ source: source, sourceContext: sourceContext, sourceIdentity: sourceIdentity, sourceOwnerMachineIdentifier: owner });
        }
        function next() {
          var started;
          var advanced = false;
          function advance() {
            if (advanced) { return; }
            advanced = true;
            sourceIndex += 1;
            next();
          }
          if (destroyed || generation !== backdropPrefetchGeneration || (expectedView && currentView() !== expectedView)) { return; }
          if (sourceIndex >= sources.length) { return; }
          started = posterLoader.prefetch({ source: sources[sourceIndex].source, sourceContext: sources[sourceIndex].sourceContext, sourceIdentity: sources[sourceIndex].sourceIdentity, sourceOwnerMachineIdentifier: sources[sourceIndex].sourceOwnerMachineIdentifier, width: 1920, height: 1080, scope: 'backdrop' }, advance);
          if (started === false) { advance(); }
        }
        next();
      }, 400);
      return true;
    }

    function homeAdjacentBackdropItems(direction) {
      var result = [];
      var seen = {};
      var rowIndex = focus.rowIndex;
      var column = focus.column;
      var offsets;
      var index;
      function add(targetRow, targetColumn, vertical) {
        var row = rows[targetRow];
        var item;
        var key;
        if (!row || !row.items || !row.items.length) { return; }
        if (vertical) { targetColumn = Math.max(0, Math.min(targetColumn, row.items.length - 1)); }
        if (targetColumn < 0 || targetColumn >= row.items.length) { return; }
        item = row.items[targetColumn];
        if (!item) { return; }
        key = mediaKey(item) || artworkUrl(item);
        if (!key || seen[key]) { return; }
        seen[key] = true;
        result.push(item);
      }
      if (focus.area !== 'media') { return result; }
      if (direction === 'left') { offsets = [[0, -1, false], [0, 1, false], [1, 0, true], [-1, 0, true]]; }
      else if (direction === 'down') { offsets = [[1, 0, true], [-1, 0, true], [0, 1, false], [0, -1, false]]; }
      else if (direction === 'up') { offsets = [[-1, 0, true], [1, 0, true], [0, 1, false], [0, -1, false]]; }
      else { offsets = [[0, 1, false], [0, -1, false], [1, 0, true], [-1, 0, true]]; }
      for (index = 0; index < offsets.length; index += 1) {
        add(rowIndex + offsets[index][0], column + offsets[index][1], offsets[index][2]);
      }
      return result;
    }

    function scheduleBackdrop(item) {
      cancelBackdropPrefetch();
      var request = beginBackdrop();
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      cancelInactiveBackdropLoad();
      if (!timerRoot.setTimeout) { loadBackdrop(request, item); return; }
      backdropTimer = timerRoot.setTimeout(function () {
        backdropTimer = null;
        loadBackdrop(request, item);
      }, 250);
    }

    function scheduleViewBackdrop(item, expectedView, delay) {
      cancelBackdropPrefetch();
      var request = beginBackdrop();
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      cancelInactiveBackdropLoad();
      if (!timerRoot.setTimeout) {
        if (currentView() === expectedView && isBackdropCurrent(request)) { loadBackdropItem(item, request); }
        return;
      }
      backdropTimer = timerRoot.setTimeout(function () {
        backdropTimer = null;
        if (currentView() === expectedView && isBackdropCurrent(request)) { loadBackdropItem(item, request); }
      }, delay);
    }

    function scheduleTheme(item, sourceContext) {
      var current = settings();
      var cached;
      var cacheKey;
      var token = beginTheme();
      sourceContext = sourceContext || sourceContextForItem(item);
      if (themeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(themeTimer); }
      themeTimer = null;
      if (themeRequest && themeRequest.abort) { themeRequest.abort(); }
      themeRequest = null;
      if (!current.backgroundMusic || !item) { call(services.stopTheme); return; }
      cacheKey = String(call(access.themeIdentity, item, sourceContext) || '') + '|' + String(item.themeLookupKey || item.themeKey || item.ratingKey || '');
      cached = cacheKey ? themeCache[cacheKey] : null;
      if (item.themeUrl || cached) {
        call(services.playTheme, item.themeUrl ? item : cached, { delay: current.backgroundDelay, volume: current.backgroundVolume });
        return;
      }
      call(services.stopTheme);
      if (!item.ratingKey || typeof services.loadThemeMetadata !== 'function') { return; }
      themeTimer = timerRoot.setTimeout(function () {
        var completed = false;
        var request;
        themeTimer = null;
        request = services.loadThemeMetadata(item, function (error, detail) {
          var oldKey;
          completed = true;
          if (themeRequest === request) { themeRequest = null; }
          if (error || !isThemeCurrent(token) || !detail || !detail.themeUrl) { return; }
          themeCache[cacheKey] = detail;
          themeKeys.push(cacheKey);
          while (themeKeys.length > 20) { oldKey = themeKeys.shift(); delete themeCache[oldKey]; }
          call(services.playTheme, detail, { delay: 1, volume: settings().backgroundVolume });
        }, sourceContext);
        themeRequest = completed ? null : (request || null);
      }, current.backgroundDelay);
    }

    function handleHomeKey(event, direction) {
      var layout;
      var item;
      var nextFocus;
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
        call(actions.onHomeInteraction);
        layout = { navCount: navigationFocusCount(), rowLengths: homeRowLengths };
        nextFocus = FocusModel.move(focus, direction, layout);
        if (nextFocus.area === focus.area && nextFocus.navIndex === focus.navIndex &&
            nextFocus.rowIndex === focus.rowIndex && nextFocus.column === focus.column) { return true; }
        cancelVisibleHomeArtwork();
        setFocus(nextFocus);
        updateFocus(true);
        if (currentView() === 'home' && focus.area === 'media') { scheduleBackdropPrefetch(function () { return homeAdjacentBackdropItems(direction); }, 'home'); }
        else { cancelBackdropPrefetch(); }
        if (focus.area === 'nav' && (direction === 'left' || direction === 'right')) {
          call(actions.scheduleAdjacentLibraryPrefetch, true);
          call(actions.scheduleNavigationPreview, focus.navIndex);
        }
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

    function publishInitialHomeArtworkPreviewReady() {
      if (homeArtworkPreviewReadyNotified || !homeReadyNotified || !homeArtworkPreviewSettled) { return false; }
      homeArtworkPreviewReadyNotified = true;
      call(actions.onHomeArtworkPreviewReady);
      return true;
    }

    function markInitialHomeArtworkPreviewSettled() {
      if (homeArtworkPreviewSettled) { return false; }
      homeArtworkPreviewSettled = true;
      publishInitialHomeArtworkPreviewReady();
      return true;
    }

    function currentHomeArtworkPreviewSettler() {
      var generation = homeGeneration;
      return function () {
        if (generation !== homeGeneration) { return false; }
        return markInitialHomeArtworkPreviewSettled();
      };
    }

    function publishHomeReady() {
      if (homeReadyNotified) { return false; }
      homeReadyNotified = true;
      call(actions.onHomeReady);
      publishInitialHomeArtworkPreviewReady();
      return true;
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
        homePresentationKey: homePresentationKey,
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
      cancelBackdropPrefetch();
      themeGeneration += 1;
      if (homePoller) { homePoller.stop(); }
      if (homeRefreshCoordinator) { homeRefreshCoordinator.reset(); }
      if (startupTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(startupTimer); }
      if (backdropTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(backdropTimer); }
      if (themeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(themeTimer); }
      if (themeRequest && themeRequest.abort) { themeRequest.abort(); }
      if (homePresentationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(homePresentationTimer); }
      cancelHomeScrollFrame();
      cancelVisibleHomeArtwork();
      cancelHomeArtworkWarm();
      if (messageTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(messageTimer); }
      startupTimer = null;
      backdropTimer = null;
      backdropPrefetchTimer = null;
      themeTimer = null;
      themeRequest = null;
      homePresentationTimer = null;
      homeScrollFrame = null;
      homeArtworkVisibilityFrame = null;
      homeArtworkWarmTimer = null;
      messageTimer = null;
    }

    setNavigationItems(values.navigationItems || []);
    setRows(values.rows || []);
    initializeHomeLifecycle();

    return {
      activeBackdropSource: function () { return activeBackdropSource; },
      applyCardScale: applyCardScale,
      applyNavigationVisibility: applyNavigationVisibility,
      cardMetrics: cardMetrics,
      cancelBackdropPrefetch: cancelBackdropPrefetch,
      cardProfile: cardProfile,
      clearBackdrop: clearBackdropPresentation,
      clearHome: clearHome,
      clearHomePreview: clearHomePreview,
      clearLogicalFocus: clearLogicalFocus,
      completeStartup: completeStartup,
      destroy: destroy,
      focusHomeStart: focusHomeStart,
      focusState: focusState,
      handleHomeKey: handleHomeKey,
      isActivityNavIndex: isActivityNavIndex,
      isHomeDirty: isHomeDirty,
      isHomeLoading: function () { return homeLoading; },
      isProfileNavIndex: isProfileNavIndex,
      keepFocusVisible: keepFocusVisible,
      loadHome: loadHome,
      markHomeDirty: function () { return setHomeDirty(true); },
      navigationFocusCount: navigationFocusCount,
      navigationItems: function () { return navigationItems; },
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
      resetHome: function () {
        homeGeneration += 1;
        homeReadyNotified = false;
        homeArtworkPreviewSettled = false;
        homeArtworkPreviewReadyNotified = false;
        homeArtworkStartupDeferred = false;
        if (homeRefreshCoordinator) { homeRefreshCoordinator.reset(); }
        setHomeLoading(false);
      },
      resetHomeScroll: resetHomeScroll,
      rows: function () { return rows; },
      sampleBackdropSource: sampleBackdropSource,
      scheduleBackdrop: scheduleBackdrop,
      scheduleBackdropPrefetch: scheduleBackdropPrefetch,
      scheduleDetailBackdrop: function (item) { scheduleViewBackdrop(item, 'detail', 0); },
      scheduleHomePolling: function () { if (homePoller) { homePoller.schedule(); } },
      scheduleSearchBackdrop: function (item) { scheduleViewBackdrop(item, 'search', 250); },
      scheduleTheme: scheduleTheme,
      stopTheme: stopTheme,
      selectionKey: selectionKey,
      selectorForNavIndex: selectorForNavIndex,
      setFocus: setFocus,
      setNavigationItems: setNavigationItems,
      setRows: setRows,
      showMessage: showMessage,
      snapshot: snapshot,
      stopHomePolling: function () { if (homePoller) { homePoller.stop(); } },
      updateClock: updateClock,
      updateFocus: updateFocus,
      warmHomeArtworkPreviews: warmHomeArtworkPreviews,
      useHomeRows: useHomeRows
    };
  }

  return { create: create };
}));
