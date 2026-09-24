import { describe, expect, it, vi } from "vitest";
import { BaseStore } from "../BaseStore";

type State = { mode: string; list: number[]; nested: { a: number } };

const createStore = () => new BaseStore<State>({ mode: "idle", list: [], nested: { a: 1 } });

describe("BaseStore", () => {
  it("notifies only the listeners of properties that changed", () => {
    const store = createStore();
    const onMode = vi.fn();
    const onList = vi.fn();
    store.subscribeToProperty("mode", onMode);
    store.subscribeToProperty("list", onList);

    store.update(draft => { draft.mode = "scan"; });

    expect(onMode).toHaveBeenCalledWith("scan", "idle");
    expect(onList).not.toHaveBeenCalled();
  });

  it("detects nested changes by value", () => {
    const store = createStore();
    const onNested = vi.fn();
    store.subscribeToProperty("nested", onNested);

    store.update(draft => { draft.nested.a = 2; });
    expect(onNested).toHaveBeenCalledTimes(1);

    // Same value, new object → no notification
    store.update(draft => { draft.nested = { a: 2 }; });
    expect(onNested).toHaveBeenCalledTimes(1);
  });

  it("does not notify global listeners when nothing changed", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ mode: "idle" });
    expect(listener).not.toHaveBeenCalled();

    store.set({ mode: "scan" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after cleanup", () => {
    const store = createStore();
    const onMode = vi.fn();
    const cleanup = store.subscribeToProperty("mode", onMode);

    cleanup();
    store.set({ mode: "scan" });

    expect(onMode).not.toHaveBeenCalled();
  });

  it("keeps previous states immutable", () => {
    const store = createStore();
    const before = store.state;

    store.update(draft => { draft.list.push(1); });

    expect(before.list).toEqual([]);
    expect(store.state.list).toEqual([1]);
    expect(Object.isFrozen(store.state)).toBe(true);
  });
});
