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
  const notesMatch = content.match(/## Notes\n\n?([\s\S]*?)(?=\n##|$)/);
  if (!notesMatch) return null;
  // Strip trailing markdown links (footer links like [Visit Link] and [View in Hoarder])
  const trimmed = notesMatch[1].replace(/(\n\[[\w\s]+\]\([^)]*\)\s*)+$/, "");
  return trimmed.trim();
}

/**
 * Splits markdown content into frontmatter and body.
 *
 * @param content - The full markdown file content
 * @returns An object with `frontmatter` (raw YAML string) and `body` (everything after closing ---)
 */
export function splitFrontmatterAndBody(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: "", body: content };
  }
  return { frontmatter: match[1], body: match[2] };
}

/**
 * Parses simple YAML frontmatter into a key-value map.
 * Handles scalar values, block scalars (|), and simple arrays (tags).
 * Designed specifically for the frontmatter format this plugin generates.
 */
export function parseFrontmatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    let value = kvMatch[2];

    // Block scalar (|)
    if (value === "|") {
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && /^  /.test(lines[i])) {
        blockLines.push(lines[i].substring(2));
        i++;
      }
      result[key] = blockLines.join("\n");
      continue;
    }

    // Array (indented "- " items)
    if (value === "" && i + 1 < lines.length && lines[i + 1].startsWith("  - ")) {
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith("  - ")) {
        items.push(lines[i].substring(4));
        i++;
      }
      result[key] = items;
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
    i++;
  }

  return result;
}

/**
 * Compares two markdown documents semantically, ignoring frontmatter formatting differences.
 * Returns true if the content has meaningfully changed.
 */
export function contentHasChanged(existingContent: string, newContent: string): boolean {
  const existing = splitFrontmatterAndBody(existingContent);
  const generated = splitFrontmatterAndBody(newContent);

  if (existing.body !== generated.body) {
    return true;
  }

  const existingFm = parseFrontmatter(existing.frontmatter);
  const generatedFm = parseFrontmatter(generated.frontmatter);
  const allKeys = new Set([...Object.keys(existingFm), ...Object.keys(generatedFm)]);

  for (const key of allKeys) {
    const a = existingFm[key];
    const b = generatedFm[key];

    // Treat missing/null and empty string as equivalent
    const normA = a === undefined || a === null ? "" : a;
    const normB = b === undefined || b === null ? "" : b;

    if (Array.isArray(normA) && Array.isArray(normB)) {
      if (normA.length !== normB.length || normA.some((v, i) => v !== normB[i])) {
        return true;
      }
    } else if (normA !== normB) {
      return true;
    }
  }

  return false;
}
