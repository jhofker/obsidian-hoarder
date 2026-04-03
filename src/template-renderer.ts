import { Eta } from "eta";

import { AssetFrontmatter } from "./asset-handler";
import { escapeMarkdownPath, escapeYaml, sanitizeHtml } from "./formatting-utils";
import { HoarderBookmark, HoarderHighlight } from "./hoarder-client";
import { HoarderSettings } from "./settings";
import { sanitizeTags } from "./tag-utils";

export interface TemplateContext {
  bookmark_id: string;
  title: string;
  url: string | undefined | null;
  description: string | undefined | null;
  created_at: string;
  modified_at: string | null;
  note: string;
  summary: string | undefined | null;
  archived: boolean;
  favourited: boolean;
  content_type: string;
  content_html: string | undefined | null;
  tags: string[];
  yaml: {
    url: string;
    title: string;
    note: string;
    summary: string;
  };
  assets: {
    content: string;
    image?: string;
    banner?: string;
    screenshot?: string;
    full_page_archive?: string;
    pdf_archive?: string;
    video?: string;
    additional?: string[];
  };
  highlights: Array<{
    id: string;
    color: string;
    text: string;
    note: string;
    date: string;
    created_at: string;
  }>;
  hoarder_url: string;
  visit_link: string | null;
  sync_highlights: boolean;
  escapeYaml: (str: string | null | undefined) => string;
  escapeMarkdownPath: (path: string) => string;
  formatDate: (iso: string) => string;
}

// The default template reproduces the exact output of the original formatBookmarkAsMarkdown().
// Whitespace is critical — every newline and space must match.
export const DEFAULT_TEMPLATE = `---
bookmark_id: "<%= it.bookmark_id %>"
url: <%= it.yaml.url %>
title: <%= it.yaml.title %>
date: <%= it.created_at %>
<% if (it.modified_at) { %>modified: <%= it.modified_at %>
<% } %><% if (it.tags.length > 0) { %>tags:
<% it.tags.forEach(function(tag) { %>  - <%= tag %>
<% }) %><% } %>note: <%= it.yaml.note %>
original_note: <%= it.yaml.note %>
summary: <%= it.yaml.summary %>
<% if (it.assets.image) { %>image: <%= it.assets.image %>
<% } %><% if (it.assets.banner) { %>banner: <%= it.assets.banner %>
<% } %><% if (it.assets.screenshot) { %>screenshot: <%= it.assets.screenshot %>
<% } %><% if (it.assets.full_page_archive) { %>full_page_archive: <%= it.assets.full_page_archive %>
<% } %><% if (it.assets.pdf_archive) { %>pdf_archive: <%= it.assets.pdf_archive %>
<% } %><% if (it.assets.video) { %>video: <%= it.assets.video %>
<% } %><% if (it.assets.additional && it.assets.additional.length > 0) { %>additional:
<% it.assets.additional.forEach(function(link) { %>  - <%= link %>
<% }) %><% } %>
---

# <%= it.title %>
<%= it.assets.content %><% if (it.summary) { %>
## Summary

<%= it.summary %>
<% } %><% if (it.description) { %>
## Description

<%= it.description %>
<% } %><% if (it.highlights.length > 0 && it.sync_highlights) { %>
## Highlights

<% it.highlights.forEach(function(h) { %>> [!karakeep-<%= h.color %>] <%= h.date %>
<%= h.text.split('\\n').map(function(line) { return '> ' + line }).join('\\n') %>
<% if (h.note && h.note.trim()) { %>>
<%= h.note.split('\\n').map(function(line, i) { return i === 0 ? '> *Note: ' + line + '*' : '> *' + line + '*' }).join('\\n') %>
<% } %>
<% }) %><% } %>
## Notes

<%= it.note %>
<% if (it.visit_link) { %>
[Visit Link](<%= it.visit_link %>)
<% } %>
[View in Hoarder](<%= it.escapeMarkdownPath(it.hoarder_url) %>)`;

const eta = new Eta({ autoEscape: false, autoTrim: false });

// Cache compiled templates to avoid recompilation on every render
const compiledTemplateCache = new Map<string, ReturnType<typeof eta.compile>>();

function getCompiledTemplate(templateString: string): ReturnType<typeof eta.compile> {
  let compiled = compiledTemplateCache.get(templateString);
  if (!compiled) {
    compiled = eta.compile(templateString);
    compiledTemplateCache.set(templateString, compiled);
  }
  return compiled;
}

function formatHighlightDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildTemplateContext(
  bookmark: HoarderBookmark,
  title: string,
  highlights: HoarderHighlight[] | undefined,
  assetContent: string,
  assetsFm: AssetFrontmatter | null,
  settings: HoarderSettings
): TemplateContext {
  const url = bookmark.content.type === "link" ? bookmark.content.url : bookmark.content.sourceUrl;
  const description =
    bookmark.content.type === "link" ? bookmark.content.description : bookmark.content.text;
  const rawTags = bookmark.tags.map((tag) => tag.name);
  const tags = sanitizeTags(rawTags);

  // Only sort and format highlights when they'll actually be rendered
  const sortedHighlights =
    highlights && highlights.length > 0 && settings.syncHighlights
      ? [...highlights].sort((a, b) => a.startOffset - b.startOffset)
      : [];

  const hoarderUrl = `${settings.apiEndpoint.replace("/api/v1", "/dashboard/preview")}/${bookmark.id}`;

  return {
    bookmark_id: bookmark.id,
    title,
    url,
    description,
    created_at: new Date(bookmark.createdAt).toISOString(),
    modified_at: bookmark.modifiedAt ? new Date(bookmark.modifiedAt).toISOString() : null,
    note: bookmark.note || "",
    summary: bookmark.summary,
    archived: bookmark.archived,
    favourited: bookmark.favourited,
    content_type: bookmark.content.type,
    content_html: bookmark.content.htmlContent ? sanitizeHtml(bookmark.content.htmlContent) : null,
    tags,
    yaml: {
      url: escapeYaml(url),
      title: escapeYaml(title),
      note: escapeYaml(bookmark.note),
      summary: escapeYaml(bookmark.summary),
    },
    assets: {
      content: assetContent,
      image: assetsFm?.image,
      banner: assetsFm?.banner,
      screenshot: assetsFm?.screenshot,
      full_page_archive: assetsFm?.full_page_archive,
      pdf_archive: assetsFm?.pdf_archive,
      video: assetsFm?.video,
      additional: assetsFm?.additional,
    },
    highlights: sortedHighlights.map((h) => ({
      id: h.id,
      color: h.color,
      text: h.text,
      note: h.note,
      date: formatHighlightDate(h.createdAt),
      created_at: h.createdAt,
    })),
    hoarder_url: hoarderUrl,
    visit_link: url && bookmark.content.type !== "asset" ? escapeMarkdownPath(url) : null,
    sync_highlights: settings.syncHighlights,
    escapeYaml,
    escapeMarkdownPath,
    formatDate: formatHighlightDate,
  };
}

export function renderTemplate(templateString: string, context: TemplateContext): string {
  const compiled = getCompiledTemplate(templateString);
  return eta.render(compiled, context);
}

export function renderWithFallback(templateString: string, context: TemplateContext): string {
  try {
    return renderTemplate(templateString, context);
  } catch (error) {
    console.error("[Hoarder] Template rendering failed, using default:", error);
    return renderTemplate(DEFAULT_TEMPLATE, context);
  }
}

// Sample context used for test-rendering during validation
const SAMPLE_CONTEXT: TemplateContext = {
  bookmark_id: "sample-id",
  title: "Sample Bookmark",
  url: "https://example.com",
  description: "A sample description",
  created_at: "2024-01-15T10:30:00.000Z",
  modified_at: null,
  note: "",
  summary: "A sample summary",
  archived: false,
  favourited: false,
  content_type: "link",
  content_html: null,
  tags: ["sample-tag"],
  yaml: {
    url: "https://example.com",
    title: "Sample Bookmark",
    note: "",
    summary: "A sample summary",
  },
  assets: { content: "" },
  highlights: [
    {
      id: "h-1",
      color: "yellow",
      text: "Sample highlight",
      note: "",
      date: "January 15, 2024",
      created_at: "2024-01-15T12:00:00.000Z",
    },
  ],
  hoarder_url: "https://example.com/dashboard/preview/sample-id",
  visit_link: "https://example.com",
  sync_highlights: true,
  escapeYaml,
  escapeMarkdownPath,
  formatDate: formatHighlightDate,
};

export function validateTemplate(
  templateString: string
): { valid: boolean; error?: string; warnings?: string[] } {
  // 1. Check syntax (compilation)
  try {
    eta.compile(templateString);
  } catch (error: any) {
    return { valid: false, error: `Syntax error: ${error.message || String(error)}` };
  }

  // 2. Test render with sample data
  let rendered: string;
  try {
    rendered = renderTemplate(templateString, SAMPLE_CONTEXT);
  } catch (error: any) {
    return { valid: false, error: `Render error: ${error.message || String(error)}` };
  }

  // 3. Check output structure
  const warnings: string[] = [];

  if (!rendered.startsWith("---\n") || !rendered.includes("\n---\n")) {
    warnings.push("Template output is missing YAML frontmatter (--- delimiters)");
  }

  if (!rendered.includes("bookmark_id:")) {
    warnings.push("Template output is missing bookmark_id in frontmatter");
  }

  if (!rendered.includes("original_note:")) {
    warnings.push(
      "Template output is missing original_note — bi-directional sync will not work"
    );
  }

  if (!/## Notes\b/.test(rendered)) {
    warnings.push("Template output is missing ## Notes section — bi-directional sync will not work");
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}
