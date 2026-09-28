import { IBaseStore } from '@/types';
import { Draft, produce } from 'immer';

/**
 * Minimal observable store: immutable updates via Immer, global listeners and per-property
 * listeners. Listeners fire only for top-level keys whose value actually changed.
 */
export class BaseStore<T extends Record<string, any>> implements IBaseStore<T> {
  state: T;
  listeners: Array<(state: T) => void> = [];
  propertyListeners: Map<keyof T, Array<(value: any, prevValue: any) => void>> = new Map();

  constructor(initialState: T) {
    this.state = initialState;
  }

  /** Applies an Immer recipe, then notifies listeners of the changed top-level properties. */
  update(recipe: (draft: Draft<T>) => void): void {
    const prevState = this.state;
    this.state = produce(this.state, draft => {
      recipe(draft);
    });

    this.detectChanges(prevState);
  }

  private detectChanges(prevState: T): void {
    const changedProps = Object.keys(this.state).filter(key => {
      const typedKey = key as keyof T;
      const prevValue = prevState[typedKey];
      const currentValue = this.state[typedKey];
      // Objects compare by value: a new reference with equal content does not notify
      if (
        typeof prevValue === 'object' && prevValue !== null &&
        typeof currentValue === 'object' && currentValue !== null
      ) {
        try {
          return JSON.stringify(prevValue) !== JSON.stringify(currentValue);
        } catch (e) {
          // Circular / non-serialisable values: fall back to reference comparison
          console.warn(`[BaseStore] JSON stringification failed for property ${String(typedKey)}, falling back to reference comparison`);
          return prevValue !== currentValue;
        }
      }

      return prevValue !== currentValue;
    });

    changedProps.forEach(key => {
      const typedKey = key as keyof T;
      this.notifyPropertyListeners(typedKey, prevState[typedKey]);
    });

    if (changedProps.length > 0) {
      this.notifyListeners();
    }
  }

  /** Partial update: shallow-merges `newState` into the state. */
  set(newState: Partial<T>): void {
    this.update(draft => {
      Object.assign(draft, newState);
    });
  }

  subscribe(callback: (state: T) => void): () => void {
    this.listeners.push(callback);
    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback: (state: T) => void): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  subscribeToProperty<K extends keyof T>(
    property: K, 
    callback: (value: T[K], prevValue: T[K]) => void
  ): () => void {
    if (!this.propertyListeners.has(property)) {
      this.propertyListeners.set(property, []);
    }
    
    const callbacks = this.propertyListeners.get(property)!;
    callbacks.push(callback as any);
    
    return () => this.unsubscribeFromProperty(property, callback);
  }

  unsubscribeFromProperty<K extends keyof T>(
    property: K, 
    callback: (value: T[K], prevValue: T[K]) => void
  ): void {
    if (!this.propertyListeners.has(property)) return;
    
    const callbacks = this.propertyListeners.get(property)!;
    this.propertyListeners.set(
      property,
      callbacks.filter(cb => cb !== callback)
    );
  }

  notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  notifyPropertyListeners<K extends keyof T>(property: K, prevValue: T[K]): void {
    if (!this.propertyListeners.has(property)) return;
    
    const callbacks = this.propertyListeners.get(property)!;
    callbacks.forEach(callback => callback(this.state[property], prevValue));
  }
}