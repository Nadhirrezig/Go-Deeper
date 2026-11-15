import { PUBLISH_SITE_NAMES, PUBLISH_SITES, shortBookId } from "@vipgroup/shared";
import type { PublishSite } from "@vipgroup/shared";

/**
 * The websites the studio publishes to (CLAUDE.md, step 7). Each reads its own private R2
 * bucket: a book goes to flipbooks/<id>/ there, and is listed in that bucket's
 * flipbooks/index.json.
 */
export interface SiteConfig {
  id: PublishSite;
  /** As shown in the studio. */
  name: string;
  /** Address of the site, without a trailing slash. */
  url: string;
  /** R2 bucket the site reads. */
  bucket: string;
  /** Path of a book's page on the site, from its short id. */
  pagePath: (shortId: string) => string;
}

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string) => env[name]?.trim() || undefined;
const origin = (url: string) => url.replace(/\/+$/, "");

/** Every site, from the environment (addresses and buckets can be overridden in .env). */
export function siteConfigs(env: Env = process.env): Record<PublishSite, SiteConfig> {
  return {
    goexperience: {
      id: "goexperience",
      name: PUBLISH_SITE_NAMES.goexperience,
      url: origin(read(env, "GOEXPERIENCE_URL") ?? "https://goexperience.travel"),
      bucket: read(env, "R2_BUCKET") ?? "goexperience",
      // The site's URLs start with the language; the French page is the default.
      pagePath: (shortId) => `/fr/flipbook/${shortId}`,
    },
    vipdestinations: {
      id: "vipdestinations",
      name: PUBLISH_SITE_NAMES.vipdestinations,
      url: origin(read(env, "VIPDESTINATIONS_URL") ?? "https://www.vipdestinations.fr"),
      bucket: read(env, "R2_BUCKET_VIPDESTINATIONS") ?? "vipdestinations",
      // The language comes from the visitor's cookie: no locale in the URL.
      pagePath: (shortId) => `/flipbook/${shortId}`,
    },
  };
}

export interface PublicSite {
  id: PublishSite;
  name: string;
  /** Host shown next to the name, e.g. goexperience.travel */
  host: string;
  /** The book's page on the site. */
  page: string;
  /** The link to share, as the site's "Partager" button does (no locale). */
  share: string;
}

/** What the studio's pages show of each site for one book, in PUBLISH_SITES order. */
export function publicSites(id: string, env: Env = process.env): PublicSite[] {
  const configs = siteConfigs(env);
  const shortId = shortBookId(id);
  return PUBLISH_SITES.map((site) => {
    const config = configs[site];
    return {
      id: site,
      name: config.name,
      host: new URL(config.url).host.replace(/^www\./, ""),
      page: `${config.url}${config.pagePath(shortId)}`,
      share: `${config.url}/flipbook/${shortId}`,
    };
  });
}
