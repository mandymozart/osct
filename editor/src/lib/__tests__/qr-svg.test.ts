import { describe, expect, it, vi } from "vitest";

vi.mock("$app/paths", () => ({ asset: (path: string) => path }));
const { qrSvg } = await import("../qr-svg");

describe("qrSvg (#326)", () => {
  it("draws the dark modules as runs, black on white, with a quiet zone of four modules", () => {
    const svg = qrSvg([[true, true, false], [false, true, false], [true, false, true]]);
    expect(svg).toContain('viewBox="0 0 11 11"');
    expect(svg).toContain('<rect width="11" height="11" fill="#fff"/>');
    // row 0: one run of two from x 0; row 1: one at x 1; row 2: x 0 and x 2
    expect(svg).toContain('d="M4 4h2v1h-2zM5 5h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1z"');
  });
});
