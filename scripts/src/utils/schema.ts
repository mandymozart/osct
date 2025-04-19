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
  // Chapter schema
  chapter: {
    orderBy: "order",
    fields: {
      type: { type: "String", required: true, default: "chapter" },
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
      title: { type: "String", required: true },
      description: { type: "String", required: false, default: "" },
      relatedChapter: { type: "String", required: true, rel: "chapter" },
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
