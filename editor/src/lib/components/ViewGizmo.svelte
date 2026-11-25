<script lang="ts">
  import { onMount } from "svelte";
  import type { AxisView } from "#lib/stage/preview.js";
  import { ballAt, clickedView, gizmoBalls, type GizmoBall } from "#lib/stage/view-gizmo.js";

  /**
   * The stage's view gizmo (#369, Blender's): the stage's axes as the camera sees them, floating over the stage – no frame,
   * no hover state (Tilman). A click on a ball snaps the camera to that view (the ball already facing you: the opposite),
   * a drag on it orbits. It follows the camera every frame (`turn`, flights and drags included).
   */
  let { turn, current, onsnap, onorbit }: {
    /** The camera's direction now (degrees); null before the stage runs */
    turn: () => { tilt: number; yaw: number } | null;
    /** The view the camera is snapped to (null: none) */
    current: AxisView | null;
    onsnap: (view: AxisView) => void;
    onorbit: (dx: number, dy: number) => void;
  } = $props();

  /** The stage's own axis colours (`mock-stage.ts`): x red, y green, z blue */
  const COLOURS = { x: "#e5484d", y: "#30a46c", z: "#2d7ff9" } as const;
  /** The gizmo's size (px), the axes' reach and the balls' radius in its units (−1…1 = the reach) */
  const SIZE = 80;
  const REACH = 30;
  const BALL = 8;
  const DRAG_PX = 3;

  let balls = $state<GizmoBall[]>(gizmoBalls(30, 0));
  let seen = "";
  let svg = $state<SVGSVGElement>();
  let press: { id: number; x: number; y: number; dragged: boolean } | null = null;
  let grabbing = $state(false);

  onMount(() => {
    let frame = 0;
    const step = () => {
      const now = turn();
      const key = now ? `${now.tilt.toFixed(2)}:${now.yaw.toFixed(2)}` : "";
      if (now && key !== seen) {
        seen = key;
        balls = gizmoBalls(now.tilt, now.yaw);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    svg?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragged && Math.hypot(dx, dy) < DRAG_PX) return;
    press.dragged = true;
    grabbing = true;
    onorbit(dx, dy);
    press.x = event.clientX;
    press.y = event.clientY;
  };
  const up = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId) return;
    const clicked = !press.dragged;
    press = null;
    grabbing = false;
    if (!clicked || !svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * SIZE;
    const ball = ballAt(balls, (x - SIZE / 2) / REACH, (y - SIZE / 2) / REACH, (BALL + 2) / REACH);
    if (ball) onsnap(clickedView(ball, current));
  };
  const label = (ball: GizmoBall) => `${ball.view[0].toUpperCase()}${ball.view.slice(1)}`;
</script>

<svg bind:this={svg} class="view-gizmo" class:grabbing data-app-ui width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" role="group" aria-label="View gizmo"
  data-help-name="View gizmo" data-help="The stage's axes as the camera sees them (x red, y green, z blue). A click on a ball turns the camera to look from there – Z from the top, −Y from the front, X from the right – in orthographic; a click on the ball already facing you turns it to the opposite side. A drag on the gizmo orbits. Orbiting away goes back to perspective, unless ortho was switched on by hand."
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  {#each balls as ball (ball.axis + ball.positive)}
    {@const cx = SIZE / 2 + ball.x * REACH}
    {@const cy = SIZE / 2 + ball.y * REACH}
    {#if ball.positive}
      <line x1={SIZE / 2} y1={SIZE / 2} x2={cx} y2={cy} stroke={COLOURS[ball.axis]} stroke-width="2" />
      <circle {cx} {cy} r={BALL} fill={COLOURS[ball.axis]}><title>{label(ball)}</title></circle>
      <text x={cx} y={cy + 3.5} text-anchor="middle" class="letter">{ball.axis.toUpperCase()}</text>
    {:else}
      <circle {cx} {cy} r={BALL - 1.5} fill="var(--surface)" fill-opacity=".6" stroke={COLOURS[ball.axis]} stroke-width="1.5"><title>{label(ball)}</title></circle>
    {/if}
  {/each}
</svg>

<style>
  /* No frame and no hover state (#369, Tilman): only the axes over the stage; the pointer says it can be dragged */
  .view-gizmo { display: block; cursor: grab; touch-action: none; user-select: none; }
  .view-gizmo.grabbing { cursor: grabbing; }
  .letter { font: 600 10px/1 var(--font, sans-serif); fill: #fff; pointer-events: none; }
</style>
