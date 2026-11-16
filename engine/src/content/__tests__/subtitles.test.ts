import { describe, expect, it } from "vitest";
import { cueAt, parseWebVtt, webVttProblems } from "@shared/text/webvtt";
import { pairSubtitles, pickSubtitleTrack, subtitleFileOf, subtitleNameOf, subtitleProblems } from "@shared/types/subtitles";

const FILE = `WEBVTT

NOTE made for the test

1
00:00:00.500 --> 00:00:02.000
Hello.

00:02.500 --> 00:04.000 align:start position:10%
<v Mark>Two <i>lines</i>
of text &amp; more

intro
01:00:05,000 --> 01:00:06,000
After an hour
`;

describe("WebVTT", () => {
  it("reads cues with and without hours, identifiers and settings; tags go, entities resolve", () => {
    expect(parseWebVtt(FILE)).toEqual([
      { start: 0.5, end: 2, text: "Hello." },
      { start: 2.5, end: 4, text: "Two lines\nof text & more" },
      { start: 3605, end: 3606, text: "After an hour" },
    ]);
  });

  it("reads Windows line ends and a byte order mark", () => {
    expect(parseWebVtt("﻿WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nHi\r\n")).toEqual([{ start: 1, end: 2, text: "Hi" }]);
  });

  it("skips what is no cue: notes, an empty text, a cue that ends before it starts", () => {
    expect(parseWebVtt("WEBVTT\n\nNOTE x\n\n00:02.000 --> 00:01.000\nBackwards\n\n00:03.000 --> 00:04.000\n\n")).toEqual([]);
  });

  it("the cue at a time: from its start up to its end, none between cues", () => {
    const cues = parseWebVtt(FILE);
    expect(cueAt(cues, 0.4)).toBeNull();
    expect(cueAt(cues, 0.5)?.text).toBe("Hello.");
    expect(cueAt(cues, 1.99)?.text).toBe("Hello.");
    expect(cueAt(cues, 2)).toBeNull();
    expect(cueAt(cues, 3)?.text).toBe("Two lines\nof text & more");
    expect(cueAt(cues, 100)).toBeNull();
  });

  it("names what is wrong with a file", () => {
    expect(webVttProblems(FILE)).toEqual([]);
    expect(webVttProblems("00:01.000 --> 00:02.000\nHi\n")).toEqual(['the first line must be "WEBVTT"']);
    expect(webVttProblems("WEBVTT\n\n")).toEqual(["no cue found"]);
    expect(webVttProblems("WEBVTT\n\n00:02.000 --> 00:01.000\nHi\n")).toEqual(['"00:02.000 --> 00:01.000": the cue ends before it starts', "no cue found"]);
  });
});

describe("subtitle files", () => {
  it("a subtitle file names its video and its language", () => {
    expect(subtitleFileOf("/assets/content/entries/screen/screen.en.vtt")).toEqual({ video: "screen", language: "en" });
    expect(subtitleFileOf("Mark first speak.pt-BR.vtt")).toEqual({ video: "Mark first speak", language: "pt-BR" });
    expect(subtitleFileOf("https://cdn.example/b/a/v1.vtt")).toBeNull();
    expect(subtitleFileOf("screen.english.vtt")).toBeNull();
    expect(subtitleNameOf("https://cdn.example/x/screen.mp4?v=2")).toBe("screen");
    expect(subtitleNameOf("screen.glb")).toBeNull();
  });

  it("pairs the files of a folder by name – another folder's file of the same name does not count", () => {
    expect(pairSubtitles([
      "/assets/content/entries/screen/screen.mp4",
      "/assets/content/entries/screen/screen.nl.vtt",
      "/assets/content/entries/screen/screen.en.vtt",
      "/assets/content/entries/lamp/lamp.mp4",
      "/assets/content/entries/lamp/screen.de.vtt",
      "/assets/content/entries/lamp/notes.vtt",
    ])).toEqual([{
      media: "/assets/content/entries/screen/screen.mp4",
      tracks: { en: "/assets/content/entries/screen/screen.en.vtt", nl: "/assets/content/entries/screen/screen.nl.vtt" },
    }]);
  });

  it("picks the reader's language, its base, a variant of it, English, then the first", () => {
    const tracks = { de: "de.vtt", en: "en.vtt", "pt-BR": "pt.vtt" };
    expect(pickSubtitleTrack(tracks, "de")).toBe("de.vtt");
    expect(pickSubtitleTrack(tracks, "de-AT")).toBe("de.vtt");
    expect(pickSubtitleTrack(tracks, "pt")).toBe("pt.vtt");
    expect(pickSubtitleTrack(tracks, "nl")).toBe("en.vtt");
    expect(pickSubtitleTrack({ fr: "fr.vtt", nl: "nl.vtt" }, "de")).toBe("fr.vtt");
    expect(pickSubtitleTrack({}, "de")).toBeUndefined();
  });

  it("checks the configuration's list", () => {
    expect(subtitleProblems([{ media: "a.mp4", tracks: { en: "a.en.vtt" } }], "subtitles")).toEqual([]);
    expect(subtitleProblems({}, "subtitles")).toEqual(["subtitles: expected a list"]);
    expect(subtitleProblems([{ tracks: { english: "a.vtt", en: 1 } }], "subtitles")).toEqual([
      "subtitles[0].media: expected the video's file",
      'subtitles[0].tracks.english: expected a language like "en" or "pt-BR"',
      "subtitles[0].tracks.en: expected the subtitle file",
    ]);
  });
});
