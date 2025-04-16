export function associateTargets(content) {
  // Make sure each chapter has a targets array
  content.chapter.forEach((chapter) => {
    if (!chapter.targets) {
      chapter.targets = [];
    }
  });

  // Create a map for quick chapter lookup
  const chapterMap = {};
  content.chapter.forEach((chapter) => {
    chapterMap[chapter.id] = chapter;
  });

  // Process each target
  if (content.target) {
    for (const target of content.target) {
      const relatedChapter = target.relatedChapter || target.chapterId;

      if (relatedChapter && chapterMap[relatedChapter]) {
        const chapter = chapterMap[relatedChapter];

        // Create target object for the chapter
        const chapterTarget = {
          mindarTargetIndex: target.mindarTargetIndex || 0,
          bookId: target.bookId || target.id?.replace(/\D/g, "") || "000",
          title: target.title || target.id,
          description: target.description || "",
          entity: {
            assets: [],
          },
        };

        // Handle target type and assets
        if (target.targetType) {
          // Store the target interaction type
          chapterTarget.targetType = target.targetType;

          // For link type
          if (target.targetType === "link" && target.url) {
            chapterTarget.url = target.url;
          }

          // For model type
          if (target.targetType === "model" && target.assetSrc) {
            chapterTarget.entity.assets.push({
              id: target.assetId || target.id || "model",
              type: target.assetType || "gltf",
              src: target.assetSrc,
            });
          }

          // For video type
          if (target.targetType === "video" && target.assetSrc) {
            chapterTarget.entity.assets.push({
              id: target.assetId || target.id || "video",
              type: "video",
              src: target.assetSrc,
            });
          }
        }

        // Add additional metadata if present
        if (target.relatedTargets) {
          if (typeof target.relatedTargets === "string") {
            chapterTarget.relatedTargets = target.relatedTargets
              .split(",")
              .map((t) => t.trim());
          } else if (Array.isArray(target.relatedTargets)) {
            chapterTarget.relatedTargets = target.relatedTargets;
          }
        }

        if (target.tags) {
          if (typeof target.tags === "string") {
            chapterTarget.tags = target.tags.split(",").map((t) => t.trim());
          } else if (Array.isArray(target.tags)) {
            chapterTarget.tags = target.tags;
          }
        }

        // Add target to its chapter
        chapter.targets.push(chapterTarget);
      } else {
        console.warn(`Target ${target.id} has no valid related chapter.`);
      }
    }
  }
}
