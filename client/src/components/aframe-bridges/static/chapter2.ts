export const chapter2 = /* html */`
<a-scene 
    id="scene" 
    mindar-image="imageTargetSrc: ./assets/content/chapters/chapter2/chapter2.mind; maxTrack: 4;" 
    color-space="sRGB" 
    renderer="colorManagement: true, physicallyCorrectLights" 
    vr-mode-ui="enabled: false" 
    device-orientation-permission-ui="enabled: false">
    <a-assets>
      <a-asset-item id="castle" src="/assets/content/targets/target-003/castle.glb"></a-asset-item>
      <a-asset-item id="cardboard-boxes" src="/assets/content/targets/target-004/cardboard-boxes.glb"></a-asset-item>
      <a-asset-item id="treasure" src="/assets/content/targets/target-006/treasure.glb"></a-asset-item>
      <video id="bunny-video" src="/assets/content/targets/target-007/bunny.mp4" preload="auto" loop crossorigin="anonymous"></video>
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

    <a-entity id="target-003" mindar-image-target="targetIndex: 0">
      <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#castle" animation-mixer></a-gltf-model>
    </a-entity>
    
    <a-entity id="target-004" mindar-image-target="targetIndex: 1">
      <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#cardboard-boxes" animation-mixer></a-gltf-model>
    </a-entity>
    
    <a-entity id="target-006" mindar-image-target="targetIndex: 2">
      <a-gltf-model rotation="0 0 0" position="0 -0.25 0" scale="0.5 0.5 0.5" src="#treasure" animation-mixer></a-gltf-model>
    </a-entity>
    
    <a-entity id="target-007" mindar-image-target="targetIndex: 3">
      <a-video src="#bunny-video" width="1" height="0.552" position="0 0 0"></a-video>
    </a-entity>
</a-scene>
`
