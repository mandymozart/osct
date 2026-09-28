import fs from 'fs';
import path from 'path';
import { CLIENT_PUBLIC_ASSETS_DIR, CONTENT_DIR, MIND_HASH_SUFFIX } from '../config';

export function deleteFolderRecursive(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

/**
 * Recursively copy a directory
 * @returns Number of files copied
 */
export function copyFolderRecursive(source: string, target: string): number {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  let fileCount = 0;
  for (const file of fs.readdirSync(source)) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    if (fs.statSync(sourcePath).isDirectory()) {
      fileCount += copyFolderRecursive(sourcePath, targetPath);
    } else if (file.endsWith(`.mind${MIND_HASH_SUFFIX}`)) {
      continue; // build bookkeeping, not loaded by the app
    } else {
      fs.copyFileSync(sourcePath, targetPath);
      fileCount++;
    }
  }
  return fileCount;
}

/**
 * Copy the content directory to the client's public assets directory
 */
export function copyContentToPublic(): void {
  console.log(`\n📦 Copying content to client public assets directory...`);
  if (fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
    console.log(`🧹 Cleaning client public assets directory: ${CLIENT_PUBLIC_ASSETS_DIR}`);
    deleteFolderRecursive(CLIENT_PUBLIC_ASSETS_DIR);
  }
  fs.mkdirSync(CLIENT_PUBLIC_ASSETS_DIR, { recursive: true });
  const fileCount = copyFolderRecursive(CONTENT_DIR, CLIENT_PUBLIC_ASSETS_DIR);
  console.log(`✅ ${fileCount} content files successfully copied to: ${CLIENT_PUBLIC_ASSETS_DIR}`);
}

/**
 * List all files below a directory (sorted, relative paths with forward slashes)
 */
export function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(dirent => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? listFiles(fullPath, base) : [path.relative(base, fullPath).split(path.sep).join('/')];
    })
    .sort();
}
