import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { validateContent, sortContent } from './utils/schema';

// ES6 modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, '../../content');
const OUTPUT_FILE = path.join(__dirname, '../../content/game.config.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.js');

// Load schema if available
let schemaModule = null;
try {
  if (fs.existsSync(SCHEMA_FILE)) {
    // Dynamic import for ES modules
    schemaModule = await import('./schema.js');
    console.log('Schema loaded successfully');
  }
} catch (error) {
  console.warn(`Warning: Could not load schema file: ${error.message}`);
}

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
 * Recursively find all YAML files in a directory
 */
function findYamlFiles(directory) {
  let results = [];
  
  try {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(directory, item.name);
      
      if (item.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findYamlFiles(itemPath));
      } else if (item.isFile() && (item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
        // Add YAML files to results
        results.push(itemPath);
      }
    }
  } catch (error) {
    console.error(`Error searching directory ${directory}:`, error);
  }
  
  return results;
}

/**
 * Read all YAML files and organize content by type
 */
function readContent() {
  const content = {
    chapters: [],
    targets: [],
    steps: []
  };
  
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`Content directory not found: ${CONTENT_DIR}`);
    return content;
  }

  // Find all YAML files in the content directory and its subdirectories
  const yamlFiles = findYamlFiles(CONTENT_DIR);
  
  // Process each YAML file
  for (const yamlFile of yamlFiles) {
    const data = parseYamlFile(yamlFile);
    
    if (!data.id) {
      data.id = path.basename(path.dirname(yamlFile));
    }
    
    try {
      // Validate against schema if available
      if (schemaModule) {
        const validatedData = validateContent(data, data.type);
        content[data.type].push(validatedData);
      } else {
        // Just add the data if no schema is available
        content[data.type].push(data);
      }
    } catch (error) {
      console.error(`Validation error in ${yamlFile}: ${error.message}`);
    }
  }

  // Sort content items
  if (schemaModule) {
    for (const [type, items] of Object.entries(content)) {
      content[type] = sortContent(items, type);
    }
  } else {
    // Sort all content types if no schema module is available
    for (const type in content) {
      content[type] = content[type].sort((a, b) => {
        if (a.title && b.title) {
          return a.title.localeCompare(b.title);
        }
        return (a.id || '').localeCompare(b.id || '');
      });
    }
  }
  
  return content;
} // Added the missing closing brace here

/**
 * Associate targets with their respective chapters or steps
 */
function associateTargets(content) {
  // Implementation for associating targets
  // (This function was called but not defined in the original code)
  // Placeholder implementation
  console.log('Associating targets with chapters and steps...');
}

/**
 * Build the final config object
 */
function buildConfig() {
  const content = readContent();
  associateTargets(content);
  
  const version = process.env.npm_package_version || "1.0.0";
  const config = {
    version: {
      version: version,
      timestamp: new Date().toISOString()
    },
    initialChapterId: content.chapters.length > 0 ? content.chapters[0].id : "chapter1",
    chapters: content.chapters,
    tutorial: content.steps
  };
  
  return config;
}

/**
 * Main function to generate the config file
 */
function generateConfigFile() {
  try {
    const config = buildConfig();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`Successfully generated ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error generating config file:', error);
  }
}

// Execute the script
generateConfigFile();