/**
 * Schema definitions for content types
 * This file defines validation and ordering rules for each content type
 */

export const schemas = {
  // Chapter schema
  chapter: {
    // Field used for ordering chapters
    orderBy: "order",
    // Field definitions with types and defaults
    fields: {
      type: { type: "String", required: true, default: "chapter" },
      id: { type: "String", required: false },
      order: { type: "Number", required: false, default: 0 },
      title: { type: "String", required: true },
      firstPage: { type: "Number", required: false, default: 1 },
      lastPage: { type: "Number", required: false, default: 1 },
      imageTargetSrc: { type: "String", required: false, default: "" },
      targets: { type: "List", required: false, default: [] },
    },
  },

  // Target schema
  target: {
    // No default ordering for targets (they're ordered within chapters)
    orderBy: null,
    // Field definitions with types and defaults
    fields: {
      type: { type: "String", required: true, default: "target" },
      id: { type: "String", required: true },
      title: { type: "String", required: true },
      description: { type: "String", required: false, default: "" },
      relatedChapter: { type: "String", required: true },
      mindarTargetIndex: { type: "Number", required: false, default: 0 },
      bookId: { type: "String", required: false },
      targetType: {
        type: "String",
        required: false,
        default: "basic",
        enum: ["basic", "model", "video", "link"],
      },
      url: { type: "String", required: false },
      assetId: { type: "String", required: false },
      assetType: { type: "String", required: false, default: "gltf" },
      assetSrc: { type: "String", required: false },
      relatedTargets: { type: "List", required: false },
      tags: { type: "List", required: false, default: [] },
    },
  },

  // Step schema
  step: {
    // Field used for ordering tutorial steps
    orderBy: "index",
    // Field definitions with types and defaults
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
