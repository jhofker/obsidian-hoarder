/**
 * Extracts the content of the "## Notes" section from markdown text.
 *
 * The pattern matches:
 * - "## Notes\n\n" followed by content
 * - Content continues until:
 *   - Another section header (\n##)
 *   - A link (\n[)
 *   - End of string
 *
 * @param content - The markdown content to parse
 * @returns The notes content (trimmed), or null if no notes section found
 */
export function extractNotesSection(content: string): string | null {
  const notesMatch = content.match(/## Notes\n\n([\s\S]*?)(?=\n##|\n\[|$)/);
  return notesMatch ? notesMatch[1].trim() : null;
}
