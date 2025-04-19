/**
 * Schema definitions for content types
 * This file defines validation and ordering rules for each content type
 */

export const schemas = {
  // Chapter schema
  chapter: {
    orderBy: "order",
    fields: {
      type: { type: "String", required: true, default: "chapter" },
      id: { type: "String", required: false },
      order: { type: "Number", required: false, default: 0 },
      title: { type: "String", required: true },
      firstPage: { type: "Number", required: false, default: 1 },
      lastPage: { type: "Number", required: false, default: 1 },
      imageTargetSrc: { type: "String", required: false, default: "" },
      targets: { type: "List", required: false, default: [], rel: "target" },
    },
  },

  // Target schema
  target: {
    orderBy: "mindarTargetIndex",
    fields: {
      type: { type: "String", required: true, default: "target" },
      id: { type: "String", required: true },
      title: { type: "String", required: true },
      description: { type: "String", required: false, default: "" },
      relatedChapter: { type: "String", required: true, rel: "chapter" },
      mindarTargetIndex: { type: "Number", required: false, default: 0 },
      imageTargetSrc: { type: "String", required: true, default: "" },
      bookId: { type: "String", required: false },
      targetType: {
        type: "String",
        required: false,
        default: "basic",
        enum: ["basic", "model", "video", "link"],
      },
      assets: { type: "List", required: false, default: [], rel: "asset" },
      relatedTargets: { type: "List", required: false },
      tags: { type: "List", required: false, default: [] },
    },
  },

  // Asset schema
  asset: {
    orderBy: null,
    fields: {
      type: { type: "String", required: true, default: "asset" },
      id: { type: "String", required: true },
      src: { type: "String", required: false },
      assetType: { 
        type: "String", 
        required: false, 
        default: "string", 
        options: ["image", "gltf", "glb", "video", "audio", "link"], 
      },
    },
  },

  // Step schema
  step: {
    orderBy: "index",
    fields: {
      type: { type: "String", required: true, default: "step" },
      index: { type: "Number", required: true },
      title: { type: "String", required: true },
      description: { type: "String", required: true },
      illustration: { type: "String", required: false },
    },
  },

  // Add more content type schemas as needed

  // Custom type (example)
  // customType: {
  //   orderBy: 'customOrder',
  //   fields: {
  //     type: { type: 'String', required: true, default: 'customType' },
  //     id: { type: 'String', required: true },
  //     customOrder: { type: 'Number', required: false, default: 0 },
  //     // Add other fields as needed
  //   }
  // }
};
