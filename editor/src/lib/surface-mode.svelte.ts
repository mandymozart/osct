import type { SurfaceGizmoMode } from "./stage/surface-gizmo";

/**
 * The Surface mode's own setting (#314): whether the surface gizmo of a free scene moves or turns the selected surface –
 * chosen in the Inspector's surface section, read by the workspace page, which hands it to the stage
 */
class SurfaceMode {
  gizmo = $state<SurfaceGizmoMode>("translate");
}

export const surfaceMode = new SurfaceMode();
