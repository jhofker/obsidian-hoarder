/**
 * Escapes a string value for use in YAML frontmatter.
 *
 * Handles special YAML characters, newlines, and quotes to ensure
 * the value is properly formatted as a YAML scalar.
 *
 * @param str - The string to escape for YAML
 * @returns A properly escaped YAML value (may be quoted, block scalar, or plain)
 */
export function escapeYaml(str: string | null | undefined): string {
  if (!str) return "";

  // If string contains newlines or special characters, use block scalar
  if (str.includes("\n") || /[:#{}\[\],&*?|<>=!%@`]/.test(str)) {
    return `|\n  ${str.replace(/\n/g, "\n  ")}`;
  }

  // For simple strings, just wrap in quotes if needed
  if (str.includes('"')) {
    return `'${str}'`;
  }

  if (str.includes("'") || /^[ \t]|[ \t]$/.test(str)) {
    return `"${str.replace(/\"/g, '\\\"')}"`;
  }

  return str;
}

/**
 * Escapes a path string for use in Markdown links.
 *
 * Wraps paths containing spaces or special characters in angle brackets
 * to ensure they work properly in Markdown link syntax.
 *
 * @param path - The path to escape
 * @returns The path, potentially wrapped in angle brackets
 */
export function escapeMarkdownPath(path: string): string {
  // If path contains spaces or other special characters, wrap in angle brackets
  if (path.includes(" ") || /[<>[\](){}]/.test(path)) {
    return `<${path}>`;
  }
  return path;
}
