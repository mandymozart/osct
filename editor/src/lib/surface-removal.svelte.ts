/**
 * A surface's removal asked for from the Tree (a surface row's menu, Delete on its row, #337): the surface is selected
 * and its Inspector (`SurfaceView`) shows the confirmation that names what lies on it – nothing is removed before it is
 * confirmed there. An ask waits until the surface's Inspector takes it.
 */
class SurfaceRemovalRequests {
  asked = $state<{ scene: string; surface: string } | null>(null);

  ask(sceneId: string, surfaceId: string): void {
    this.asked = { scene: sceneId, surface: surfaceId };
  }

  /** Whether the ask is for this surface – taken when it is */
  take(sceneId: string, surfaceId: string): boolean {
    const asked = this.asked;
    if (!asked || asked.scene !== sceneId || asked.surface !== surfaceId) return false;
    this.asked = null;
    return true;
  }
}

export const surfaceRemoval = new SurfaceRemovalRequests();
