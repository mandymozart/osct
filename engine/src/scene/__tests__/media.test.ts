import { afterEach, describe, expect, it, vi } from "vitest";
import { holdMedia, isMediaHeld, pauseMedia, playMedia, releaseMedia } from "../media";

/** A media element that records play and pause; `refuse` = the browser blocks unmuted playback */
const element = ({ playing = false, refuse = false } = {}) => {
  const media = document.createElement("video");
  document.body.appendChild(media);
  let paused = !playing;
  Object.defineProperty(media, "paused", { get: () => paused });
  const play = vi.fn(() => {
    if (refuse && !media.muted) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    paused = false;
    return Promise.resolve();
  });
  const pause = vi.fn(() => { paused = true; });
  media.play = play;
  media.pause = pause;
  return { media, play, pause };
};

afterEach(() => {
  releaseMedia();
  document.body.innerHTML = "";
});

describe("the scene's media and the editor's hold (#275)", () => {
  it("plays with sound, and muted when the browser blocks sound", async () => {
    const free = element();
    await playMedia(free.media);
    expect(free.media.paused).toBe(false);
    expect(free.media.muted).toBe(false);
    const blocked = element({ refuse: true });
    await playMedia(blocked.media);
    expect(blocked.media.muted).toBe(true);
    expect(blocked.play).toHaveBeenCalledTimes(2);
    expect(blocked.media.paused).toBe(false);
  });

  it("a hold stops what plays where it is; let go, exactly those go on", async () => {
    const playing = element({ playing: true });
    const stopped = element();
    holdMedia(true, [playing.media, stopped.media]);
    expect(isMediaHeld()).toBe(true);
    expect(playing.media.paused).toBe(true);
    expect(stopped.pause).not.toHaveBeenCalled();
    holdMedia(false);
    await Promise.resolve();
    expect(playing.media.paused).toBe(false);
    expect(stopped.play).not.toHaveBeenCalled();
    expect(isMediaHeld()).toBe(false);
  });

  it("nothing starts while held – a page found meanwhile starts its video when the hold ends", async () => {
    holdMedia(true, []);
    const found = element();
    await playMedia(found.media);
    expect(found.play).not.toHaveBeenCalled();
    holdMedia(false);
    await Promise.resolve();
    expect(found.play).toHaveBeenCalledTimes(1);
  });

  it("a pause during the hold cancels the start it kept back (the page went away)", async () => {
    const playing = element({ playing: true });
    holdMedia(true, [playing.media]);
    const found = element();
    await playMedia(found.media);
    pauseMedia(playing.media);
    pauseMedia(found.media);
    holdMedia(false);
    await Promise.resolve();
    expect(playing.play).not.toHaveBeenCalled();
    expect(found.play).not.toHaveBeenCalled();
  });

  it("holding twice keeps the first list; an element that left the page is not started again", async () => {
    const first = element({ playing: true });
    const gone = element({ playing: true });
    holdMedia(true, [first.media, gone.media]);
    holdMedia(true, [element({ playing: true }).media]);
    gone.media.remove();
    holdMedia(false);
    await Promise.resolve();
    expect(first.play).toHaveBeenCalledTimes(1);
    expect(gone.play).not.toHaveBeenCalled();
  });

  it("the scene's end releases the hold without starting anything", async () => {
    const playing = element({ playing: true });
    holdMedia(true, [playing.media]);
    releaseMedia();
    expect(isMediaHeld()).toBe(false);
    holdMedia(false);
    await Promise.resolve();
    expect(playing.play).not.toHaveBeenCalled();
  });
});
