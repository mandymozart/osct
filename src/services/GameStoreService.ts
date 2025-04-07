import { GameConfiguration, IGame } from "@/types";
import { createGameStore } from "../store";

/**
 * Singleton service for accessing the game store globally
 * This provides a type-safe way to access the game store from any component
 */
export class GameStoreService {
  private static instance: GameStoreService;
  private game: IGame | null = null;

  private constructor() {
    // Create the game store when the service is instantiated
    this.game = createGameStore();
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
  public initialize(): IGame {
    if (!this.game) {
      this.game = createGameStore();
    }
    
    this.game.initialize();
    return this.game;
  }

  /**
   * Get the game store instance
   * @returns The game store or null if not initialized
   */
  public getGame(): IGame | null {
    return this.game;
  }
}
