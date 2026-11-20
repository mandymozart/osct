import { afterEach, describe, expect, it } from "vitest";
import { recognitionFor, recognitionModeOf, resolveRecognitionMode } from "../recognition-mode";
import { getRecognitionMode, getRecognitionOverride, recognitionLabel, setRecognitionOverride, targetRecognition } from "../../utils/recognition-setting";
import type { RecognitionMode } from "../../types/index";

const frame = { imageSrc: "https://cdn.example/p-1_recognition.webp", width: 900, height: 1200 };

describe("the recognition path (#306, schema 4.2): experience × device override × target override", () => {
  it("is original unless the experience says prepared – none or an unknown text is original", () => {
    expect(recognitionModeOf(undefined)).toBe("original");
    expect(recognitionModeOf({})).toBe("original");
    expect(recognitionModeOf({ recognition: "original" })).toBe("original");
    expect(recognitionModeOf({ recognition: "prepared" })).toBe("prepared");
    expect(recognitionModeOf({ recognition: "precompiled" as RecognitionMode })).toBe("original");
  });

  it("takes the device's override over the experience, either way", () => {
    expect(resolveRecognitionMode({ recognition: "prepared" }, null)).toBe("prepared");
    expect(resolveRecognitionMode({ recognition: "prepared" }, "original")).toBe("original");
    expect(resolveRecognitionMode({}, "prepared")).toBe("prepared");
    expect(resolveRecognitionMode(null, null)).toBe("original");
  });

  it("uses a target's frame only on the prepared path, never for a target with recognitionOff or without a frame", () => {
    const cases: Array<[RecognitionMode | undefined, RecognitionMode | null, boolean | undefined, boolean]> = [
      // experience, device, recognitionOff, frame used
      [undefined, null, undefined, false],
      ["original", null, undefined, false],
      ["prepared", null, undefined, true],
      ["prepared", null, false, true],
      ["prepared", null, true, false],
      ["prepared", "original", undefined, false],
      ["original", "prepared", undefined, true],
      [undefined, "prepared", true, false],
    ];
    for (const [experience, device, off, used] of cases) {
      const mode = resolveRecognitionMode(experience ? { recognition: experience } : {}, device);
      const target = { recognition: frame, ...(off === undefined ? {} : { recognitionOff: off }) };
      expect(recognitionFor(target, mode), `${experience} × ${device} × ${off}`).toEqual(used ? frame : undefined);
    }
    expect(recognitionFor({}, "prepared")).toBeUndefined();
  });
});

describe("the device's override (debug overlay)", () => {
  afterEach(() => setRecognitionOverride(null));

  it("is stored for this device and read back; without content the experience's side is original", () => {
    expect(getRecognitionOverride()).toBeNull();
    expect(getRecognitionMode()).toBe("original");
    expect(targetRecognition({ recognition: frame })).toBeUndefined();
    setRecognitionOverride("prepared");
    expect(getRecognitionOverride()).toBe("prepared");
    expect(targetRecognition({ recognition: frame })).toEqual(frame);
    expect(recognitionLabel()).toContain("override");
    setRecognitionOverride(null);
    expect(recognitionLabel()).toBe("original (the experience's setting)");
  });
});
