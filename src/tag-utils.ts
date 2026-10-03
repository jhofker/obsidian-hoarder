// Characters allowed in an Obsidian tag beyond \p{L}/\p{N}/_/-//.
// Obsidian's docs (https://obsidian.md/help/tags) say tags also allow "commonly
// accepted Unicode characters, including emojis and other symbols" — confirmed by
// real-world behavior (e.g. dingbats and emoji render as valid tags) even though
// Obsidian doesn't publish an exact spec. \p{So} (Symbol, Other) covers emoji and
// dingbats while excluding currency/math symbols like $, +, = that aren't accepted.
// The remaining code points are the joiners/modifiers needed to keep multi-codepoint
// emoji sequences (flags, skin tones, ZWJ families, keycaps) intact after filtering.
const EMOJI_JOINERS = "‍️⃣"; // ZWJ, variation selector-16, keycap combiner
const ALLOWED_TAG_CHARS = new RegExp(
  `[^\\p{L}\\p{N}_\\-/\\p{So}\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\p{Regional_Indicator}${EMOJI_JOINERS}]`,
  "gu"
);

/**
 * Sanitizes a tag string to conform to Obsidian's tag requirements.
 *
 * Obsidian tag rules:
 * - Allowed characters: Unicode letters (including CJK/Chinese/Japanese/Korean),
 *   numbers, underscore (_), hyphen (-), forward slash (/), and emoji/symbols
 * - Must contain at least one non-numerical character
 * - No blank spaces (converted to hyphens)
 * - Case-insensitive
 *
 * @param tag - The tag string to sanitize
 * @returns The sanitized tag string, or null if the tag is invalid/empty after sanitization
 */
export function sanitizeTag(tag: string): string | null {
  // Remove leading/trailing whitespace
  let sanitized = tag.trim();

  // Return null if empty
  if (!sanitized) return null;

  // Replace spaces with hyphens (kebab-case)
  sanitized = sanitized.replace(/\s+/g, "-");

  // Remove any character not in Obsidian's allowed set (see ALLOWED_TAG_CHARS above).
  sanitized = sanitized.replace(ALLOWED_TAG_CHARS, "");

  // Return null if after sanitization we have an empty string
  if (!sanitized) return null;

  // If tag contains only numbers, prepend with "tag-" to make it valid
  if (/^\d+$/.test(sanitized)) {
    sanitized = "tag-" + sanitized;
  }

  // If tag starts with only numbers followed by invalid characters (edge case),
  // prepend with "tag-" to ensure at least one non-numerical character
  if (/^[\d/\-_]+$/.test(sanitized)) {
    sanitized = "tag-" + sanitized;
  }

  return sanitized;
}

/**
 * Sanitizes an array of tags, filtering out invalid tags.
 *
 * @param tags - Array of tag strings to sanitize
 * @returns Array of valid sanitized tags (empty array if no valid tags)
 */
export function sanitizeTags(tags: string[]): string[] {
  return tags.map(sanitizeTag).filter((tag): tag is string => tag !== null);
}
