// Register the target click handler component
AFRAME.registerComponent('bookgame-index-target', {
    schema: {
        targetId: { type: 'string', default: '' }
    },
    
    
    init: function () {
        // Store reference to the component context
        const self = this;
        this.el.setAttribute("class", "interactable"); // This makes the object targetable by the cursor-targetting-system
        this.el.setAttribute("is-remote-hover-target", ""); // Required otherwise no interaction event (tested with mouse cursor)
        this.el.setAttribute("tags", { singleActionButton: true }); // Crucial
        this.onClick = () => {
        console.log('click handler called');
        };
        console.log('AFRAME: register bookgame-index-target',self)
        // Create the click handler as a bound method
        const  clickHandler = function(event:Event) {
            console.log('click handler called');
            // if (!window.BOOKGAME) {
            //     console.error('Game instance not available (window.BOOKGAME)');
            //     return;
            // }
            
            // const targetId = self.data.targetId;
            // console.log(`Target clicked: ${targetId}`);
            
            // // Update the game state with the active target
            // window.BOOKGAME.update(draft => {
            //     draft.activeTarget = targetId;
            // });
            
            // // Navigate to target route
            // window.BOOKGAME.router.navigate('/index', { key: 'id', value: targetId });
            
            // // Prevent event bubbling
            // event.stopPropagation();
        };
        
        // Add click event listener to the entity
        this.el.addEventListener('click', clickHandler);
    },
    
    remove: function () {
        // Clean up event listener when component is removed
        const clickHandler = function() {
            console.log("removing click handler");
        };
        this.el.removeEventListener('click', clickHandler);
    }
});

// Register the clickable component
AFRAME.registerComponent('bookgame-clickable', {
    init: function() {
        console.log('AFRAME: register bookgame-clickable',this)
        // Add clickable class for raycaster detection
        this.el.classList.add('clickable');
        
        // Optional: Add visual feedback
        this.el.addEventListener('mouseenter', () => {
          // Scale slightly to show it's interactive
          const currentScale = this.el.getAttribute('scale') || {x: 1, y: 1, z: 1};
          this.el.setAttribute('scale', {
            x: currentScale.x * 1.05,
            y: currentScale.y * 1.05,
            z: currentScale.z * 1.05
          });
        });
        
        this.el.addEventListener('mouseleave', () => {
          // Return to original scale
          const currentScale = this.el.getAttribute('scale') || {x: 1, y: 1, z: 1};
          this.el.setAttribute('scale', {
            x: currentScale.x / 1.05,
            y: currentScale.y / 1.05,
            z: currentScale.z / 1.05
          });
        });
      }
});