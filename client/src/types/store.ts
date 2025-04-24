import { Draft } from "immer";

export interface IBaseStore<T extends Record<string, any>> {
  state: T;
  listeners: Array<(state: T) => void>;
  propertyListeners: Map<keyof T, Array<(value: any, prevValue: any) => void>>;
  
  // Write updates using Immer's draft pattern
  update(recipe: (draft: Draft<T>) => void): void;
  
  // The rest of the interface remains similar
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