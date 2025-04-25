export const chapter1 = /* html */`
<a-scene 
    id="scene" 
    mindar-image="imageTargetSrc: ./assets/content/chapters/chapter1/chapter1.mind; maxTrack: 4;" 
    color-space="sRGB" 
    renderer="colorManagement: true, physicallyCorrectLights" 
    vr-mode-ui="enabled: false" 
    device-orientation-permission-ui="enabled: false">
    <a-assets>
    <a-asset-item id="racoon" src="/assets/content/targets/target-001/racoon.glb"></a-asset-item>
    <a-asset-item id="tree" src="/assets/content/targets/target-002/tree.glb"></a-asset-item>
    <a-asset-item id="dragon" src="/assets/content/targets/target-005/dragon.glb"></a-asset-item>
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

    <a-entity id="target-000" mindar-image-target="targetIndex: 0">
    <a-text value="Shadows: Light plays a role in architecture" 
            color="#FFFFFF" 
            position="0 0 0" 
            rotation="0 0 0" 
            scale="0.5 0.5 0.5"
            id="chapter1-target-000-shadows-link"></a-text>
    <a-plane color="#000066" opacity="0.5" position="0 0 -0.01" width="2" height="0.5"></a-plane>
    </a-entity>
    
    <a-entity id="target-001" mindar-image-target="targetIndex: 1">
    <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#racoon" animation-mixer></a-gltf-model>
    </a-entity>
    
    <a-entity id="target-102" mindar-image-target="targetIndex: 2">
    <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#tree" animation-mixer></a-gltf-model>
    </a-entity>
    
    <a-entity id="target-005" mindar-image-target="targetIndex: 3">
    <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#dragon" animation-mixer></a-gltf-model>
    </a-entity>
    
</a-scene>
`