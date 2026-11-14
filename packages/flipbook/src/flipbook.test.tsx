import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Flipbook } from "./flipbook";

describe("<Flipbook />", () => {
  it("renders the placeholder inside .vgf-root", () => {
    const html = renderToString(<Flipbook />);
    expect(html).toBe('<div class="vgf-root">Flipbook</div>');
  });
});
