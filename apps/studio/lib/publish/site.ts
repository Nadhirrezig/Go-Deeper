import { shortBookId } from "@vipgroup/shared";

/** goexperience.travel's address, without a trailing slash. GOEXPERIENCE_URL overrides it. */
export function goexperienceUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.GOEXPERIENCE_URL?.trim() || "https://goexperience.travel").replace(/\/+$/, "");
}

/**
 * A published book's addresses on the site: its French page, and the link to share (no
 * locale: whoever opens it lands in their own language), as the site's "Partager" button does.
 */
export function publicBookUrls(siteUrl: string, id: string): { page: string; share: string } {
  const path = `/flipbook/${shortBookId(id)}`;
  return { page: `${siteUrl}/fr${path}`, share: `${siteUrl}${path}` };
}
