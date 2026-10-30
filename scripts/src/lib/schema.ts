/**
 * Authoring rules for the YAML files in `content/` (validated with `validateContent`).
 * The output shape is the game configuration contract in `shared/types/game-config.ts`.
 * Folder names are the ids; nested objects (entry.target, entity assets) are checked in the build.
 */
import { ENTRY_CATEGORIES } from "../../../shared/types/entry";

/** `List`: an array of texts, or the texts in one comma-separated string */
export type FieldType = "String" | "Number" | "Array" | "List" | "Boolean" | "Object";

export interface SchemaField {
  type: FieldType;
  required: boolean;
  default?: unknown;
  enum?: readonly string[];
  rel?: string;
}

interface Schema {
  orderBy?: string;
  fields: Record<string, SchemaField>;
}

export const schemas = {
  // content/book.yaml
  book: {
    fields: {
      id: { type: "String", required: true },
      title: { type: "String", required: true },
      author: { type: "String", required: true },
      publisher: { type: "String", required: false },
      passes: { type: "Array", required: false }, // post-processing of every spread without its own: [{ type, ...parameters }], see shared/types/passes.ts
      environment: { type: "Object", required: false }, // the world around the reader and the onion sky: { world, onionSky, worldSrc?, skySrc? }, see shared/types/environment.ts
    },
  },

  // content/spreads/<id>/spread.yaml
  spread: {
    orderBy: "order",
    fields: {
      title: { type: "String", required: true },
      order: { type: "Number", required: false, default: 0 },
      firstPage: { type: "Number", required: true },
      lastPage: { type: "Number", required: true },
      format: { type: "String", required: false, enum: ["spread", "cover", "back"] }, // the covers: page 0, and the page after the last
      passes: { type: "Array", required: false }, // post-processing over the rendered image: [{ type, ...parameters }], see shared/types/passes.ts
    },
  },

  // content/entries/<id>/entry.yaml
  entry: {
    fields: {
      category: {
        type: "String",
        required: true,
        enum: ENTRY_CATEGORIES,
      },
      title: { type: "String", required: true },
      page: { type: "Number", required: true },
      author: { type: "String", required: false },
      body: { type: "String", required: false, default: "" },
      image: { type: "String", required: false },
      media: { type: "String", required: false },
      tags: { type: "List", required: false, default: [] },
      target: { type: "Object", required: false }, // { id?, image, entity? }
    },
  },

  // entry.target
  target: {
    fields: {
      id: { type: "String", required: false }, // defaults to the entry id
      image: { type: "String", required: true },
      entity: { type: "Object", required: false }, // inline { type, src?, params?, filters? } or { ref }
      print: { type: "Object", required: false }, // where it is printed: { surface, x, y, width, height? } in mm (schema 2.1)
    },
  },

  // content/entities/<id>/entity.yaml – the root node of a shared entity (content schema 2.0: a tree)
  entity: {
    fields: {
      id: { type: "String", required: false },
      name: { type: "String", required: false }, // the node's name in the editor's tree (schema 2.12)
      type: { type: "String", required: true }, // ENTITY_TYPES or a plugin's node type (schema 2.13) – checked by the build (build/entities.ts)
      assets: { type: "Array", required: false, default: [] }, // [{ id?, src }]
      params: { type: "Object", required: false },
      filters: { type: "Array", required: false }, // video only: [{ type, ...parameters }], see shared/types/filters.ts
      children: { type: "Array", required: false }, // nodes: { type, name?, src?, params?, filters?, children?, text?, color?, light? }
      components: { type: "Array", required: false }, // [{ type, ...parameters }], see shared/types/components.ts
      text: { type: "String", required: false }, // text nodes
      color: { type: "String", required: false }, // text nodes, #rrggbb
      light: { type: "Object", required: false }, // light nodes: { kind, color, intensity, … }, see shared/types/lights.ts
    },
  },

  // content/steps/<id>/step.yaml (tutorial)
  step: {
    orderBy: "index",
    fields: {
      index: { type: "Number", required: true },
      title: { type: "String", required: false },
      description: { type: "String", required: false },
      footer: { type: "String", required: false },
      illustration: { type: "String", required: false },
      button: { type: "String", required: false },
      action: { type: "String", required: false, enum: ["next", "camera", "scan"] },
      fadeIn: { type: "Number", required: false },
      stagger: { type: "Number", required: false },
      advance: { type: "Number", required: false },
    },
  },
} as const satisfies Record<string, Schema>;

export type ContentType = keyof typeof schemas;

/** The value a field of this definition has after `validateContent` (an enum: one of its values) */
type FieldValue<F> =
  F extends { enum: readonly (infer E)[] } ? E
  : F extends { type: "String" } ? string
  : F extends { type: "Number" } ? number
  : F extends { type: "Boolean" } ? boolean
  : F extends { type: "List" } ? string[]
  : F extends { type: "Object" } ? Record<string, unknown>
  : unknown[];

/** Always there after `validateContent`: required, or filled in from the default */
type Present<F> = F extends { required: true } ? true : F extends { default: unknown } ? true : false;

type Fields<T extends ContentType> = (typeof schemas)[T]["fields"];

/**
 * A content file of this type as `validateContent` returns it: the schema's fields with their types (present when
 * required or defaulted), any other field the author wrote as it was
 */
export type Authored<T extends ContentType> = Record<string, unknown> &
  { -readonly [K in keyof Fields<T> as Present<Fields<T>[K]> extends true ? K : never]: FieldValue<Fields<T>[K]> } &
  { -readonly [K in keyof Fields<T> as Present<Fields<T>[K]> extends true ? never : K]?: FieldValue<Fields<T>[K]> };
