interface PloffAbortableRequest {
  abort(): void;
}

interface PloffMediaItem {
  ratingKey?: string;
  key?: string;
  guid?: string;
  type?: string;
  title?: string;
  subtitle?: string;
  summary?: string;
  image?: string;
  art?: string;
  duration?: number;
  viewOffset?: number;
  viewed?: boolean;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  parentIndex?: number;
  index?: number;
  containerKey?: string;
  containerType?: string;
}

interface PloffProfileRecord {
  id?: string;
  uuid?: string;
  title?: string;
  thumb?: string;
  protected?: boolean;
  pin?: boolean;
}

interface PloffSettingsRecord {
  version: number;
  uiLanguage: string;
  uiLanguageExplicit: boolean;
  backgroundMusic: boolean;
  backgroundVolume: number;
  backgroundDelay: number;
  autoplayDelay: number;
  upNextLayout: string;
  skipPromptDuration: number;
  audioLanguages: string[];
  subtitleLanguages: string[];
  subtitleSuppressedForAudio: string[];
  subtitleMode: string;
  subtitleModeExplicit: boolean;
  subtitleSourcePreference: string;
  lanVideoQuality: string;
  remoteVideoQuality: string;
  playbackMode: string;
  videoVersionPriorities: string[];
  adaptivePlaybackMemory: boolean;
  wheelBehavior: string;
  cardScale: number;
  artworkQuality: number;
  backdropQuality: number;
  accentColor: string;
  visualTheme: string;
  interfaceAnimations: boolean;
  searchT9Input: boolean;
  showWatchlist: boolean;
  showPlaylists: boolean;
  settingsBackupMode: 'off' | 'on';
  highContrast: boolean;
  strongFocus: boolean;
  subtitleBackground: string;
  subtitleEdge: string;
  subtitlePosition: number;
  safeAreaTop: number;
  safeAreaRight: number;
  safeAreaBottom: number;
  safeAreaLeft: number;
}

interface PloffPlaybackOptions {
  audioStreamID?: string | number;
  subtitleStreamID?: string | number;
  subtitleSize?: number;
  offset?: number;
  videoQuality?: string;
  playbackMode?: string;
  mediaIndex?: number;
  partIndex?: number;
  delivery?: string;
  localSubtitleOverlay?: boolean;
  videoResolution?: string;
}

interface PloffPlaybackSession {
  ratingKey?: string;
  key?: string;
  title?: string;
  duration?: number;
  resumePosition?: number;
  offsetBase?: number;
  options?: PloffPlaybackOptions;
  markers?: object[];
  chapters?: object[];
  audioTracks?: object[];
  subtitleTracks?: object[];
  mediaVersions?: object[];
  mediaProfile?: object | null;
}

interface PloffFeatureSnapshot {
  destroyed: boolean;
  generation?: number;
}

interface PloffApplicationSessionSnapshot {
  view: string;
  returnView: string;
  settings: Partial<PloffSettingsRecord>;
  config: object;
  activeServer: object | null;
  activeProfile: PloffProfileRecord | null;
  selectedItem: PloffMediaItem | null;
  playbackIdentity: object | null;
}

interface PloffDetailFeatureSnapshot extends PloffFeatureSnapshot {
  selectedItem: PloffMediaItem | null;
  currentDetail: PloffMediaItem | null;
  seasonIndex: number;
  episodeIndex: number;
  seriesContext: {
    seasons?: PloffMediaItem[];
    episodes?: PloffMediaItem[];
  } | null;
}

interface PloffLibraryFeatureSnapshot extends PloffFeatureSnapshot {
  mode: string;
  library: object;
  grid: object;
  lifecycle: object;
  watchlist: object;
}

interface PloffPlaybackPublicSnapshot {
  active: boolean;
  playback: PloffPlaybackSession | null;
  subtitleEditor: object;
  localSubtitle?: object | null;
  destroyed?: boolean;
}

interface PloffPlaybackQueueSnapshot {
  playlistQueue: object | null;
  seriesQueue: object | null;
  drawer: object;
  upNext: object;
  directPlayOrigin: object | null;
  directPlayPending: boolean;
  containerOrigin: object | null;
  sequence: {
    kind: string;
    identity: string;
    previousState: string;
    nextState: string;
    provider: object | null;
  };
  destroyed: boolean;
}
