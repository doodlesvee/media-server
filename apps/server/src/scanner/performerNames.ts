import path from "node:path";

// Directory prefixes that are filesystem bookkeeping rather than content.
// Without this, a file inside .Trash-1000/ or @eaDir/ would create a
// performer named after the junk directory.
const IGNORED_SEGMENT_PREFIXES = [".", "@", "#"];

// Shorter keys match far too much — "Al" appears inside a great many words.
const MIN_MATCH_KEY_LENGTH = 3;

/**
 * Collapses a raw name to its canonical form.
 *
 * NFC normalisation is load-bearing on macOS: readdir returns decomposed
 * filenames, so a folder named "José" arrives as "José" while the
 * browser sends the composed form. `lower()` does not equate the two, and
 * you would end up with two performers whose names render identically.
 */
export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * The performer implied by a file's location: the first path segment below
 * the library root, when the file is nested at all.
 *
 * Returns null for a file sitting directly at the root — those are handled
 * separately by the filename fallback, which needs the full performer set to
 * exist first and so can't run per-file.
 */
export function performerNameFromPath(rootPath: string, filePath: string): string | null {
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  const segments = relative.split(/[\\/]/);
  if (segments.length < 2) return null;

  const top = normalizeName(segments[0]);
  if (!top) return null;
  if (IGNORED_SEGMENT_PREFIXES.some((prefix) => top.startsWith(prefix))) return null;
  // A bare year directory is a date, not a person. This is a plain rejection
  // rather than an attempt to parse meaning out of the name.
  if (/^\d{4}$/.test(top)) return null;

  return top;
}

/**
 * Flattens a string for loose comparison: separators become spaces and
 * diacritics are stripped, so "Dani.Daniels-2019_HD" becomes
 * "dani daniels 2019 hd" and a filename spelling "Renee" still matches a
 * performer recorded as "Renée".
 */
export function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[._\-+()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isUsableMatchKey(key: string): boolean {
  return key.length >= MIN_MATCH_KEY_LENGTH;
}

/**
 * Whether `needle` appears in `haystack` as a whole word. Substring matching
 * alone would let a performer named "Ana" claim every file about "Anastasia".
 */
export function hasWordBoundaryMatch(haystack: string, needle: string): boolean {
  // Names legitimately contain regex metacharacters — "Anna (UK)", "A+".
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}
