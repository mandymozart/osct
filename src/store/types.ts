import { Scene } from "aframe";
import { LoadableStore } from "./LoadableStore";
import { Page } from "../pages/base-page";

/**
 * Common interface for resources that can be loaded
 */
export interface LoadableResource {
  isLoading: boolean;
  loaded: boolean;
  error: ErrorInfo | null;
  src: string;
  type?: string;
}

/**
 * Error information structure
 */
export interface ErrorInfo {
  code: string;
  msg: string;
}

/**
 * Error code constants
 */
export enum ErrorCode {
  // Chapter errors
  IMAGE_TARGET_NOT_FOUND = "missing-image-target",
  CHAPTER_NOT_FOUND = "chapter-not-found",

  // Entity errors
  ENTITY_LOAD_FAILED = "entity-load-failed",
  SOME_ASSETS_NOT_FOUND = "some-assets-not-found",

  // Asset errors
  ASSET_LOAD_FAILED = "asset-load-failed",
  ASSET_NOT_FOUND = "asset-not-found",

  // Generic errors
  UNKNOWN_ERROR = "unknown-error",
  NETWORK_ERROR = "network-error",
  TIMEOUT = "timeout",
}

export interface GameConfiguration {
  version: string | null; // Semantic version like "1.0.0"
  chapters: readonly ChapterData[];
  router: RouterConfig | null;
}

export interface ConfigurationVersion {
  version: string | null;
  timestamp: number;
}

/**
 * Base data structure for a chapter without loading state
 */
export interface ChapterData {
  id: string;
  order: number;
  firstPage: number;
  lastPage: number;  
  title: string;
  imageTargetSrc: string;
  targets: TargetData[];
}

/**
 * Base data structure for a target without loading state
 */
export interface TargetData {
  mindarTargetIndex: number;
  bookId: string;
  title: string;
  description: string;
  entity: EntityData;
}

/**
 * Base data structure for an entity without loading state
 */
export interface EntityData {
  assets: AssetData[];
}

/**
 * Base data structure for an asset without loading state
 */
export interface AssetData {
  id?: string;
  src: string;
  type?: string;
}

/**
 * Represents a chapter in the game with loading state
 */
export interface Chapter extends ChapterData, LoadableResource {
  targets: Target[];
}

/**
 * Represents a tracking target in AR with loading state
 */
export interface Target extends TargetData, LoadableResource {
  entity: Entity;
}

/**
 * Represents an entity with assets with loading state
 */
export interface Entity extends EntityData, LoadableResource {
  assets: Asset[];
}

/**
 * Represents an asset that can be loaded with loading state
 */
export interface Asset extends AssetData, LoadableResource {}

/**
 * Game state interface
 */
export interface GameState {
  scene: Scene | null;
  mode: GameMode;
  currentRoute: Route | null;
  trackedTargets: number[];
  currentChapter: Chapter | null;
  cachedChapters: Record<string, Chapter>;
}

/**
 * Track the history of seen targets
 */
export interface TargetHistoryEntry {
  chapterId: string;
  targetIndex: number;
  timestamp: number;
}

export interface GameStore extends LoadableStore {
  configuration: Readonly<GameConfiguration>;

  // Configuration and initialization
  initialize(configuration: GameConfiguration): void;
  getChaptersData(): ReadonlyArray<ChapterData>;

  // Scene management
  attachScene(sceneSelector: Scene | string): Promise<void>;
  getScene(): Scene | null;
  isSceneReady(): boolean;
  enterVR(): Promise<void>;
  exitVR(): Promise<void>;

  // Target tracking
  addTarget(targetIndex: number): void;
  removeTarget(targetIndex: number): void;
  getTrackedTargets(): number[];
  getTrackedTargetObjects(): Target[];

  // Chapter management
  switchChapter(chapterId: string): void;
  getCachedChapter(chapterId: string): Chapter | null;

  // History tracking
  markTargetAsSeen(chapterId: string, targetIndex: number): void;
  hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean;
  getSeenTargetsForChapter(chapterId: string): number[];
  getChapterCompletionPercentage(chapterId: string): number;
  isChapterComplete(chapterId: string): boolean;
  resetChapterHistory(chapterId: string): void;
  resetAllHistory(): void;

  // QR Manager
  startQRScanning(): void;
  stopQRScanning(): void;

  // Page Router 
  currentRoute: Route;
  navigate(to: Pages | string, params?: RouteParam[]): void;
  showError(error: ErrorInfo): void;
  closePage(): void;
}

export enum GameMode {
  VR = "vr",
  QR = "qr",
  DEFAULT = "default",
}

export interface PageRouter {
  navigate(): void;
  close(): void;
}

export interface RouterConfig {
  baseUrl: string;
  routes: Route[];
}

export type PageRoute = {
  page: Pages;
  params?: RouteParam[];
}

export type SlugRoute = {
  slug: string;
  params?: RouteParam[];
}

export type Route = PageRoute | SlugRoute;

export type RouteParam = {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
}

export enum Pages {
  HOME = "home",
  TUTORIAL = "tutorial",
  CHAPTERS = "chapters",
  CHAPTER = "chapter",
  ABOUT = "about",
  ERROR = "error",
  NOT_FOUND = "not-found",
}

export interface TutorialStep {
  next?: string;
  previous?: string;
  skip?: string;
  complete?: boolean;
  touched?: boolean;
}