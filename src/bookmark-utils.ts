import { HoarderBookmark } from "./hoarder-client";

/**
 * Extracts a meaningful title from a bookmark.
 *
 * Priority order:
 * 1. bookmark.title (if present)
 * 2. For links: content.title, then URL parsing
 * 3. For text: first line (truncated if needed)
 * 4. For assets: fileName or sourceUrl parsing
 * 5. Fallback: "Bookmark-{id}-{date}"
 *
 * @param bookmark - The bookmark object
 * @returns A title string suitable for use as a filename
 */
export function getBookmarkTitle(bookmark: HoarderBookmark): string {
  // Try main title first
  if (bookmark.title) {
    return bookmark.title;
  }

  // Try content based on type
  if (bookmark.content.type === "link") {
    // For links, try content title, then URL
    if (bookmark.content.title) {
      return bookmark.content.title;
    }
    if (bookmark.content.url) {
      return extractTitleFromUrl(bookmark.content.url);
    }
  } else if (bookmark.content.type === "text") {
    // For text content, use first line or first few words
    if (bookmark.content.text) {
      return extractTitleFromText(bookmark.content.text);
    }
  } else if (bookmark.content.type === "asset") {
    // For assets, use filename or source URL
    if (bookmark.content.fileName) {
      return bookmark.content.fileName.replace(/\.[^/.]+$/, ""); // Remove file extension
    }
    if (bookmark.content.sourceUrl) {
      return extractTitleFromUrl(bookmark.content.sourceUrl);
    }
  }

  // Fallback to ID with timestamp
  return `Bookmark-${bookmark.id}-${new Date(bookmark.createdAt).toISOString().split("T")[0]}`;
}

/**
 * Extracts a title from a URL by parsing the pathname or using the hostname.
 *
 * @param url - The URL string to parse
 * @returns A title extracted from the URL
 */
function extractTitleFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Use pathname without extension as title
    const pathTitle = parsedUrl.pathname
      .split("/")
      .pop()
      ?.replace(/\.[^/.]+$/, "") // Remove file extension
      ?.replace(/-|_/g, " "); // Replace dashes and underscores with spaces
    if (pathTitle) {
      return pathTitle;
    }
    // Fallback to hostname
    return parsedUrl.hostname.replace(/^www\./, "");
  } catch {
    // If URL parsing fails, return the URL as-is
    return url;
  }
}

/**
 * Extracts a title from text content by using the first line.
 * Truncates to 100 characters with ellipsis if needed.
 *
 * @param text - The text content
 * @returns The first line of text, possibly truncated
 */
function extractTitleFromText(text: string): string {
  const firstLine = text.split("\n")[0];
  if (firstLine.length <= 100) {
    return firstLine;
  }
  return firstLine.substring(0, 97) + "...";
}
