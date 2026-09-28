import { Draft } from "immer";

export interface IBaseStore<T extends Record<string, any>> {
  state: T;
  listeners: Array<(state: T) => void>;
  propertyListeners: Map<keyof T, Array<(value: any, prevValue: any) => void>>;
  
  /** Applies an Immer recipe to the state and notifies listeners */
  update(recipe: (draft: Draft<T>) => void): void;
  
  subscribe(callback: (state: T) => void): () => void;
  unsubscribe(callback: (state: T) => void): void;
  
  subscribeToProperty<K extends keyof T>(
    property: K, 
    callback: (value: T[K], prevValue: T[K]) => void
  ): () => void;
  
  unsubscribeFromProperty<K extends keyof T>(
    property: K, 
    callback: (value: T[K], prevValue: T[K]) => void
  ): void;
}