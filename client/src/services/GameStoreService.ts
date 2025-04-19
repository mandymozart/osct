import { IGame } from "@/types";
import { createGameStore } from "@/store/GameStore";

/**
 * Singleton service for accessing the game store globally
 */
export class GameStoreService {
  private static instance: IGame;

  private constructor() {}

  /**
   * Get the singleton game store instance
   */
  public static getInstance(): Readonly<IGame> {
    if (!GameStoreService.instance) {
      const game = createGameStore();
      game.initialize();
      GameStoreService.instance = game;
    }
    return GameStoreService.instance;
  }
}