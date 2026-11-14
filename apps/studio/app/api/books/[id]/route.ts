import { deleteBook } from "../../../../lib/books";
import { isLibraryError } from "../../../../lib/library/errors";
import { getServices } from "../../../../lib/services";

type Context = { params: Promise<{ id: string }> };

/** The book record. Polled about once a second while a book is converting. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const services = getServices();
  await services.ready;
  const book = await services.repo.getBook(id);
  if (!book) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return Response.json({ book }, { headers: { "Cache-Control": "no-store" } });
}

/** Remove the book (record and files). Refused while it converts. */
export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const services = getServices();
  await services.ready;
  try {
    await deleteBook(services.repo, services.flipbooksDir, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (!isLibraryError(error)) throw error;
    const status = error.code === "NOT_FOUND" ? 404 : 409;
    return Response.json({ error: { code: error.code, message: error.message } }, { status });
  }
}
