import { LoadingState } from "../common";

/**
 * State of an individual entity
 */
export interface EntityState {
  id: string;          // Entity ID
  status: LoadingState; // Current loading state
  error?: Error;        // Error information if loading failed
}

/**
 * State managed by the EntityManager
 */
export interface EntityManagerState {
  entities: Record<string, EntityState>; // Keyed by entity ID
}

/**
 * Entity Manager interface for handling entity state
 */
export interface IEntityManager {
  /**
   * Register a new entity
   * @param id Unique identifier for the entity
   */
  register(id: string, state: EntityState): void;
  
  /**
   * Mark an entity as loaded
   * @param id Entity identifier
   */
  markLoaded(id: string): void;
  
  /**
   * Mark an entity as failed
   * @param id Entity identifier
   * @param error Error that occurred
   */
  markFailed(id: string, error: Error): void;
  
  /**
   * Remove an entity from the state
   * @param id Entity identifier
   */
  remove(id: string): void;
  
  /**
   * Check if all entities are loaded
   * @returns True if all entities are loaded
   */
  areAllEntitiesLoaded(): boolean;
  
  /**
   * Get loading status for all entities
   * @returns Status statistics
   */
  getLoadingStatus(): { loaded: number; total: number };
}
