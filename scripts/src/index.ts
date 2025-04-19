import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { projectRoot,CONTENT_DIR, OUTPUT_FILE, MINDAR_DIR } from './config';

// Import types from main project
import type {
  AssetContent,
  BaseContent,
  ChapterContent,
  StepContent,
  TargetContent
} from './types/content';

import type {
  AssetData,
  GameConfiguration,
  TargetData
} from './types/game';

console.log('Project root:', projectRoot);
console.log('Content directory:', CONTENT_DIR);
console.log('Output file:', OUTPUT_FILE);
console.log('MindAR directory:', MINDAR_DIR);

// Check if directories exist to help with debugging
console.log('Content directory exists:', fs.existsSync(CONTENT_DIR));
console.log('Content/chapters exists:', fs.existsSync(path.join(CONTENT_DIR, 'chapters')));
console.log('Content/targets exists:', fs.existsSync(path.join(CONTENT_DIR, 'targets')));

// Extended interfaces to track file paths and metadata
interface MetadataFields {
  _filePath?: string;
  _folderPath?: string;
  _folderName?: string;
  _originalId?: string;
  _sourcePath?: string;
  assetIds?: string[];
}

// Use type intersections to combine content and metadata
type ChapterWithMetadata = ChapterContent & MetadataFields;
type TargetWithMetadata = TargetContent & MetadataFields;
type StepWithMetadata = StepContent & MetadataFields;
type AssetWithMetadata = AssetContent & MetadataFields;
type ContentWithMetadata = BaseContent & MetadataFields;

// TODO: Add schema validation

/**
 * Convert a string or array value to an array
 * This is used for tags, relatedTargets, assets, etc.
 */
function ensureArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Recursively delete a directory
 */
