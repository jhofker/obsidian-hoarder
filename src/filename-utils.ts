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

  // Sanitize the title
  let sanitizedTitle = title
    .replace(/[\\/:*?"<>|]/g, "-") // Replace invalid filesystem characters with dash
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
