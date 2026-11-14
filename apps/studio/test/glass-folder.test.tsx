// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GlassFolder from "../components/ui/glass-folder";
import type { FolderFile } from "../components/ui/glass-folder";

afterEach(cleanup);

const book = (id: string, name: string, meta?: string): FolderFile => ({ id, name, meta });
const sheets = () => [...document.querySelectorAll<HTMLElement>(".gf-sheet")];
const dropping = () => sheets().filter((s) => s.classList.contains("gf-sheet--drop"));
const names = (list: HTMLElement[]) =>
  list.map((s) => s.querySelector(".gf-sheet-name")?.textContent);

// art="none" and plain sheets: jsdom has no canvas to paint artwork into.
const folder = (files: FolderFile[]) => (
  <GlassFolder label="Général" art="none" appear={false} action="more" files={files} />
);

describe("GlassFolder: files follow the prop", () => {
  it("adds a sheet when a file is added, and only that sheet drops in", () => {
    const { rerender } = render(folder([book("a", "Brochure"), book("b", "Catalogue")]));
    expect(sheets()).toHaveLength(2);
    expect(dropping()).toHaveLength(0); // nothing drops on first render

    rerender(folder([book("a", "Brochure"), book("b", "Catalogue"), book("c", "Dépliant")]));
    expect(sheets()).toHaveLength(3);
    expect(names(dropping())).toEqual(["Dépliant"]);
  });

  it("drops every file that is new in one update", () => {
    const { rerender } = render(folder([book("a", "A")]));
    rerender(folder([book("a", "A"), book("b", "B"), book("c", "C")]));
    expect(names(dropping())).toEqual(["B", "C"]);
  });

  it("keeps existing sheets when their content changes (no re-animation)", () => {
    const { rerender } = render(folder([book("a", "Brochure", "Conversion 3/48")]));
    const before = sheets()[0];
    rerender(folder([book("a", "Brochure", "Conversion 4/48")]));
    expect(sheets()[0]).toBe(before); // same DOM element, kept by id
    expect(dropping()).toHaveLength(0);
    expect(sheets()[0]?.querySelector(".gf-sheet-meta")?.textContent).toBe("Conversion 4/48");
  });

  it("removes a sheet whose file left the list", () => {
    const { rerender } = render(folder([book("a", "A"), book("b", "B")]));
    rerender(folder([book("b", "B")]));
    expect(names(sheets())).toEqual(["B"]);
    expect(dropping()).toHaveLength(0);
  });

  it("stops the drop class when the animation ends", () => {
    const { rerender } = render(folder([book("a", "A")]));
    rerender(folder([book("a", "A"), book("b", "B")]));
    // jsdom has no AnimationEvent, so React listens to the prefixed name there.
    fireEvent(dropping()[0]!, new Event("webkitAnimationEnd", { bubbles: true }));
    expect(dropping()).toHaveLength(0);
  });
});
