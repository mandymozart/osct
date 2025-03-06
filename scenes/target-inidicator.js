// UI component to show which targets are currently visible

document.addEventListener('DOMContentLoaded', () => {
    // Setup target indicator UI
    const targetIndicator = document.getElementById('target-indicator');
    
    if (targetIndicator) {
      // Subscribe to game state changes to update indicator
      gameStore.subscribe(state => {
        const { trackedTargets, currentChapter } = state;
        
        // Only update if we have a chapter and are in AR mode
        if (currentChapter && arMode) {
          updateTargetIndicator(trackedTargets, currentChapter);
        }
      });
    }
  });
  
  function updateTargetIndicator(trackedTargets, currentChapter) {
    const targetIndicator = document.getElementById('target-indicator');
    
    // Clear previous indicators
    targetIndicator.innerHTML = '';
    
    if (trackedTargets.length === 0) {
      // No targets in view
      targetIndicator.innerHTML = '<div class="no-target">Looking for targets...</div>';
      return;
    }
    
    // Create indicator for each visible target
    trackedTargets.forEach(targetIndex => {
      const target = currentChapter.targets[targetIndex];
      if (!target) return;
      
      const targetElement = document.createElement('div');
      targetElement.className = 'target-item';
      targetElement.innerHTML = `
        <div class="target-icon">👁️</div>
        <div class="target-name">${target.name || `Target ${targetIndex + 1}`}</div>
      `;
      
      targetIndicator.appendChild(targetElement);
    });
  }
  