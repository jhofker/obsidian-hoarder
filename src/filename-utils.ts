/**
 * Sanitizes a filename by removing invalid characters and limiting length.
 *
 * Creates filenames in the format: YYYY-MM-DD-sanitized-title
 * Maximum total length is kept under 50 characters to avoid filesystem issues.
 *
 * @param title - The title to use in the filename
 * @param createdAt - ISO 8601 date string or Date object
 * @returns A sanitized filename without extension (e.g., "2024-01-15-my-title")
 */
export function sanitizeFileName(title: string, createdAt: string | Date): string {
  // Format the date as YYYY-MM-DD
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const dateStr = date.toISOString().split("T")[0]; // This is 10 characters

  // Sanitize the title for filesystem and Obsidian wikilink compatibility.
  let sanitizedTitle = title
    .replace(/[\\/:*?"<>|#^\[\]]/g, "-") // Replace unsafe filename/link characters with dash
    .replace(/\s+/g, "-") // Replace spaces with dash
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, ""); // Remove dashes from start and end

  // Calculate how much space we have for the title
  // 50 (max) - 10 (date) - 1 (dash) - 3 (.md) = 36 characters for title
  const maxTitleLength = 36;

  if (sanitizedTitle.length > maxTitleLength) {
    // If title is too long, try to cut at a word boundary
    const truncated = sanitizedTitle.substring(0, maxTitleLength);
    const lastDash = truncated.lastIndexOf("-");
    if (lastDash > maxTitleLength / 2) {
      // If we can find a reasonable word break, use it
      sanitizedTitle = truncated.substring(0, lastDash);
    } else {
      // Otherwise just truncate
      sanitizedTitle = truncated;
    }
  }

  return `${dateStr}-${sanitizedTitle}`;
}

/**
 * Picks the note path for a bookmark.
 *
 * Reuses the note that already holds this bookmark's id, so a renamed bookmark keeps its note.
 * Otherwise uses the title-based name, suffixed with the end of the bookmark id when another
 * bookmark already owns that name (e.g. several bookmarks titled "Instagram" on the same day).
 *
 * @param folderPath - The sync folder
 * @param baseName - The name from sanitizeFileName, without extension
 * @param bookmarkId - The bookmark's id
 * @param localBookmarkFiles - Map of bookmark id to note path, for notes already in the vault
 * @returns The vault path of the note, with .md extension
 */
export function resolveBookmarkFilePath(
  folderPath: string,
  baseName: string,
  bookmarkId: string,
  localBookmarkFiles: Map<string, string>
): string {
  const existing = localBookmarkFiles.get(bookmarkId);
  if (existing) {
    return existing;
  }

  const path = `${folderPath}/${baseName}.md`;
  const takenPaths = new Set(localBookmarkFiles.values());
  if (!takenPaths.has(path)) {
    return path;
  }

  return `${folderPath}/${baseName}-${bookmarkId.slice(-6)}.md`;
}
