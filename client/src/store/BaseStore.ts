import { IBaseStore } from '@/types';
import { Draft, produce } from 'immer';

export class BaseStore<T extends Record<string, any>> implements IBaseStore<T> {
  state: T;
  listeners: Array<(state: T) => void> = [];
  propertyListeners: Map<keyof T, Array<(value: any, prevValue: any) => void>> = new Map();

  constructor(initialState: T) {
    this.state = initialState;
  }

  // Main update method using Immer
  update(recipe: (draft: Draft<T>) => void): void {
    const prevState = this.state;
    // Create the next state immutably using Immer
    this.state = produce(this.state, draft => {
      recipe(draft);
    });
    
    // Determine which properties changed
    this.detectChanges(prevState);
  }

  // Helper to detect changes between previous and current state
  private detectChanges(prevState: T): void {
    // Find all changed properties using more accurate detection for nested objects
    const changedProps = Object.keys(this.state).filter(key => {
      const typedKey = key as keyof T;
      const prevValue = prevState[typedKey];
      const currentValue = this.state[typedKey];
      // For objects and arrays, use JSON stringification for deep comparison
      if (
        typeof prevValue === 'object' && prevValue !== null &&
        typeof currentValue === 'object' && currentValue !== null
      ) {
        try {
          return JSON.stringify(prevValue) !== JSON.stringify(currentValue);
        } catch (e) {
          // If stringification fails (e.g., circular references), fall back to reference comparison
          console.warn(`[BaseStore] JSON stringification failed for property ${String(typedKey)}, falling back to reference comparison`);
          return prevValue !== currentValue;
        }
      }
      
      // For primitive values, use simple comparison
      return prevValue !== currentValue;
    });
    
    // Notify property listeners
    changedProps.forEach(key => {
      const typedKey = key as keyof T;
      this.notifyPropertyListeners(typedKey, prevState[typedKey]);
    });
    
    // Only notify global listeners if something changed
    if (changedProps.length > 0) {
      this.notifyListeners();
    }
  }

  // For backward compatibility with your existing code
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