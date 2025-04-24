# BaseStore

A simple, reactive state management solution for vanilla JavaScript applications and Web Components using Immer for immutable updates.

## Features

- Immutable state updates with Immer
- Global state subscription
- Property-level subscriptions for fine-grained reactivity
- Perfect for Web Components architecture
- Type-safe API with TypeScript support

## Installation

Make sure you have the required dependencies installed:

```bash
npm install immer
```

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

#### Using the `set` method for partial updates (legacy)

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

## Integration with Web Components

### Basic Web Component with BaseStore

```javascript
import { todoStore } from './stores/todoStore.js';

class TodoList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Initial render
    this.render(todoStore.state);
    
    // Subscribe to store changes
    this._unsubscribe = todoStore.subscribe(state => {
      this.render(state);
    });
  }
  
  connectedCallback() {
    // Component is now in the DOM
  }
  
  disconnectedCallback() {
    // Clean up subscription when component is removed
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }
  
  render(state) {
    this.shadowRoot.innerHTML = `
      <style>
        .completed { text-decoration: line-through; }
      </style>
      <h2>Todo List</h2>
      <ul>
        ${state.todos.map(todo => `
          <li class="${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
            ${todo.text}
          </li>
        `).join('')}
      </ul>
    `;
    
    // Add event listeners
    this.shadowRoot.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const id = parseInt(li.getAttribute('data-id'), 10);
        todoStore.update(draft => {
          const todo = draft.todos.find(t => t.id === id);
          if (todo) {
            todo.completed = !todo.completed;
          }
        });
      });
    });
  }
}

// Register the custom element
customElements.define('todo-list', TodoList);
```

### Component with Property-Level Subscription

```javascript
import { todoStore } from './stores/todoStore.js';

class TodoCounter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Initial render
    this.count = todoStore.state.todos.length;
    this.render();
    
    // Subscribe only to todos property changes
    this._unsubscribe = todoStore.subscribeToProperty('todos', (newTodos) => {
      this.count = newTodos.length;
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
      <div>Total todos: ${this.count}</div>
    `;
  }
}

customElements.define('todo-counter', TodoCounter);
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

## Integration with a Vanilla Framework

If you're using any vanilla JavaScript framework with Web Components, the BaseStore integrates seamlessly:

```javascript
// Create a simple application with a central store
import { BaseStore } from './path/to/BaseStore.js';

// Create and export a singleton store
const appStore = new BaseStore({
  currentPage: 'home',
  theme: 'light',
  user: null,
  notifications: []
});

export { appStore };

// Then in your web components:
import { appStore } from './stores/appStore.js';

class AppHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Initial render with current state
    this.render(appStore.state);
    
    // Subscribe to theme changes only
    this._themeUnsubscribe = appStore.subscribeToProperty('theme', (newTheme) => {
      this.updateTheme(newTheme);
    });
    
    // Subscribe to user changes only
    this._userUnsubscribe = appStore.subscribeToProperty('user', (newUser) => {
      this.updateUserInfo(newUser);
    });
  }
  
  disconnectedCallback() {
    this._themeUnsubscribe();
    this._userUnsubscribe();
  }
  
  updateTheme(theme) {
    this.shadowRoot.querySelector('.app-header').className = 
      `app-header ${theme}-theme`;
  }
  
  updateUserInfo(user) {
    const userInfo = this.shadowRoot.querySelector('.user-info');
    if (user) {
      userInfo.textContent = `Welcome, ${user.name}`;
    } else {
      userInfo.textContent = 'Sign In';
    }
  }
  
  render(state) {
    this.shadowRoot.innerHTML = `
      <style>
        .app-header { /* styles */ }
        .light-theme { background-color: #fff; color: #333; }
        .dark-theme { background-color: #333; color: #fff; }
      </style>
      <header class="app-header ${state.theme}-theme">
        <h1>My App</h1>
        <div class="user-info">
          ${state.user ? `Welcome, ${state.user.name}` : 'Sign In'}
        </div>
      </header>
    `;
    
    // Add event listeners
    this.shadowRoot.querySelector('.user-info').addEventListener('click', () => {
      if (!appStore.state.user) {
        // Open login modal
        appStore.update(draft => {
          draft.currentPage = 'login';
        });
      }
    });
  }
}

customElements.define('app-header', AppHeader);
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