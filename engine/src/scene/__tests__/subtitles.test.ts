import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subtitles, type SubtitledVideo } from "../subtitles";

/** The content's pairing: `speak.mp4` has an English and a German file, `second.mp4` an English one, `silent.mp4` none */
vi.mock("../../content/game-config", () => ({
  getSubtitleTrack: (media: string, language: string) =>
    media === "speak.mp4" ? `speak.${language === "de" ? "de" : "en"}.vtt` : media === "second.mp4" ? "second.en.vtt" : undefined,
}));

const FILES: Record<string, string> = {
  "speak.en.vtt": "WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n\n00:03.000 --> 00:04.000\nAgain\n",
  "speak.de.vtt": "WEBVTT\n\n00:01.000 --> 00:02.000\nHallo\n",
  "second.en.vtt": "WEBVTT\n\n00:00.000 --> 00:10.000\nSecond\n",
};

const video = (src: string, currentTime = 0, paused = false): SubtitledVideo => ({ src, element: { paused, ended: false, currentTime } });
/** The file's text has arrived */
const loaded = () => new Promise(resolve => setTimeout(resolve));

describe("the scene's subtitle line", () => {
  let lines: Array<string | null>;
  let asked: string[];
  let language: string;
  let subtitles: Subtitles;

  beforeEach(() => {
    lines = [];
    asked = [];
    language = "en";
    subtitles = new Subtitles(() => language, text => lines.push(text), url => {
      asked.push(url);
      return url in FILES ? Promise.resolve(FILES[url]) : Promise.reject(new Error("404"));
    });
  });

  it("follows the playing video's time and tells only changes", async () => {
    const speak = video("speak.mp4", 1.2);
    subtitles.update([speak]);
    expect(lines).toEqual([]); // the file is on its way
    await loaded();
    subtitles.update([speak]);
    subtitles.update([speak]);
    speak.element.currentTime = 2.5;
    subtitles.update([speak]);
    speak.element.currentTime = 3.5;
    subtitles.update([speak]);
    expect(lines).toEqual(["Hello", null, "Again"]);
    expect(asked).toEqual(["speak.en.vtt"]); // fetched once
  });

  it("a paused video and a video without subtitles say nothing", async () => {
    subtitles.update([video("speak.mp4", 1.2, true), video("silent.mp4", 1.2)]);
    await loaded();
    subtitles.update([video("speak.mp4", 1.2, true), video("silent.mp4", 1.2)]);
    expect(lines).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("the line goes when the video pauses, and when the scene clears it", async () => {
    const speak = video("speak.mp4", 1.2);
    subtitles.update([speak]);
    await loaded();
    subtitles.update([speak]);
    subtitles.update([{ ...speak, element: { ...speak.element, paused: true } }]);
    subtitles.update([speak]);
    subtitles.clear();
    subtitles.clear();
    expect(lines).toEqual(["Hello", null, "Hello", null]);
  });

  it("takes the app's language as it is at that moment", async () => {
    const speak = video("speak.mp4", 1.2);
    subtitles.update([speak]);
    language = "de";
    subtitles.update([speak]);
    await loaded();
    subtitles.update([speak]);
    expect(lines).toEqual(["Hallo"]);
  });

  it("of two speaking videos, the cue that started last shows", async () => {
    const both = [video("second.mp4", 5), video("speak.mp4", 1.2)];
    subtitles.update(both);
    await loaded();
    subtitles.update(both);
    expect(lines).toEqual(["Hello"]);
  });

  it("a file that does not load leaves the video without a line", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = new Subtitles(() => "en", text => lines.push(text), () => Promise.reject(new Error("offline")));
    broken.update([video("speak.mp4", 1.2)]);
    await loaded();
    broken.update([video("speak.mp4", 1.2)]);
    expect(lines).toEqual([]);
  });
});
