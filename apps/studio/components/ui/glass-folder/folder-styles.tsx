import { GF_CSS } from "./styles";

/** Key under which React 19 hoists and dedupes the stylesheet. */
export const GF_STYLE_HREF = "vipgroup-glass-folder";

/**
 * The folder's CSS, rendered once per page however many folders there are: React 19
 * hoists a `<style href precedence>` into <head> and keeps one copy per `href`.
 */
export function GlassFolderStyles() {
  return (
    <style href={GF_STYLE_HREF} precedence="medium">
      {GF_CSS}
    </style>
  );
}
