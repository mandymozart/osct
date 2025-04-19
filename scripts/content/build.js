import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// ES6 modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, '../../content');
const OUTPUT_FILE = path.join(__dirname, '../../src/game.config.json');

/**
 * Parse a YAML file
 */
function parseYamlFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return yaml.load(fileContent);
  } catch (error) {
    console.error(`Error parsing YAML file ${filePath}:`, error);
    return null;
  }
}

/**
 * Convert a string or array value to an array
 * This is used for tags, relatedTargets, assets, etc.
 */
function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Split comma-separated string
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [value]; // Last resort, wrap in array
}

/**
 * Find asset YAML files within a target directory
 */
function findAssetFiles(targetDir) {
  const assets = [];
  
  try {
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      
      for (const file of files) {
        if (file.startsWith('asset-') && file.endsWith('.yaml')) {
          const assetPath = path.join(targetDir, file);
          const asset = parseYamlFile(assetPath);
          
          if (asset) {
            assets.push(asset);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error finding asset files in ${targetDir}:`, error);
  }
  
  return assets;
}

/**
 * Find YAML files in the content directory
 */
function findYamlFiles(directory, contentType) {
  let results = [];
  const contentTypeDir = path.join(directory, contentType);
  
  if (!fs.existsSync(contentTypeDir)) {
    return results;
  }
  
  try {
    const items = fs.readdirSync(contentTypeDir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        // Look for YAML files inside this content directory
        const subdir = path.join(contentTypeDir, item.name);
        const subItems = fs.readdirSync(subdir, { withFileTypes: true });
        
        for (const subItem of subItems) {
          if (subItem.isFile() && subItem.name === `${contentType.slice(0, -1)}.yaml`) {
            results.push({
              path: path.join(subdir, subItem.name),
              dir: subdir,
              name: item.name
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error searching directory ${directory}:`, error);
  }
  
  return results;
}

/**
 * Read content for a specific type
 */
function readContentType(contentType) {
  const yamlFiles = findYamlFiles(CONTENT_DIR, contentType);
  const content = [];
  
  // Process each YAML file
  for (const fileInfo of yamlFiles) {
    const data = parseYamlFile(fileInfo.path);
    
    if (!data) {
      console.warn(`Failed to parse YAML file: ${fileInfo.path}`);
      continue;
    }
    
    if (!data.id) {
      data.id = fileInfo.name;
    }
    
    // Add type if not already present
    if (!data.type) {
      data.type = contentType.slice(0, -1); // Remove the 's' from the folder name
    }
    
    // Convert string tags to arrays
    if (data.tags) {
      data.tags = ensureArray(data.tags);
    }
    
    // Convert relatedTargets to arrays
    if (data.relatedTargets) {
      data.relatedTargets = ensureArray(data.relatedTargets);
    }
    
    // Load assets for targets
    if (contentType === 'targets' && data.assets) {
      // Convert assets property to array of IDs
      data.assetIds = ensureArray(data.assets);
      
      // Find and load separate asset files
      const assetFiles = findAssetFiles(fileInfo.dir);
      data.assets = assetFiles;
    }
    
    content.push(data);
  }
  
  // Sort content by appropriate field
  return content.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    } else if (a.index !== undefined && b.index !== undefined) {
      return a.index - b.index;
    } else if (a.title && b.title) {
      return a.title.localeCompare(b.title);
    }
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Transform target data to match the expected format for game.config.json
 */
function transformTargetData(target) {
  // Deep clone to avoid modifying original
  const result = { ...target };
  
  // Create entity structure expected by GameConfiguration
  result.entity = {
    type: result.targetType || 'basic'
  };
  
  // Use assetIds for entity.assets if available, otherwise just include empty assets array
  if (result.assetIds && Array.isArray(result.assetIds)) {
    // Map asset IDs to their corresponding asset files
    result.entity.assets = [];
    
    // Find all relevant asset files
    if (result.assets && Array.isArray(result.assets)) {
      for (const assetId of result.assetIds) {
        // Find the corresponding asset file
        const assetFile = result.assets.find(asset => asset.id === assetId);
        
        // Add the asset to entity.assets
        if (assetFile) {
          const assetData = {
            id: assetFile.id,
            type: assetFile.assetType,
            src: assetFile.src
          };
          
          result.entity.assets.push(assetData);
        } else {
          // If asset file not found, just add the ID
          result.entity.assets.push({ id: assetId });
        }
      }
    } else {
      // If no asset files found, just add the IDs
      result.entity.assets = result.assetIds.map(assetId => ({ id: assetId }));
    }
  } else {
    result.entity.assets = [];
  }
  
  // Ensure tags and relatedTargets are arrays
  if (result.tags) {
    result.tags = ensureArray(result.tags);
  } else {
    result.tags = [];
  }
  
  if (result.relatedTargets) {
    result.relatedTargets = ensureArray(result.relatedTargets);
  } else {
    result.relatedTargets = [];
  }
  
  // Clean up properties not needed in the final output
  delete result.assetIds;
  delete result.assets;
  delete result.type;
  delete result.relatedChapter;
  delete result.targetType;
  
  return result;
}

/**
 * Associate targets with their respective chapters
 */
function associateTargets(chapters, targets) {
  const targetsByChapter = {};
  
  // Group targets by chapter
  for (const target of targets) {
    const chapterId = target.relatedChapter;
    if (!chapterId) continue;
    
    if (!targetsByChapter[chapterId]) {
      targetsByChapter[chapterId] = [];
    }
    
    // Transform target to match expected game.config.json format
    targetsByChapter[chapterId].push(transformTargetData(target));
  }
  
  // Associate targets with chapters
  for (const chapter of chapters) {
    chapter.targets = targetsByChapter[chapter.id] || [];
  }
  
  return chapters;
}

/**
 * Build the final config object
 */
function buildConfig() {
  // Read content types
  const chapters = readContentType('chapters');
  const targets = readContentType('targets');
  const steps = readContentType('steps');
  
  // Associate targets with chapters
  const chaptersWithTargets = associateTargets(chapters, targets);
  
  // Prepare mind-ar target images
  prepareTargetImages(chaptersWithTargets);
  
  const version = process.env.npm_package_version || "1.0.0";
  const config = {
    version: {
      version: version,
      timestamp: new Date().toISOString()
    },
    initialChapterId: chapters.length > 0 ? chapters[0].id : "chapter1",
    chapters: chaptersWithTargets,
    tutorial: steps
  };
  
  return config;
}

/**
 * Prepare target images for mind-ar processing
 * Copies all imageTargetSrc files to a mind-ar directory with chapter-specific subdirectories
 */
function prepareTargetImages(chapters) {
  const mindArDir = path.join(__dirname, '../../mind-ar');
  
  // Create mind-ar directory if it doesn't exist
  if (!fs.existsSync(mindArDir)) {
    fs.mkdirSync(mindArDir, { recursive: true });
  }
  
  // Process each chapter
  chapters.forEach(chapter => {
    const chapterDir = path.join(mindArDir, chapter.id);
    
    // Create chapter directory if it doesn't exist
    if (!fs.existsSync(chapterDir)) {
      fs.mkdirSync(chapterDir, { recursive: true });
    }
    
    // Process targets for this chapter
    if (chapter.targets && Array.isArray(chapter.targets)) {
      chapter.targets.forEach(target => {
        if (target.imageTargetSrc) {
          try {
            // Find the target directory by target ID
            const targetDir = path.join(CONTENT_DIR, 'targets', target.id);
            
            // Get the source file path
            let sourcePath = path.join(targetDir, target.imageTargetSrc);
            
            // Get the filename (without path)
            const filename = path.basename(sourcePath);
            const targetPath = path.join(chapterDir, filename);
            
            // Check if source file exists before attempting to copy
            if (fs.existsSync(sourcePath)) {
              // Copy the file to the target directory
              fs.copyFileSync(sourcePath, targetPath);
              console.log(`Copied target image: ${sourcePath} -> ${targetPath}`);
            } else {
              console.warn(`Target image not found: ${sourcePath}`);
            }
          } catch (error) {
            console.error(`Error copying target image for ${target.id}:`, error);
          }
        }
      });
    }
  });
  
  console.log(`Target images prepared in: ${mindArDir}`);
}

/**
 * Main function to generate the config file
 */
function generateConfigFile() {
  try {
    const config = buildConfig();
    
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`Successfully generated ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error generating config file:', error);
  }
}

// Execute the script
generateConfigFile();