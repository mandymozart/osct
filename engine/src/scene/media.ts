/**
 * Playing the scene's media – a video node's video, a video a texture shows – and the editor's hold on them (#275).
 * Every start goes through `playMedia`: with sound where the browser allows it, else muted (no user gesture yet, e.g.
 * iOS), never not at all. While the media are held (the editor's Live switch off – `ArScene.holdClock`) nothing starts:
 * what played stops where it is, what asks to start waits, and when the hold ends exactly those go on. A pause
 * (`pauseMedia`: the page lost, the scene paused) also cancels a start the hold kept back, so a video of a page that
 * went away while the scene stood still stays paused.
 *
 * One hold per page, like the scene: the scene ends it when it is disposed (`releaseMedia`). Media a plugin's code plays
 * itself (`element.play()`) bypass it – the hold pauses them only if they already play when it begins.
 */

let held = false;
/** Media that played when the hold began, or asked to start during it: they go on when it ends */
const waiting = new Set<HTMLMediaElement>();

/** Play with sound; if the browser blocks unmuted playback, muted instead. While held: started when the hold ends. */
export const playMedia = async (element: HTMLMediaElement): Promise<void> => {
  if (held) {
    waiting.add(element);
    return;
  }
  try {
    await element.play();
  } catch (error) {
    if ((error as DOMException)?.name !== "NotAllowedError") {
      console.warn("[media] Could not play:", error);
      return;
    }
    element.muted = true;
    await element.play().catch(e => console.warn("[media] Could not play muted:", e));
  }
};

/** Pause – and forget a start the hold kept back */
export const pauseMedia = (element: HTMLMediaElement): void => {
  waiting.delete(element);
  element.pause();
};

/**
 * Hold the media (`media`: every media element of the scene now) – those that play stop where they are – or end the
 * hold: what played or asked to start goes on, where it stopped. Holding twice or releasing twice changes nothing.
 */
export const holdMedia = (hold: boolean, media: Iterable<HTMLMediaElement> = []): void => {
  if (hold === held) return;
  held = hold;
  if (hold) {
    for (const element of media) {
      if (element.paused) continue;
      waiting.add(element);
      element.pause();
    }
    return;
  }
  const resume = [...waiting];
  waiting.clear();
  // An element disposed meanwhile (its asset released) has left the page
  resume.filter(element => element.isConnected).forEach(element => void playMedia(element));
};

/** The media are held (the editor's Live switch off) */
export const isMediaHeld = (): boolean => held;

/** The scene is gone: no hold, nothing waiting – the next scene starts free */
export const releaseMedia = (): void => {
  held = false;
  waiting.clear();
};
