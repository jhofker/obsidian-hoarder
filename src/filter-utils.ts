/**
 * Result of bookmark filtering evaluation
 */
export interface FilterResult {
  /** Whether the bookmark should be included */
  include: boolean;
  /** Reason for exclusion, if applicable */
  reason?: "excluded_tag" | "missing_included_tag";
}

/**
 * Determines if a bookmark should be included based on tag filtering rules.
 *
 * Rules:
 * 1. If includedTags is specified, bookmark must have at least one
 * 2. If excludedTags is specified, bookmark must not have any (unless favorited)
 * 3. Favorited bookmarks bypass excluded tag filtering
 *
 * @param bookmarkTags - Tags from the bookmark (already lowercased)
 * @param includedTags - Tags that must be present (lowercased)
 * @param excludedTags - Tags that must not be present (lowercased)
 * @param isFavorited - Whether the bookmark is favorited
 * @returns Filter result indicating inclusion and reason
 */
export function shouldIncludeBookmark(
  bookmarkTags: string[],
  includedTags: string[],
  excludedTags: string[],
  isFavorited: boolean
): FilterResult {
  // Filter by included tags if specified
  if (includedTags.length > 0) {
    const hasIncludedTag = includedTags.some((includedTag) => bookmarkTags.includes(includedTag));
    if (!hasIncludedTag) {
      return { include: false, reason: "missing_included_tag" };
    }
  }

  // Skip excluded tag check if bookmark is favorited
  if (!isFavorited && excludedTags.length > 0) {
    const hasExcludedTag = excludedTags.some((excludedTag) => bookmarkTags.includes(excludedTag));
    if (hasExcludedTag) {
      return { include: false, reason: "excluded_tag" };
    }
  }

  return { include: true };
}
