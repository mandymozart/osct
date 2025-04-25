export const chapter3 = /* html */`
<a-scene 
    id="scene" 
    mindar-image="imageTargetSrc: ./assets/content/chapters/chapter3/chapter3.mind; maxTrack: 2;" 
    color-space="sRGB" 
    renderer="colorManagement: true, physicallyCorrectLights" 
    vr-mode-ui="enabled: false" 
    device-orientation-permission-ui="enabled: false">
    <a-assets>
      <video id="edge" src="/assets/content/targets/target-008/edge.mp4" preload="auto" loop crossorigin="anonymous"></video>
      <video id="sploosh" src="/assets/content/targets/target-009/sploosh.webm" preload="auto" loop crossorigin="anonymous"></video>
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

    <a-entity id="target-008" mindar-image-target="targetIndex: 0">
      <a-video src="#edge" width="1" height="0.552" position="0 0 0"></a-video>
    </a-entity>
    
    <a-entity id="target-009" mindar-image-target="targetIndex: 1">
      <a-video src="#sploosh" width="1" height="0.552" position="0 0 0"></a-video>
    </a-entity>
</a-scene>
`
