# BaseStore

A simple, reactive state management solution for vanilla JavaScript applications and Web Components using Immer for immutable updates.

## Features

- Immutable state updates with Immer
- Global state subscription
- Property-level subscriptions for fine-grained reactivity
- Perfect for Web Components architecture
- Type-safe API with TypeScript support

## Basic Usage

### Creating a Store

```typescript
import { BaseStore } from './path/to/BaseStore';

// Define your store's state interface
interface TodoState {
  todos: { id: number; text: string; completed: boolean }[];
  filter: 'all' | 'active' | 'completed';
  loading: boolean;
}

// Create initial state
const initialState: TodoState = {
  todos: [],
  filter: 'all',
  loading: false
};

// Create your store
const todoStore = new BaseStore<TodoState>(initialState);
```

### Updating State

There are two ways to update state:

#### Using the immutable `update` method (recommended)

```typescript
// Add a new todo
todoStore.update(draft => {
  draft.todos.push({
    id: Date.now(),
    text: 'Learn BaseStore',
    completed: false
  });
});

// Toggle a todo
todoStore.update(draft => {
  const todo = draft.todos.find(t => t.id === 123);
  if (todo) {
    todo.completed = !todo.completed;
  }
});

// Change filter
todoStore.update(draft => {
  draft.filter = 'active';
});
```

#### Using the `set` method for partial updates (shortcut)

```typescript
// Set loading state
todoStore.set({ loading: true });

// Update multiple properties at once
todoStore.set({
  loading: false,
  filter: 'completed'
});
```

### Subscribing to State Changes

#### Global Subscription

```typescript
// Subscribe to any state change
const unsubscribe = todoStore.subscribe(state => {
  console.log('State updated:', state);
  renderApp(state);
});

// Later, when you don't need the subscription anymore
unsubscribe();
```

#### Property-Level Subscription

```typescript
// Subscribe to changes of a specific property
const unsubscribeTodos = todoStore.subscribeToProperty('todos', (newTodos, prevTodos) => {
  console.log('Todos changed from', prevTodos, 'to', newTodos);
  renderTodoList(newTodos);
});

// Subscribe to loading state changes
const unsubscribeLoading = todoStore.subscribeToProperty('loading', (isLoading) => {
  if (isLoading) {
    showLoadingIndicator();
  } else {
    hideLoadingIndicator();
  }
});

// Later, unsubscribe
unsubscribeTodos();
unsubscribeLoading();
```

## Advanced Usage

### Creating Domain-Specific Stores

You can extend the BaseStore to create specialized stores with domain-specific methods:

```typescript
import { BaseStore } from './path/to/BaseStore';

interface TodoState {
  todos: { id: number; text: string; completed: boolean }[];
  filter: 'all' | 'active' | 'completed';
}

class TodoStore extends BaseStore<TodoState> {
  constructor() {
    super({
      todos: [],
      filter: 'all'
    });
  }

  addTodo(text: string) {
    this.update(draft => {
      draft.todos.push({
        id: Date.now(),
        text,
        completed: false
      });
    });
  }

  toggleTodo(id: number) {
    this.update(draft => {
      const todo = draft.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    });
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.update(draft => {
      draft.filter = filter;
    });
  }

  get activeTodos() {
    return this.state.todos.filter(todo => !todo.completed);
  }

  get completedTodos() {
    return this.state.todos.filter(todo => todo.completed);
  }
}

// Usage
const todoStore = new TodoStore();
todoStore.addTodo('Learn BaseStore');
console.log(todoStore.activeTodos);
```

## Performance Optimization

For large applications, you can optimize performance by using property-level subscriptions:

```javascript
// Only re-render when a specific property changes
class FilterSelector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Initial render
    this.currentFilter = todoStore.state.filter;
    this.render();
    
    // Subscribe only to filter property changes
    this._unsubscribe = todoStore.subscribeToProperty('filter', (newFilter) => {
      this.currentFilter = newFilter;
      this.render();
    });
  }
  
  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }
  
  render() {
    this.shadowRoot.innerHTML = `
      <div class="filters">
        <button class="${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        <button class="${this.currentFilter === 'active' ? 'active' : ''}" data-filter="active">Active</button>
        <button class="${this.currentFilter === 'completed' ? 'active' : ''}" data-filter="completed">Completed</button>
      </div>
    `;
    
    // Add event listeners
    this.shadowRoot.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        const filter = button.getAttribute('data-filter');
        todoStore.update(draft => {
          draft.filter = filter;
        });
      });
    });
  }
}

customElements.define('filter-selector', FilterSelector);
```

## Notes on State Design

1. Keep your state normalized when possible
2. Avoid deeply nested state structures
3. Consider splitting large stores into domain-specific stores
4. Use TypeScript interfaces to document your state shape

## Debugging

The BaseStore includes helpful console warnings when JSON stringification fails during change detection. You can extend this with more logging if needed:

```typescript
class DebugStore<T extends Record<string, any>> extends BaseStore<T> {
  constructor(initialState: T, private storeName: string) {
    super(initialState);
  }
  
  update(recipe: (draft: Draft<T>) => void): void {
    console.group(`[${this.storeName}] State Update`);
    console.log('Previous state:', this.state);
    super.update(recipe);
    console.log('New state:', this.state);
    console.groupEnd();
  }
}
```