function deleteFolderRecursive(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursive call for directories
        deleteFolderRecursive(curPath);
      } else {
        // Delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

/**
 * Read all content files from the content directory
 */
function readContentFiles(): ContentWithMetadata[] {
  const result: ContentWithMetadata[] = [];
  const targetIDs = new Set<string>(); // Track target IDs to detect duplicates
  
  // Read chapters from subdirectories
  const chaptersDir = path.join(CONTENT_DIR, 'chapters');
  if (fs.existsSync(chaptersDir)) {
    // Get all subdirectories in chapters directory
    const chapterDirs = fs.readdirSync(chaptersDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Process each chapter subdirectory
    for (const chapterDir of chapterDirs) {
      const chapterPath = path.join(chaptersDir, chapterDir);
      const chapterFile = path.join(chapterPath, 'chapter.yaml');
      
      if (fs.existsSync(chapterFile)) {
        try {
          const content = fs.readFileSync(chapterFile, 'utf8');
          const data = yaml.load(content) as ChapterWithMetadata;
          
          // Store file path in the data for reference
          data._filePath = chapterFile;
          
          if (data) {
            // Ensure type is set to chapter
            data.type = 'chapter';
            
            // If id is not set, use the directory name
            if (!data.id) {
              data.id = chapterDir;
            }
            
            result.push(data);
          }
        } catch (error) {
          console.error(`Error reading chapter file ${chapterFile}:`, error);
        }
      }
    }
  }
  
  // Read targets and their assets
  const targetsDir = path.join(CONTENT_DIR, 'targets');
  if (fs.existsSync(targetsDir)) {
    const targetFolders = fs.readdirSync(targetsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    for (const folder of targetFolders) {
      const targetFolder = path.join(targetsDir, folder);
      
      // Look for target.yaml file
      const targetFile = path.join(targetFolder, 'target.yaml');
      if (fs.existsSync(targetFile)) {
        try {
          const content = fs.readFileSync(targetFile, 'utf8');
          const targetData = yaml.load(content) as TargetWithMetadata;
          
          // Store file path and folder path in the data for reference
          targetData._filePath = targetFile;
          targetData._folderPath = targetFolder;
          targetData._folderName = folder; // Store folder name for future reference
          
          if (targetData && targetData.type === 'target') {
            // Check for duplicate target IDs
            if (targetIDs.has(targetData.id)) {
              console.warn(`WARNING: Duplicate target ID detected: ${targetData.id} in ${targetFolder}`);
              console.warn(`To ensure correct processing, the folder name ${folder} will be appended to the ID.`);
              
              // Generate a unique ID by appending the folder name to the target ID
              targetData._originalId = targetData.id; // Store the original ID for reference
              targetData.id = `${targetData.id}-${folder}`;
              console.log(`Target ID has been modified to: ${targetData.id}`);
            }
            
            // Add to tracked IDs
            targetIDs.add(targetData.id);
            
            // Look for asset files in the same folder
            const assetFiles = fs.readdirSync(targetFolder)
              .filter(file => (file.endsWith('.asset.yaml') || file.endsWith('.asset.yml')));
            
            // Initialize arrays for assets
            const assetObjects: AssetWithMetadata[] = [];
            targetData.assetIds = [];
            
            if (assetFiles.length > 0) {
              for (const assetFile of assetFiles) {
                try {
                  const assetPath = path.join(targetFolder, assetFile);
                  const assetContent = fs.readFileSync(assetPath, 'utf8');
                  const assetData = yaml.load(assetContent) as AssetWithMetadata;
                  
                  // Store file path in the asset data for reference
                  assetData._filePath = assetPath;
                  
                  if (assetData && assetData.type === 'asset') {
                    assetObjects.push(assetData);
                    
                    // Add ID to assetIds array
                    if (assetData.id && !targetData.assetIds.includes(assetData.id)) {
                      targetData.assetIds.push(assetData.id);
                    }
                  }
                } catch (error) {
                  console.error(`Error reading asset file ${assetFile}:`, error);
                }
              }
            }
            
            // TODO: this can be handled by schema validation and type conversion
            // If the target has a comma-separated assets field, convert it to an array
            if (typeof targetData.assets === 'string') {
              targetData.assetIds = ensureArray(targetData.assets);
            } else if (Array.isArray(targetData.assets) && targetData.assets.length > 0 && typeof targetData.assets[0] === 'string') {
              targetData.assetIds = targetData.assets as string[];
            } else {
              // Initialize empty array if nothing else
              targetData.assetIds = targetData.assetIds || [];
            }
            
            // Store asset metadata objects separately for transformation
            (targetData as any)._assetObjects = assetObjects;
            
            result.push(targetData);
          }
        } catch (error) {
          console.error(`Error reading target file in ${folder}:`, error);
        }
      }
    }
  }
  
  // Read tutorial steps from subdirectories
  const stepsDir = path.join(CONTENT_DIR, 'steps');
  if (fs.existsSync(stepsDir)) {
    // Get all subdirectories in steps directory
    const stepDirs = fs.readdirSync(stepsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Process each step subdirectory
    for (const stepDir of stepDirs) {
      const stepPath = path.join(stepsDir, stepDir);
      const stepFile = path.join(stepPath, 'step.yaml');
      
      if (fs.existsSync(stepFile)) {
        try {
          const content = fs.readFileSync(stepFile, 'utf8');
          const data = yaml.load(content) as StepWithMetadata;
          
          // Store file path in the data for reference
          data._filePath = stepFile;
          
          if (data) {
            // Ensure type is set to step
            data.type = 'step';
            
            // If id is not set, use the directory name
            if (!data.id) {
              data.id = stepDir;
            }
            
            result.push(data);
          }
        } catch (error) {
          console.error(`Error reading step file ${stepFile}:`, error);
        }
      }
    }
  }
  
  return result;
}

/**
 * Transform target data to match the expected format for game.config.json
 */
function transformTargetData(target: TargetWithMetadata): TargetData {
  // Deep clone to avoid modifying original
  const result = { ...target } as any;
  
  // Create entity structure expected by GameConfiguration
  result.entity = {
    type: result.targetType || 'basic',
    assets: [] as AssetData[] // Initialize with empty array
  };
  
  // Convert order to mindarTargetIndex - this is temporary and will be replaced with sequential indices later
  result.mindarTargetIndex = result.order || 0;
  
  // Use assetIds for entity.assets if available, otherwise just include empty assets array
  if (result.assetIds && Array.isArray(result.assetIds)) {
    // Map asset IDs to their corresponding asset files
    
    // Find all relevant asset files
    if (result._assetObjects && Array.isArray(result._assetObjects)) {
      for (const assetId of result.assetIds) {
        // Find the corresponding asset file
        const assetFile = result._assetObjects.find((asset: AssetContent) => asset.id === assetId);
        
        // Add the asset to entity.assets
        if (assetFile) {
          const assetData: AssetData = {
            id: assetFile.id,
            type: assetFile.type,
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
      result.entity.assets = result.assetIds.map((assetId: string) => ({ id: assetId }));
    }
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
  delete result.order; // Remove order since we've converted it to mindarTargetIndex
  
  // IMPORTANT: DO NOT remove metadata properties yet - they are needed for the prepareTargetImages function
  // These properties will be removed after the images are processed
  
  return result as TargetData;
}

/**
 * Associate targets with their respective chapters
 */
function associateTargets(chapters: ChapterWithMetadata[], targets: TargetWithMetadata[]): ChapterWithMetadata[] {
  const targetsByChapter: Record<string, TargetData[]> = {};
  
  // Group targets by chapter
  for (const target of targets) {
    const chapterId = target.relatedChapter;
    if (!chapterId) {
      console.warn(`Target ${target.id} has no relatedChapter, skipping...`);
      continue;
    }
    
    if (!targetsByChapter[chapterId]) {
      targetsByChapter[chapterId] = [];
    }
    
    targetsByChapter[chapterId].push(transformTargetData(target));
  }
  
  // Associate targets with chapters and assign proper sequential mindarTargetIndex
  for (const chapter of chapters) {
    // Get targets for this chapter
    const chapterTargets = targetsByChapter[chapter.id] || [];
    
    // Sort targets by their original order/mindarTargetIndex
    chapterTargets.sort((a, b) => a.mindarTargetIndex - b.mindarTargetIndex);
    
    // Now, REPLACE the mindarTargetIndex with sequential indices (0, 1, 2...)
    // This ensures we don't have gaps in the sequence
    for (let i = 0; i < chapterTargets.length; i++) {
      // Explicitly set the index to ensure proper sequencing
      chapterTargets[i].mindarTargetIndex = i;
    }
    
    // Assign the sorted and reindexed targets to the chapter
    (chapter as any).targets = chapterTargets;
  }
  
  return chapters;
}

/**
 * Prepare target images for mind-ar processing
 * Copies all imageTargetSrc files to a mind-ar directory with chapter-specific subdirectories
 * Filters out targets with missing image files
 */
function prepareTargetImages(chapters: ChapterWithMetadata[]): ChapterWithMetadata[] {
  // Clean the mind-ar directory if it exists
  if (fs.existsSync(MINDAR_DIR)) {
    console.log(`Cleaning mind-ar directory at: ${MINDAR_DIR}`);
    deleteFolderRecursive(MINDAR_DIR);
  }
  
  // Create mind-ar directory
  fs.mkdirSync(MINDAR_DIR, { recursive: true });
  
  // Process each chapter
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterDir = path.join(MINDAR_DIR, chapter.id);
    
    // Create chapter directory if it doesn't exist
    if (!fs.existsSync(chapterDir)) {
      fs.mkdirSync(chapterDir, { recursive: true });
    }
    
    // Process targets for this chapter
    if ((chapter as any).targets && Array.isArray((chapter as any).targets)) {
      // Filter targets to only include those with imageTargetSrc specified
      const targetsWithImages = (chapter as any).targets.filter((target: any) => target.imageTargetSrc);
      
      console.log(`DEBUG: Chapter ${chapter.id} has ${targetsWithImages.length} targets with imageTargetSrc`);
      
      // First pass: Check which targets have valid image files
      const validTargets: any[] = [];
      
      for (const target of targetsWithImages) {
        console.log(`\nDEBUG: Processing target ${target.id} with imageTargetSrc: ${target.imageTargetSrc}`);
        // Print all available metadata to help debug
        console.log(`DEBUG: Target metadata:
- _filePath: ${target._filePath || 'undefined'}
- _folderPath: ${target._folderPath || 'undefined'}
- _folderName: ${target._folderName || 'undefined'}
- _originalId: ${target._originalId || 'undefined'}`);
        
        // Determine the correct source path for the image
        let sourcePath: string | null = null;
        
        // PRIMARY METHOD: Look for the image file in the same directory as the target.yaml file
        if (target._filePath) {
          const targetDir = path.dirname(target._filePath);
          const potentialPath = path.join(targetDir, target.imageTargetSrc);
          console.log(`DEBUG: Trying path relative to target.yaml: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        // FALLBACK 1: If target has _folderPath defined, use that
        if (!sourcePath && target._folderPath) {
          const potentialPath = path.join(target._folderPath, target.imageTargetSrc);
          console.log(`DEBUG: Trying path relative to folderPath: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        // FALLBACK 2: Use folder name if available
        if (!sourcePath && target._folderName) {
          const targetDir = path.join(CONTENT_DIR, 'targets', target._folderName);
          const potentialPath = path.join(targetDir, target.imageTargetSrc);
          console.log(`DEBUG: Trying path using folderName: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        // FALLBACK 3: Try using the target ID (least reliable)
        if (!sourcePath) {
          const originalId = target._originalId || target.id;
          // If the ID has been modified due to duplication, extract the original folder name
          const folderName = target.id.includes('-') 
            ? target.id.split('-').pop() 
            : originalId;
          const targetDir = path.join(CONTENT_DIR, 'targets', folderName);
          const potentialPath = path.join(targetDir, target.imageTargetSrc);
          console.log(`DEBUG: Trying path using target ID: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        // FALLBACK 4: Check directly in targets directory (might be a legacy format)
        if (!sourcePath) {
          const potentialPath = path.join(CONTENT_DIR, 'targets', target.imageTargetSrc);
          console.log(`DEBUG: Trying direct path in targets directory: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        // FALLBACK 5: Try the content root directly
        if (!sourcePath) {
          const potentialPath = path.join(CONTENT_DIR, target.imageTargetSrc);
          console.log(`DEBUG: Trying path in content root: ${potentialPath}`);
          if (fs.existsSync(potentialPath)) {
            console.log(`DEBUG: SUCCESS - Image found at: ${potentialPath}`);
            sourcePath = potentialPath;
          } else {
            console.log(`DEBUG: File does not exist at ${potentialPath}`);
          }
        }
        
        if (sourcePath) {
          // This target has a valid image file
          validTargets.push({
            ...target,
            _sourcePath: sourcePath // Store the full source path for later use
          });
        } else {
          console.warn(`Target ${target.id} excluded: Image file not found. Tried all possible locations.`);
        }
      }
      
      // Second pass: Process valid targets and assign sequential indices
      for (let j = 0; j < validTargets.length; j++) {
        const target = validTargets[j];
        try {
          // Get the source file path (already verified to exist)
          const sourcePath = target._sourcePath as string;
          
          // Get the filename parts
          const fileExt = path.extname(target.imageTargetSrc!);
          const fileBaseName = path.basename(target.imageTargetSrc!, fileExt);
          
          // Use sequential index for the filename prefix
          const sequencePrefix = String(j);
          
          // Create the new filename with the prefix
          const newFileName = `${sequencePrefix}-${fileBaseName}${fileExt}`;
          const targetPath = path.join(chapterDir, newFileName);
          
          // Copy the file to the target directory with the new filename
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`Copied target image: ${sourcePath} -> ${targetPath} (mindarTargetIndex: ${j})`);
          
          // Update the target's mindarTargetIndex to match the file sequence
          target.mindarTargetIndex = j;
          
          // Remove temporary properties before final output
          delete target._sourcePath;
          delete target._filePath;
          delete target._folderPath;
          delete target._originalId;
          delete target._folderName;
        } catch (error) {
          console.error(`Error copying target image for ${target.id}:`, error);
        }
      }
      
      // IMPORTANT: Replace the chapter's targets array with only the valid targets
      (chapter as any).targets = validTargets;
    }
  }
  
  // Clean up internal properties before returning
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    delete chapter._filePath;
    if ((chapter as any).targets) {
      for (let j = 0; j < (chapter as any).targets.length; j++) {
        const target = (chapter as any).targets[j];
        delete target._filePath;
        delete target._folderPath;
        delete target._originalId;
        delete target._folderName;
      }
    }
  }
  
  console.log(`Target images prepared in: ${MINDAR_DIR}`);
  return chapters;
}

/**
 * Clean up an object by removing all properties with underscore prefix
 * This ensures no private metadata ends up in the final config
 */
function cleanupObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanupObject(item));
  }
  
  const result = { ...obj };
  
  // Remove all properties with underscore prefix
  for (const key of Object.keys(result)) {
    if (key.startsWith('_')) {
      delete result[key];
    } else if (typeof result[key] === 'object') {
      // Recursively clean nested objects
      result[key] = cleanupObject(result[key]);
    }
  }
  
  return result;
}

/**
 * Build the final config object
 */
function buildConfig(): GameConfiguration {
  // Read content types
  const content = readContentFiles();
  const chapters = content.filter(item => item.type === 'chapter') as ChapterWithMetadata[];
  const targets = content.filter(item => item.type === 'target') as TargetWithMetadata[];
  const steps = content.filter(item => item.type === 'step') as StepWithMetadata[];
  
  console.log(`Found ${chapters.length} chapters, ${targets.length} targets, and ${steps.length} steps`);
  
  if (chapters.length === 0) {
    console.error('ERROR: No chapters found! Check your content/chapters directory.');
    console.log('Content items found:', content.map(item => `${item.type}: ${item.id}`).join(', '));
  }
  
  // Associate targets with chapters
  const chaptersWithTargets = associateTargets(chapters, targets);
  
  // Prepare mind-ar target images
  const processedChapters = prepareTargetImages(chaptersWithTargets);
  
  console.log(`Final config will have ${processedChapters.length} chapters and ${targets.length} targets`);
  
  const versionStr = process.env.npm_package_version || "1.0.0";
  const timestamp = new Date().toISOString();
  
  // Create configuration object with version information
  // We need to use type assertion because the GameConfiguration interface 
  // expects version to be a string, but the actual app expects it to be an object
  const configData: any = {
    version: {
      version: versionStr,
      timestamp: timestamp
    },
    initialChapterId: processedChapters.length > 0 ? processedChapters[0].id : "chapter1",
    chapters: processedChapters.map(chapter => {
      // Remove type field from chapter
      const { type, ...chapterData } = chapter;
      return chapterData;
    }),
    tutorial: steps.map(step => {
      // Remove type field from step
      const { type, ...stepData } = step;
      return stepData;
    })
  };
  
  // Final cleanup to remove any leftover private properties
  const config = cleanupObject(configData) as GameConfiguration;
  return config;
}

/**
 * Main function to generate the config file
 */
function generateConfigFile(): void {
  try {
    // Generate the config
    const config = buildConfig();
    
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`Successfully generated ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error generating config file:', error);
    process.exit(1);
  }
}

// Execute the script
generateConfigFile();
