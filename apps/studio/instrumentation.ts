// Runs once when the studio server starts: bring the library in line with the disk
// (interrupted conversions, books converted with the CLI) before the first request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getServices } = await import("./lib/services");
  await getServices().ready;
}
