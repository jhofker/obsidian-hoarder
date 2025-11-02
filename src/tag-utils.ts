/**
 * Sanitizes a tag string to conform to Obsidian's tag requirements.
 *
 * Obsidian tag rules:
 * - Allowed characters: letters, numbers, underscore (_), hyphen (-), forward slash (/)
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

  // Remove any characters that aren't letters, numbers, underscore, hyphen, or forward slash
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-/]/g, "");

  // Return null if after sanitization we have an empty string
  if (!sanitized) return null;

  // If tag contains only numbers, prepend with "tag-" to make it valid
  if (/^\d+$/.test(sanitized)) {
    sanitized = "tag-" + sanitized;
  }

  // If tag starts with only numbers followed by invalid characters (edge case),
  // prepend with "tag-" to ensure at least one non-numerical character
  if (/^[\d\/\-_]+$/.test(sanitized)) {
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
  return tags
    .map(sanitizeTag)
    .filter((tag): tag is string => tag !== null);
}
