// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACK_PATH, FRONT_PATH, GF_KEY_CSS } from "../components/ui/glass-folder";
import { NewFolderTile } from "../components/ui/new-folder-tile";

afterEach(cleanup);

describe("NewFolderTile", () => {
  it("is one button named 'Créer un dossier' that works with click, Enter and Space", async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<NewFolderTile onCreate={onCreate} />);
    const tile = screen.getByRole("button", { name: "Créer un dossier" });
    await user.click(tile);
    tile.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onCreate).toHaveBeenCalledTimes(3);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("draws the folder's own outline and + key, not copies", () => {
    const { container } = render(<NewFolderTile />);
    const paths = [...container.querySelectorAll(".gf-new-shape path")].map((p) =>
      p.getAttribute("d"),
    );
    expect(paths).toEqual([BACK_PATH, FRONT_PATH]);
    expect(container.querySelector(".gf-key.gf-key--add .gf-glyph--plus")).not.toBeNull();
    expect(GF_KEY_CSS).toContain(".gf-key--add");
  });

  it("matches a folder's size at any width", () => {
    const { container } = render(<NewFolderTile width={280} />);
    const root = container.querySelector<HTMLElement>(".gf-root")!;
    expect(root.style.width).toBe("280px");
    expect(parseFloat(root.style.height)).toBeCloseTo((272 + 54) * (280 / 340), 3);
  });

  it("can be disabled", async () => {
    const onCreate = vi.fn();
    render(<NewFolderTile onCreate={onCreate} disabled />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Créer un dossier" }));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
