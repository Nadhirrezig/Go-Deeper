import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pdfjsAssets, toFactoryDir } from "../src/pdfjs";

describe("toFactoryDir", () => {
  it("turns a Windows path into a forward-slash folder ending with '/'", () => {
    expect(
      toFactoryDir(
        "C:\\Users\\Hitech\\OneDrive\\Bureau\\CompanyWork - SSI\\go-deeper\\node_modules\\pdfjs-dist\\cmaps",
        path.win32,
      ),
    ).toBe(
      "C:/Users/Hitech/OneDrive/Bureau/CompanyWork - SSI/go-deeper/node_modules/pdfjs-dist/cmaps/",
    );
    expect(toFactoryDir("C:\\a\\cmaps\\", path.win32)).toBe("C:/a/cmaps/");
  });

  it("keeps POSIX paths and adds the trailing slash", () => {
    expect(toFactoryDir("/home/user/repo/node_modules/pdfjs-dist/cmaps", path.posix)).toBe(
      "/home/user/repo/node_modules/pdfjs-dist/cmaps/",
    );
  });
});

describe("pdfjsAssets", () => {
  it("points at existing folders, in the form pdfjs accepts on every OS", () => {
    for (const dir of [
      pdfjsAssets.cMapUrl,
      pdfjsAssets.standardFontDataUrl,
      pdfjsAssets.wasmUrl,
      pdfjsAssets.iccUrl,
    ]) {
      expect(dir.endsWith("/")).toBe(true);
      expect(dir).not.toContain("\\");
      expect(existsSync(dir)).toBe(true);
    }
  });
});
