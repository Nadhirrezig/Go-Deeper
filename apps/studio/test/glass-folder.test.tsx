// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GlassFolder, { GLASS_FOLDER_LABELS_EN } from "../components/ui/glass-folder";
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

describe("GlassFolder: labels", () => {
  it("renders every visible and screen-reader string in French by default", () => {
    render(
      <GlassFolder
        label="Général"
        art="none"
        appear={false}
        action="more"
        files={[book("a", "Brochure")]}
        menu={[{ label: "Renommer" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Ouvrir Général, 1 flipbook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plus d'options pour Général" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Contenu de Général" })).toBeTruthy();
    expect(screen.getByRole("menu", { hidden: true }).getAttribute("aria-label")).toBe(
      "Options de Général",
    );
    // Closed menu items are disabled and hidden: read their text directly.
    const menuItems = () =>
      [...document.querySelectorAll(".gf-menu-item")].map((i) => i.textContent);
    expect(menuItems()).toEqual(["Ouvrir le dossier", "Renommer"]);
    expect(document.querySelector(".gf-meta")?.textContent).toBe("1 flipbook");

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Général, 1 flipbook" }));
    expect(screen.getByRole("button", { name: "Fermer Général, 1 flipbook" })).toBeTruthy();
    expect(menuItems()[0]).toBe("Fermer le dossier");
  });

  it("counts flipbooks in French: 0 flipbook, 1 flipbook, 2 flipbooks", () => {
    const { rerender } = render(folder([]));
    expect(document.querySelector(".gf-meta")?.textContent).toBe("0 flipbook");
    rerender(folder([book("a", "A"), book("b", "B")]));
    expect(document.querySelector(".gf-meta")?.textContent).toBe("2 flipbooks");
  });

  it("names the add key and defaults the folder name from the labels", () => {
    render(<GlassFolder art="none" appear={false} action="add" files={[]} />);
    expect(screen.getByRole("button", { name: "Ajouter un flipbook à Dossier" })).toBeTruthy();
  });

  it("takes overrides, with English available", () => {
    render(
      <GlassFolder
        label="Summer"
        art="none"
        appear={false}
        action="more"
        files={[book("a", "A")]}
        labels={GLASS_FOLDER_LABELS_EN}
      />,
    );
    expect(screen.getByRole("button", { name: "Open Summer, 1 item" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More options for Summer" })).toBeTruthy();
  });
});
