// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Flipbook, labelsEn } from "../src/index";

describe("server rendering", () => {
  it("imports and renders without window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const html = renderToString(<Flipbook manifestUrl="/files/abc/manifest.json" />);
    expect(html).toContain('class="vgf-root"');
    expect(html).toContain('data-status="loading"');
    expect(html).toContain("Chargement…");
  });

  it("renders the loading text from the labels", () => {
    const html = renderToString(<Flipbook manifestUrl="/x/manifest.json" labels={labelsEn} />);
    expect(html).toContain("Loading…");
  });
});
