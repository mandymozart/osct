import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameStoreService } from "./GameStoreService";
import * as storeModule from "@/store";
import { GameConfiguration, IGame, ChapterData } from "@/types";

describe("GameStoreService", () => {
  // Mock game and configuration
  let mockGame: IGame;
  let mockConfig: GameConfiguration;
  
  beforeEach(() => {
    // Reset module mocks before each test
    vi.resetModules();
    vi.clearAllMocks();
    
    // Create a mock game instance with required methods
    mockGame = {
      initialize: vi.fn(),
      notifyError: vi.fn(),
      onError: vi.fn(),
      set: vi.fn(),
      state: {
        currentChapter: null,
        mode: "default",
        currentRoute: null,
        loading: { state: "idle", message: "" }
      },
      configuration: {
        version: "1.0.0",
        chapters: [],
        router: null,
        tutorial: []
      },
      // Mock the manager properties
      chapters: { load: vi.fn() },
      scene: { load: vi.fn() },
      targets: { load: vi.fn() },
      router: { navigate: vi.fn() },
      qr: { scan: vi.fn() },
      history: { record: vi.fn() },
      tutorial: { load: vi.fn() }
    } as unknown as IGame;
    
    // Use spyOn to mock the createGameStore function
    vi.spyOn(storeModule, 'createGameStore').mockReturnValue(mockGame);
    
    // Create a basic mock configuration
    mockConfig = {
      version: "1.0.0",
      chapters: [
        { id: "chapter-1", title: "Chapter 1" } as ChapterData
      ],
      router: {
        baseUrl: "",
        routes: []
      },
      tutorial: []
    };
    
    // Reset the singleton instance before each test
    // @ts-ignore - Accessing private static property for testing
    GameStoreService.instance = undefined;
  });
  
  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
  });
  
  describe("Singleton pattern", () => {
    it("should return the same instance when getInstance is called multiple times", () => {
      const instance1 = GameStoreService.getInstance();
      const instance2 = GameStoreService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
    
    it("should create the game store when instantiated", () => {
      GameStoreService.getInstance();
      
      expect(storeModule.createGameStore).toHaveBeenCalledTimes(1);
    });
  });
  
  describe("initialize", () => {
    it("should initialize the game with the provided configuration", () => {
      const service = GameStoreService.getInstance();
      const result = service.initialize();
      
      expect(mockGame.initialize).toHaveBeenCalled();
      expect(result).toBe(mockGame);
    });
    
    it("should create a new game store if one doesn't exist", () => {
      // Setup the service with a null game
      const service = GameStoreService.getInstance();
      // @ts-ignore - Setting private property for testing
      service.game = null;
      
      // Reset the mock to verify it's called again
      vi.mocked(storeModule.createGameStore).mockClear();
      
      service.initialize();
      
      expect(storeModule.createGameStore).toHaveBeenCalledTimes(1);
    });
    
    it("should use existing game store if one exists", () => {
      const service = GameStoreService.getInstance();
      
      // Reset the mock to verify it's not called again
      vi.mocked(storeModule.createGameStore).mockClear();
      
      service.initialize();
      
      expect(storeModule.createGameStore).not.toHaveBeenCalled();
    });
  });
  
  describe("getGame", () => {
    it("should return the game instance", () => {
      const service = GameStoreService.getInstance();
      const game = service.getGame();
      
      expect(game).toBe(mockGame);
    });
    
    it("should return null if game is not initialized", () => {
      const service = GameStoreService.getInstance();
      // @ts-ignore - Setting private property for testing
      service.game = null;
      
      const game = service.getGame();
      
      expect(game).toBeNull();
    });
  });
});
