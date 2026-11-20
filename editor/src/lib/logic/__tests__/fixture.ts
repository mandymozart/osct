import type { EntityData, PluginData } from "@engine/types";
import { pluginCodeUses } from "../plugin-code";
import type { LogicContent } from "../project";


// Three scenes: Cover and Door in the group "Chapter 1", the Epilogue outside it. The key (Cover) sets hasKey for the
// experience and emits keyRattled; the door (Door) shows its hint, with hasKey hides it and emits openDoor, and hides it
// again on bellRang; the bell (Door) hears keyRattled, sets rung for the scene and emits bellRang; the Epilogue's end hears
// openDoor and sceneChanged and reads rung, its entry's text reads hasKey. The narrative plugin hears openDoor, emits
// doorOpened and sets doorOpen.
const key: EntityData = {
  type: "model", assets: [],
  components: [{ type: "behaviour", rules: [{ on: "tap", do: [{ set: { hasKey: true }, scope: "experience" }, { emit: "keyRattled" }] }] }],
};
const door: EntityData = {
  type: "group", assets: [],
  children: [{ type: "model", name: "door", assets: [] }, { type: "text", name: "hint", assets: [], text: "Tap the key" }],
  components: [
    { type: "door", lift: 0.35 },
    { type: "behaviour", rules: [
      { on: "found", do: { show: "hint" } },
      { on: "found", when: "hasKey", do: [{ hide: "hint" }, { emit: "openDoor" }] },
      { on: "bellRang", do: { hide: "hint" } },
    ] },
  ],
};
const bell: EntityData = {
  type: "model", assets: [],
  components: [{ type: "behaviour", rules: [{ on: "keyRattled", do: [{ set: { rung: true }, scope: "scene" }, { emit: "bellRang" }] }] }],
};
const end: EntityData = {
  type: "model", assets: [],
  components: [{ type: "behaviour", rules: [{ on: "openDoor", when: "rung", do: { show: "" } }, { on: "sceneChanged", do: { hide: "" } }] }],
};
const plugins = [{ id: "narrative", src: "/p.js", api: "3.0", registered: { components: { door: { params: {} } } } }] as unknown as PluginData[];
const code = { narrative: pluginCodeUses(`api.events.on("openDoor", f); api.events.emit("doorOpened"); api.vars.set("doorOpen", true);`) };

export const content: LogicContent = {
  scenes: [
    { id: "cover", label: "Cover", group: "ch1", targets: [{ id: "key", entity: key }] },
    { id: "door", label: "Door", group: "ch1", targets: [{ id: "door", entity: door }, { id: "bell", entity: bell }] },
    { id: "epilogue", label: "Epilogue", targets: [{ id: "end", entity: end }], entries: [{ id: "e1", title: "After", body: "You {hasKey}." }] },
  ],
  groups: [{ id: "ch1", label: "Chapter 1" }],
  plugins,
  code,
};
