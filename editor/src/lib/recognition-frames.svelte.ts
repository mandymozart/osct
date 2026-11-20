import { contentUrl, getTarget } from "@engine/content/game-config";
import { errorText, putTarget } from "./api";
import { content } from "./content.svelte.js";
import { entries } from "./entries.svelte.js";
import { library } from "./library.svelte.js";
import { decodePrintedImage, frameFile, frameOfPixels, recognitionDataOf } from "./recognition-frame";

/** What the editor is doing with a target's recognition frame */
export interface FrameStatus {
  state: "making" | "failed";
  /** Why it failed – shown quietly next to the action, which retries */
  message?: string;
}

/** A target as the frame needs it: its id, its printed image as the draft holds it (unresolved), and whether it has a frame */
export interface FrameTarget {
  id: string;
  imageSrc: string;
  recognition?: unknown;
}

/**
 * The editor makes a target's recognition frame by itself (#306) – when a target gets a printed image (an upload, the
 * Library's Use, a new target) or is placed on a surface and has no frame yet – and on the Inspector's *Make
 * recognition frame* / *Remake*. In the browser, from the same builder as `osct targets prepare` (`recognition-frame.ts`),
 * uploaded as a Library file and stored with the target (`PUT …/targets/{id} { recognition, madeFrom }` – 409
 * stale-image when the image changed meanwhile). It never blocks or fails the target's own change and never touches
 * its image: an error is shown quietly in the Inspector, which retries. A target tried by itself is not tried again by
 * itself for the same image in this page (the action still can). Whether the reader uses the frame is the experience's
 * setting (`recognition`, default original). (The frames: `recognitionFrames` below.)
 */

/**
 * The target as the frame needs it, from the loaded draft: `imageSrc` = its printed image as the draft holds it – the one
 * just set when the caller knows it, else the entries list's when it is the image the draft shows (a path the draft
 * resolves), else the draft's URL
 */
export const frameTargetOf = (targetId: string, imageSrc?: string): FrameTarget | null => {
  const target = getTarget(targetId);
  if (!target) return null;
  const listed = entries.byId(target.entryId)?.target;
  const raw = imageSrc ?? (listed && listed.id === target.id && contentUrl(listed.imageSrc) === target.imageSrc ? listed.imageSrc : target.imageSrc);
  return { id: target.id, imageSrc: raw, recognition: target.recognition };
};

class RecognitionFrames {
  status = $state<Record<string, FrameStatus>>({});
  private tried = new Set<string>();
  private running = new Map<string, Promise<boolean>>();

  /**
   * By itself after a target change (the draft loaded again): makes the frame when the target has none, once per target
   * and image; `imageSrc` = the image just set, when the caller knows it
   */
  autoFor(experienceId: string, targetId: string, imageSrc?: string): void {
    const target = content.experienceId === experienceId ? frameTargetOf(targetId, imageSrc) : null;
    if (target) this.auto(experienceId, target);
  }

  auto(experienceId: string, target: FrameTarget, onmade: () => Promise<unknown> | void = () => content.load(experienceId)): void {
    if (target.recognition || !target.imageSrc) return;
    const key = `${experienceId}:${target.id}:${target.imageSrc}`;
    if (this.tried.has(key)) return;
    this.tried.add(key);
    void this.make(experienceId, target, onmade);
  }

  /** Make (or remake) the frame now; resolves true when it is stored – never throws */
  make(experienceId: string, target: FrameTarget, onmade: () => Promise<unknown> | void = () => content.load(experienceId)): Promise<boolean> {
    const key = `${experienceId}:${target.id}`;
    const running = this.running.get(key);
    if (running) return running;
    const work = this.run(experienceId, target, onmade).finally(() => this.running.delete(key));
    this.running.set(key, work);
    return work;
  }

  private async run(experienceId: string, target: FrameTarget, onmade?: () => Promise<unknown> | void): Promise<boolean> {
    this.status = { ...this.status, [target.id]: { state: "making" } };
    try {
      const pixels = await decodePrintedImage(contentUrl(target.imageSrc));
      const file = await frameFile(frameOfPixels(pixels), target.id);
      const asset = await library.upload(experienceId, file);
      await putTarget(experienceId, target.id, { recognition: recognitionDataOf(asset.url, pixels), madeFrom: target.imageSrc });
      const { [target.id]: _done, ...rest } = this.status;
      this.status = rest;
      await onmade?.();
      return true;
    } catch (e) {
      this.status = { ...this.status, [target.id]: { state: "failed", message: errorText(e) } };
      return false;
    }
  }
}

export const recognitionFrames = new RecognitionFrames();
