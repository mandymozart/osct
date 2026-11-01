import { describe, expect, it } from "vitest";
import { csvDownload } from "../users-csv";

describe("csvDownload", () => {
  it("offers every user under All", () => {
    expect(csvDownload("all")).toMatchObject({ label: "Users CSV", newsletter: false });
  });

  it("offers the newsletter list under Newsletter", () => {
    expect(csvDownload("newsletter")).toMatchObject({ label: "Newsletter CSV", newsletter: true });
  });

  it("offers nothing under Editors or Admins", () => {
    expect(csvDownload("editor")).toBeNull();
    expect(csvDownload("admin")).toBeNull();
  });
});
