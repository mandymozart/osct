/**
 * Authoring rules for the YAML files in `content/` (validated with `validateContent`).
 * The output shape is the game configuration contract in `shared/types/game-config.ts`.
 * Folder names are the ids; nested objects (entry.target, entity assets) are checked in the build.
 */
import { ENTRY_CATEGORIES } from "../../../shared/types/entry";

// Define schema field interface
interface SchemaField {
  type: string;
  required: boolean;
  default?: any;
  enum?: string[];
  rel?: string;
}

// Define schema interface
interface Schema {
  orderBy?: string;
  fields: Record<string, SchemaField>;
}

// Export schemas object
export const schemas: Record<string, Schema> = {
  // content/book.yaml
  book: {
    fields: {
      id: { type: "String", required: true },
      title: { type: "String", required: true },
      author: { type: "String", required: true },
      publisher: { type: "String", required: false },
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
      mind: { type: "String", required: true },
    },
  },

  // content/entries/<id>/entry.yaml
  entry: {
    fields: {
      category: {
        type: "String",
        required: true,
        enum: [...ENTRY_CATEGORIES],
      },
      title: { type: "String", required: true },
      page: { type: "Number", required: true },
      author: { type: "String", required: false },
      body: { type: "String", required: false, default: "" },
      image: { type: "String", required: false },
      media: { type: "String", required: false },
      tags: { type: "List", required: false, default: [] },
      target: { type: "Object", required: false }, // { id?, image, order?, entity? }
    },
  },

  // entry.target
  target: {
    fields: {
      id: { type: "String", required: false }, // defaults to the entry id
      image: { type: "String", required: true },
      order: { type: "Number", required: false, default: 0 },
      entity: { type: "Object", required: false }, // inline { type, src?, params? } or { ref }
    },
  },

  // content/entities/<id>/entity.yaml
  entity: {
    fields: {
      type: { type: "String", required: true, enum: ["model", "video", "image"] },
      assets: { type: "Array", required: false, default: [] }, // [{ id?, src }]
      params: { type: "Object", required: false },
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
      advance: { type: "Number", required: false },
    },
  },
};
