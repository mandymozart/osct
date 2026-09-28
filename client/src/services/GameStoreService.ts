import { IGame } from "@/types";
import { createGameStore } from "@/store/GameStore";

/** Global access to the single game store instance (created on first use). */
export class GameStoreService {
  private static instance: IGame;

  private constructor() {}

  public static getInstance(): Readonly<IGame> {
    if (!GameStoreService.instance) {
      const game = createGameStore();
      GameStoreService.instance = game;
    }
    return GameStoreService.instance;
  }
}