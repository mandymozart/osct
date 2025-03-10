// File: main.js
import { gameStore } from './gameStore.js';
import { initQRScanner } from './qrScanner.js';

// DOM Elements
let arMode = true; // Start in AR mode
let scene, qrScannerEl, toggleModeBtn;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI elements
  scene = document.querySelector('a-scene');
  qrScannerEl = document.getElementById('qr-scanner');
  toggleModeBtn = document.getElementById('toggle-mode');
  
  // Set scene in game store
  gameStore.setScene(scene);
  
  // Initialize QR scanner (but keep it hidden initially)
  initQRScanner(handleQRCodeScanned);
  
  // Mode toggle button
  toggleModeBtn.addEventListener('click', toggleMode);
  
  // Subscribe to game state changes
  gameStore.subscribe(handleStateChange);
  
  // Initialize with chapter 1 (or from saved state)
  const savedChapter = localStorage.getItem('currentChapter');
  if (savedChapter) {
    gameStore.switchChapter(savedChapter);
  } else {
    gameStore.switchChapter('chapter1');
  }
});

function toggleMode() {
  arMode = !arMode;
  
  if (arMode) {
    // Switch to AR mode
    qrScannerEl.style.display = 'none';
    scene.setAttribute('visible', 'true');
    scene.play(); // Resume A-Frame
    toggleModeBtn.textContent = 'Scan QR Code';
    
    // Resume AR tracking if we have a current chapter
    if (gameStore.state.currentChapter) {
      updateSceneWithChapter(gameStore.state.currentChapter);
    }
  } else {
    // Switch to QR scanning mode
    qrScannerEl.style.display = 'block';
    scene.setAttribute('visible', 'false');
    scene.pause(); // Pause A-Frame to save resources
    toggleModeBtn.textContent = 'Return to AR';
    
    // Start QR scanning
    startQRScanner();
  }
}

function handleQRCodeScanned(chapterId) {
  // Show confirmation dialog
  const confirmed = confirm(`Enter Chapter ${chapterId}?`);
  
  if (confirmed) {
    // Switch to the new chapter
    gameStore.switchChapter(chapterId);
    
    // Switch back to AR mode
    if (!arMode) {
      toggleMode();
    }
    
    // Save current chapter to localStorage
    localStorage.setItem('currentChapter', chapterId);
  }
}

function handleStateChange(state) {
  const { currentChapter } = state;
  
  if (currentChapter) {
    // Update loading state in UI
    updateLoadingUI(currentChapter);
    
    // If chapter is loaded, update the scene
    if (currentChapter.loaded && !currentChapter.isLoading) {
      updateSceneWithChapter(currentChapter);
    }
    
    // Handle any errors
    if (currentChapter.error) {
      showError(currentChapter.error);
    }
  }
}

function updateSceneWithChapter(chapter) {
  // Only proceed if we're in AR mode
  if (!arMode) return;
  
  // Clear existing entities
  const existingEntities = scene.querySelectorAll('[ar-entity]');
  existingEntities.forEach(entity => entity.parentNode.removeChild(entity));
  
  // Update mind-ar targets
  scene.setAttribute('mindar-image', `imageTargetSrc: ${chapter.targetFile}`);
  
  // Create new entities for each target
  chapter.targets.forEach((target, index) => {
    const targetEntity = document.createElement('a-entity');
    targetEntity.setAttribute('mindar-image-target', `targetIndex: ${index}`);
    targetEntity.setAttribute('ar-entity', '');
    
    // Create child entities based on target.entity
    target.entity.components.forEach(component => {
      const entity = document.createElement(component.type);
      
      // Set all attributes from component
      Object.entries(component.attributes).forEach(([key, value]) => {
        entity.setAttribute(key, value);
      });
      
      // Reference assets by ID if needed
      if (component.assetId && component.assetAttribute) {
        entity.setAttribute(component.assetAttribute, `#${component.assetId}`);
      }
      
      targetEntity.appendChild(entity);
    });
    
    scene.appendChild(targetEntity);
  });
}

function updateLoadingUI(chapter) {
  const loadingEl = document.getElementById('loading-overlay');
  
  if (chapter.isLoading) {
    loadingEl.style.display = 'flex';
    loadingEl.querySelector('p').textContent = `Loading Chapter ${chapter.id}...`;
  } else {
    loadingEl.style.display = 'none';
  }
}

function showError(error) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = `Error: ${error.msg}`;
  errorEl.style.display = 'block';
  
  // Hide after 5 seconds
  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 5000);
}