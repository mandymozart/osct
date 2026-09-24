/**
 * Content schema definitions for validation
 */

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
  // Spread schema
  spread: {
    orderBy: "order",
    fields: {
      type: { type: "String", required: true, default: "spread" },
      id: { type: "String", required: true },
      order: { type: "Number", required: false, default: 0 },
      title: { type: "String", required: true },
      firstPage: { type: "Number", required: false, default: 1 },
      lastPage: { type: "Number", required: false, default: 1 },
      imageTargetSrc: { type: "String", required: false },
    },
  },

  // Target schema
  target: {
    orderBy: "order",
    fields: {
      type: { type: "String", required: true, default: "target" },
      id: { type: "String", required: true },
      relatedSpread: { type: "String", required: true, rel: "spread" },
      order: { type: "Number", required: false, default: 0 },
      imageTargetSrc: { type: "String", required: true },
      bookId: { type: "String", required: false },
      targetType: {
        type: "String",
        required: false,
        default: "basic",
        enum: ["basic", "model", "video", "link"],
      },
      assets: { type: "List", required: false, default: [], rel: "asset" },
      relatedTargets: { type: "List", required: false, default: [] },
      tags: { type: "List", required: false, default: [] },
    },
  },

  // Entry schema – top-level content revealed by a target (or listed without one)
  entry: {
    fields: {
      type: { type: "String", required: true, default: "entry" },
      id: { type: "String", required: true },
      category: {
        type: "String",
        required: true,
        enum: ["glossary", "videos", "texts", "links"],
      },
      title: { type: "String", required: true },
      page: { type: "Number", required: true },
      author: { type: "String", required: false },
      body: { type: "String", required: false, default: "" },
      image: { type: "String", required: false },
      media: { type: "String", required: false },
      target: { type: "String", required: false, rel: "target" },
      hideFromIndex: { type: "Boolean", required: false, default: false },
    },
  },

  // Asset schema
  asset: {
    fields: {
      type: { type: "String", required: true, default: "asset" },
      id: { type: "String", required: true },
      assetType: {
        type: "String",
        required: true,
        enum: ["model", "image", "video", "audio", "glb", "gltf"],
      },
      src: { type: "String", required: true },
      title: { type: "String", required: false },
      alt: { type: "String", required: false },
    },
  },

  // Step schema for tutorial content
  step: {
    orderBy: "order",
    fields: {
      type: { type: "String", required: true, default: "step" },
      id: { type: "String", required: true },
      order: { type: "Number", required: false, default: 0 },
      title: { type: "String", required: true },
      description: { type: "String", required: true },
      image: { type: "String", required: false },
    },
  },
};
