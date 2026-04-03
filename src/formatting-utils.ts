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
/**
 * Escapes square brackets in markdown alt text / link text so they don't
 * break the `![alt](url)` or `[text](url)` syntax.
 */
export function escapeAltText(text: string): string {
  return text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Strips dangerous HTML elements and attributes from crawled page content.
 * Keeps readable content (p, h1-h6, ul, ol, li, blockquote, a, img, em, strong, etc.)
 * but removes anything that could execute code or load external resources silently.
 */
export function sanitizeHtml(html: string): string {
  // Remove dangerous tags and their content entirely
  let safe = html.replace(
    /<(script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|applet|frame|frameset)[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // Remove self-closing dangerous tags
  safe = safe.replace(
    /<(script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|applet|frame|frameset)[^>]*\/?>/gi,
    ""
  );
  // Remove event handler attributes (on*)
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Remove javascript: URLs in href/src attributes
  safe = safe.replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
  // Remove data: URLs in src (can encode scripts)
  safe = safe.replace(/src\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, "");
  return safe;
}

export function escapeMarkdownPath(path: string): string {
  // If path contains spaces or other special characters, wrap in angle brackets
  if (path.includes(" ") || /[<>[\](){}]/.test(path)) {
    return `<${path}>`;
  }
  return path;
}
