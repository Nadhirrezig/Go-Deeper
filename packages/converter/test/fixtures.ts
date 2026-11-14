import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface FixturePage {
  text?: string;
  /** Page size in PDF points. Default A4 portrait. */
  size?: [number, number];
}

/** Build a PDF in memory (no binary fixtures committed). */
export async function makePdf(pages: FixturePage[], title?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage(spec.size ?? [595, 842]);
    page.drawRectangle({
      x: 40,
      y: 40,
      width: page.getWidth() - 80,
      height: 60,
      color: rgb(0.1, 0.4, 0.2),
    });
    if (spec.text) {
      page.drawText(spec.text, { x: 50, y: page.getHeight() - 100, size: 24, font });
    }
  }
  return doc.save({ addDefaultPage: false });
}
