/**
 * A scene's removal asked for (#319): the Inspector's scene section and the Scenes panel's card menu ask, the scene
 * workspace runs it – the API's two steps (`DELETE …/scenes/{id}`: first the impact, shown in the Inspector with its
 * warnings, then the removal with the confirmation id), as an entry's removal (#198). `asked` counts the asks, so the
 * same scene asked twice still starts again.
 */
class SceneRemovalRequests {
  scene = $state<string | null>(null);
  asked = $state(0);

  ask(sceneId: string): void {
    this.scene = sceneId;
    this.asked++;
  }
}

export const sceneRemoval = new SceneRemovalRequests();
