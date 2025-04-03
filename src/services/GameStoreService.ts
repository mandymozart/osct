import { GameStore } from "../store/types";
import { createGameStore } from "../store";
import { GameConfiguration } from "../store/types";

/**
 * Singleton service for accessing the game store globally
 * This provides a type-safe way to access the game store from any component
 */
export class GameStoreService {
  private static instance: GameStoreService;
  private _gameStore: GameStore | null = null;

  private constructor() {
    // Create the game store when the service is instantiated
    this._gameStore = createGameStore();
  }

  /**
   * Get the singleton instance of GameStoreService
   */
  public static getInstance(): GameStoreService {
    if (!GameStoreService.instance) {
      GameStoreService.instance = new GameStoreService();
    }
    return GameStoreService.instance;
  }

  /**
   * Initialize the game store with configuration
   * @param config The game configuration
   * @returns The initialized game store
   */
  public initialize(config: GameConfiguration): GameStore {
    if (!this._gameStore) {
      this._gameStore = createGameStore();
    }
    
    this._gameStore.initialize(config);
    return this._gameStore;
  }

  /**
   * Get the game store instance
   * @returns The game store or null if not initialized
   */
  public getGameStore(): GameStore | null {
    return this._gameStore;
  }
}
