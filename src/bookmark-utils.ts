import { HoarderBookmark } from "./hoarder-client";

/**
 * Detects whether a title is "dirty" — i.e., it contains full article body text
 * rather than a real title. This happens with platforms like WeChat Official Accounts
 * where articles published without a title cause the platform to fill the HTML <title>
 * tag with the first paragraph of body text.
 *
 * Heuristic: if the raw title contains more than one sentence (split by common
 * Chinese/English punctuation) OR exceeds 80 characters, it is considered dirty.
 *
 * @param title - The raw title string from the crawler
 * @returns true if the title looks like body text rather than a real title
 */
function isDirtyTitle(title: string): boolean {
  if (title.length > 80) return true;
  // Count sentence-ending punctuation marks
  const sentenceEnders = title.match(/[。！？!?]/g);
  return sentenceEnders !== null && sentenceEnders.length > 1;
}

/**
 * Extracts a meaningful title from a bookmark.
 *
 * Priority order:
 * 1. bookmark.title (if present)
 * 2. For links: content.title (if not dirty), then URL parsing
 * 3. For text: first line (truncated if needed)
 * 4. For assets: fileName or sourceUrl parsing
 * 5. Fallback: "Bookmark-{id}-{date}"
 *
 * When content.title looks like body text (dirty title, e.g. WeChat articles
 * published without a title), the function skips it and falls back to URL parsing.
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
    if (bookmark.content.title && !isDirtyTitle(bookmark.content.title)) {
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
