/**
 * Listing sites and maps are where a lead was *found*, not the business's own website.
 * Their hosts go into the row's source, never the company website (and never into
 * duplicate checks, since thousands of shops share them).
 */
const DIRECTORY_HOSTS = [
  "waze.com", "yelp.com", "yellowpages.com", "local.yahoo.com", "loc8nearme.com", "cylex.us.com", "cylex.com",
  "bestprosintown.com", "mapquest.com", "manta.com", "bbb.org", "facebook.com", "instagram.com", "linkedin.com",
  "google.com", "maps.google.com", "goo.gl", "g.page", "maps.apple.com", "bing.com", "foursquare.com",
  "superpages.com", "chamberofcommerce.com", "nextdoor.com", "citysearch.com", "hotfrog.com", "merchantcircle.com",
  "angi.com", "thumbtack.com", "tripadvisor.com", "opendi.us", "showmelocal.com", "brownbook.net", "cybo.com",
  "n49.com", "ezlocal.com", "findglocal.com", "birdeye.com", "nicelocal.com", "wisermap.com", "whodoyou.com",
  "yourbizlistings.com", "worldorgs.com", "townplanner.com", "cellphoneplaces.com", "allbiz.com", "dexknows.com",
  "local.com", "kudzu.com", "citylocal101.com", "storeboard.com", "find-us-here.com", "yellowbot.com", "infobel.com",
];

const DIRECTORY_WORDS = /\b(directory|directories|listings?|yellow ?pages|maps?|places|reviews?)\b/i;

export function hostOf(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function isDirectoryHost(input: string | null | undefined): boolean {
  const host = hostOf(input);
  if (!host) return false;
  return DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** True when a source label such as "Public directory" or "Waze listing" names a listing site. */
export function isDirectoryLabel(label: string | null | undefined): boolean {
  return !!label && DIRECTORY_WORDS.test(label) && !/\b(business|company|official|own)\s+(web)?site\b/i.test(label);
}
