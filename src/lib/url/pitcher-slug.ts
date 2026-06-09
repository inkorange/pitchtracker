// Pitcher URL helpers. The canonical pitcher URL is
// `/pitcher/{id}/{slug}`, where slug is a hyphenated, ASCII-folded
// version of the pitcher's full name. The id is the source of truth
// — slug exists purely so Google can read the name out of the URL
// for queries like "Paul Skenes pitch tracking", and so users have a
// human-readable URL to copy/paste.

// Unicode combining diacritical marks (U+0300–U+036F). Used post-NFKD
// to strip the now-decomposed accent marks from characters like é, ñ.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Convert a pitcher's full name to a URL slug.
 *
 * - Unicode normalization + diacritic strip (Andrés → andres)
 * - Drop punctuation (J.T. Realmuto → jt-realmuto)
 * - Whitespace → hyphens, dedupe runs, strip leading/trailing
 *
 * Empty input or names that reduce to an empty string (e.g. all
 * punctuation) return `"player"` so the URL still parses. Callers
 * are expected to have a non-empty name for any real MLB pitcher.
 */
export function slugifyPitcherName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "player";
}

/** Canonical pitcher page path. */
export function pitcherPagePath(id: number, name: string): string {
  return `/pitcher/${id}/${slugifyPitcherName(name)}`;
}
