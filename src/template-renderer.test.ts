import { AssetFrontmatter } from "./asset-handler";
import { escapeMarkdownPath, escapeYaml } from "./formatting-utils";
import { HoarderBookmark, HoarderHighlight } from "./hoarder-client";
import { DEFAULT_SETTINGS, HoarderSettings } from "./settings";
import { sanitizeTags } from "./tag-utils";
import { NOTE_BLOCK_START, NOTE_BLOCK_END } from "./template-renderer";
import {
  DEFAULT_TEMPLATE,
  buildTemplateContext,
  renderTemplate,
  renderWithFallback,
  validateTemplate,
} from "./template-renderer";

// Reference implementation of the expected DEFAULT_TEMPLATE output.
// Used to verify the template produces the correct format.
function referenceFormat(
  bookmark: HoarderBookmark,
  title: string,
  highlights: HoarderHighlight[],
  assetContent: string,
  assetsFm: AssetFrontmatter | null,
  settings: HoarderSettings
): string {
  const url = bookmark.content.type === "link" ? bookmark.content.url : bookmark.content.sourceUrl;
  const description =
    bookmark.content.type === "link" ? bookmark.content.description : bookmark.content.text;
  const rawTags = bookmark.tags.map((tag) => tag.name);
  const tags = sanitizeTags(rawTags);

  let assetsYaml = "";
  if (assetsFm) {
    const lines: string[] = [];
    if (assetsFm.image) lines.push(`image: ${assetsFm.image}`);
    if (assetsFm.banner) lines.push(`banner: ${assetsFm.banner}`);
    if (assetsFm.screenshot) lines.push(`screenshot: ${assetsFm.screenshot}`);
    if (assetsFm.full_page_archive) lines.push(`full_page_archive: ${assetsFm.full_page_archive}`);
    if (assetsFm.pdf_archive) lines.push(`pdf_archive: ${assetsFm.pdf_archive}`);
    if (assetsFm.video) lines.push(`video: ${assetsFm.video}`);
    if (assetsFm.additional && assetsFm.additional.length > 0) {
      lines.push("additional:");
      for (const link of assetsFm.additional) {
        lines.push(`  - ${link}`);
      }
    }
    assetsYaml = lines.join("\n") + "\n";
  }

  const tagsYaml = tags.length > 0 ? `tags:\n  - ${tags.join("\n  - ")}\n` : "";

  let content = `---
bookmark_id: "${bookmark.id}"
url: ${escapeYaml(url)}
title: ${escapeYaml(title)}
date: ${new Date(bookmark.createdAt).toISOString()}
${bookmark.modifiedAt ? `modified: ${new Date(bookmark.modifiedAt).toISOString()}\n` : ""}${tagsYaml}note: ${escapeYaml(bookmark.note)}
original_note: ${escapeYaml(bookmark.note)}
summary: ${escapeYaml(bookmark.summary)}
${assetsYaml}
---

# ${title}
`;

  content += assetContent;

  if (bookmark.summary) {
    content += `\n## Summary\n\n${bookmark.summary}\n`;
  }

  if (description) {
    content += `\n## Description\n\n${description}\n`;
  }

  if (highlights && highlights.length > 0 && settings.syncHighlights) {
    content += `\n## Highlights\n\n`;

    const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);

    for (const highlight of sortedHighlights) {
      const date = new Date(highlight.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      content += `> [!karakeep-${highlight.color}] ${date}\n`;

      const highlightLines = highlight.text.split("\n");
      for (const line of highlightLines) {
        content += `> ${line}\n`;
      }

      if (highlight.note && highlight.note.trim()) {
        content += `>\n`;
        const noteLines = highlight.note.split("\n");
        for (let i = 0; i < noteLines.length; i++) {
          if (i === 0) {
            content += `> *Note: ${noteLines[i]}*\n`;
          } else {
            content += `> *${noteLines[i]}*\n`;
          }
        }
      }

      content += `\n`;
    }
  }

  content += `\n## Notes\n\n${bookmark.note || ""}\n`;

  if (url && bookmark.content.type !== "asset") {
    content += `\n[Visit Link](${escapeMarkdownPath(url)})\n`;
  }
  const hoarderUrl = `${settings.apiEndpoint.replace("/api/v1", "/dashboard/preview")}/${bookmark.id}`;
  content += `\n[View in Hoarder](${escapeMarkdownPath(hoarderUrl)})`;

  return content;
}

function makeSettings(overrides: Partial<HoarderSettings> = {}): HoarderSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiEndpoint: "https://karakeep.example.com/api/v1",
    syncHighlights: true,
    ...overrides,
  };
}

function makeBookmark(overrides: Partial<HoarderBookmark> = {}): HoarderBookmark {
  return {
    id: "bm-123",
    createdAt: "2024-06-15T10:30:00.000Z",
    modifiedAt: null,
    archived: false,
    favourited: false,
    taggingStatus: "success",
    note: null,
    summary: null,
    tags: [],
    assets: [],
    content: {
      type: "link",
      url: "https://example.com/article",
      title: "Example Article",
      description: "A great article about testing",
    },
    ...overrides,
  };
}

function makeHighlight(overrides: Partial<HoarderHighlight> = {}): HoarderHighlight {
  return {
    id: "h-1",
    bookmarkId: "bm-123",
    startOffset: 0,
    endOffset: 50,
    color: "yellow",
    text: "This is highlighted text",
    note: "",
    userId: "user-1",
    createdAt: "2024-06-15T12:00:00.000Z",
    ...overrides,
  };
}

function assertParity(
  bookmark: HoarderBookmark,
  title: string,
  highlights: HoarderHighlight[],
  assetContent: string,
  assetsFm: AssetFrontmatter | null,
  settings: HoarderSettings
) {
  const expected = referenceFormat(bookmark, title, highlights, assetContent, assetsFm, settings);
  const context = buildTemplateContext(
    bookmark,
    title,
    highlights,
    assetContent,
    assetsFm,
    settings
  );
  const actual = renderTemplate(DEFAULT_TEMPLATE, context);
  expect(actual).toBe(expected);
}

describe("DEFAULT_TEMPLATE parity", () => {
  it("should match for a minimal link bookmark", () => {
    const bookmark = makeBookmark({ summary: null, note: null });
    const settings = makeSettings();
    assertParity(bookmark, "Example Article", [], "", null, settings);
  });

  it("should match for a link bookmark with all fields", () => {
    const bookmark = makeBookmark({
      summary: "This is the AI summary",
      note: "My personal notes here",
      modifiedAt: "2024-07-01T08:00:00.000Z",
      tags: [
        { id: "t1", name: "javascript", attachedBy: "human" },
        { id: "t2", name: "testing", attachedBy: "ai" },
      ],
    });
    const settings = makeSettings();
    assertParity(bookmark, "Example Article", [], "", null, settings);
  });

  it("should match for a text bookmark", () => {
    const bookmark = makeBookmark({
      content: {
        type: "text",
        text: "Some stored text content",
        sourceUrl: null,
      },
    });
    const settings = makeSettings();
    assertParity(bookmark, "Text Note", [], "", null, settings);
  });

  it("should match for an asset bookmark (no visit link)", () => {
    const bookmark = makeBookmark({
      content: {
        type: "asset",
        assetType: "image",
        assetId: "asset-1",
        sourceUrl: "https://example.com/image.png",
      },
    });
    const settings = makeSettings();
    assertParity(
      bookmark,
      "My Image",
      [],
      "\n![My Image](https://example.com/image.png)\n",
      null,
      settings
    );
  });

  it("should match for a bookmark with highlights", () => {
    const bookmark = makeBookmark({ note: "My notes" });
    const highlights = [
      makeHighlight({
        id: "h-1",
        startOffset: 100,
        text: "Second highlight",
        color: "blue",
        createdAt: "2024-06-16T10:00:00.000Z",
      }),
      makeHighlight({
        id: "h-2",
        startOffset: 10,
        text: "First highlight",
        color: "yellow",
        note: "Important point",
        createdAt: "2024-06-15T12:00:00.000Z",
      }),
    ];
    const settings = makeSettings();
    assertParity(bookmark, "Article with Highlights", highlights, "", null, settings);
  });

  it("should match for a bookmark with multi-line highlight text and notes", () => {
    const bookmark = makeBookmark();
    const highlights = [
      makeHighlight({
        text: "Line one\nLine two\nLine three",
        note: "Note line one\nNote line two",
      }),
    ];
    const settings = makeSettings();
    assertParity(bookmark, "Multi-line", highlights, "", null, settings);
  });

  it("should match when highlights are disabled", () => {
    const bookmark = makeBookmark();
    const highlights = [makeHighlight()];
    const settings = makeSettings({ syncHighlights: false });
    assertParity(bookmark, "No Highlights", highlights, "", null, settings);
  });

  it("should match with asset frontmatter", () => {
    const bookmark = makeBookmark();
    const assetsFm: AssetFrontmatter = {
      banner: '"[[Hoarder/attachments/img-1.jpg]]"',
      screenshot: '"[[Hoarder/attachments/ss-1.png]]"',
    };
    const settings = makeSettings();
    assertParity(bookmark, "With Assets", [], "\n![Banner](img-1.jpg)\n", assetsFm, settings);
  });

  it("should match with all asset frontmatter fields", () => {
    const bookmark = makeBookmark();
    const assetsFm: AssetFrontmatter = {
      image: '"[[Hoarder/attachments/img.jpg]]"',
      banner: '"[[Hoarder/attachments/banner.jpg]]"',
      screenshot: '"[[Hoarder/attachments/ss.png]]"',
      full_page_archive: '"[[Hoarder/attachments/archive.mhtml]]"',
      pdf_archive: '"[[Hoarder/attachments/doc.pdf]]"',
      video: '"[[Hoarder/attachments/vid.mp4]]"',
      additional: ['"[[Hoarder/attachments/extra1.jpg]]"', '"[[Hoarder/attachments/extra2.png]]"'],
    };
    const settings = makeSettings();
    assertParity(bookmark, "All Assets", [], "", assetsFm, settings);
  });

  it("should match with special YAML characters in fields", () => {
    const bookmark = makeBookmark({
      note: "Note with: colons and #hashtags",
      summary: "Summary with [brackets] and {braces}",
      content: {
        type: "link",
        url: "https://example.com/path?query=value&other=true",
        title: "Title: With Special Characters!",
        description: "Description with \"quotes\" and 'apostrophes'",
      },
    });
    const settings = makeSettings();
    assertParity(bookmark, "Title: With Special Characters!", [], "", null, settings);
  });

  it("should match with empty note and summary", () => {
    const bookmark = makeBookmark({ note: "", summary: "" });
    const settings = makeSettings();
    assertParity(bookmark, "Empty Fields", [], "", null, settings);
  });
});

describe("buildTemplateContext", () => {
  it("should derive url from link content", () => {
    const bookmark = makeBookmark({
      content: { type: "link", url: "https://example.com" },
    });
    const ctx = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    expect(ctx.url).toBe("https://example.com");
    expect(ctx.visit_link).toBe("https://example.com");
  });

  it("should derive url from asset sourceUrl", () => {
    const bookmark = makeBookmark({
      content: { type: "asset", sourceUrl: "https://example.com/img.png", assetType: "image" },
    });
    const ctx = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    expect(ctx.url).toBe("https://example.com/img.png");
    expect(ctx.visit_link).toBeNull(); // asset type has no visit link
  });

  it("should sort highlights by startOffset", () => {
    const highlights = [
      makeHighlight({ id: "h-2", startOffset: 100 }),
      makeHighlight({ id: "h-1", startOffset: 10 }),
    ];
    const ctx = buildTemplateContext(makeBookmark(), "Test", highlights, "", null, makeSettings());
    expect(ctx.highlights[0].id).toBe("h-1");
    expect(ctx.highlights[1].id).toBe("h-2");
  });

  it("should pre-escape YAML values", () => {
    const bookmark = makeBookmark({
      content: { type: "link", url: "https://example.com?q=1&r=2" },
      note: "Note with: colons",
    });
    const ctx = buildTemplateContext(bookmark, "Simple Title", [], "", null, makeSettings());
    expect(ctx.yaml.title).toBe("Simple Title");
    expect(ctx.yaml.note).toContain("Note with");
    expect(ctx.yaml.url).toBeTruthy();
  });

  it("should format highlight dates", () => {
    const highlights = [makeHighlight({ createdAt: "2024-01-15T10:30:00.000Z" })];
    const ctx = buildTemplateContext(makeBookmark(), "Test", highlights, "", null, makeSettings());
    expect(ctx.highlights[0].date).toBe("January 15, 2024");
  });

  it("should expose content_html", () => {
    const bookmark = makeBookmark({
      content: {
        type: "link",
        url: "https://example.com",
        htmlContent: "<p>Full page content</p>",
      },
    });
    const ctx = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    expect(ctx.content_html).toBe("<p>Full page content</p>");
  });

  it("should wrap note in comment block markers", () => {
    const bookmark = makeBookmark({ note: "My editable note" });
    const ctx = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    expect(ctx.note).toBe("My editable note");
    expect(ctx.noteBlock).toBe(
      `${NOTE_BLOCK_START}\nMy editable note\n${NOTE_BLOCK_END}`
    );
  });

  it("should handle empty note in noteBlock", () => {
    const bookmark = makeBookmark({ note: "" });
    const ctx = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    expect(ctx.noteBlock).toBe(`${NOTE_BLOCK_START}\n\n${NOTE_BLOCK_END}`);
  });
});

describe("validateTemplate", () => {
  it("should accept valid Eta syntax", () => {
    const result = validateTemplate("<%= it.title %>");
    expect(result.valid).toBe(true);
  });

  it("should accept the DEFAULT_TEMPLATE with no warnings", () => {
    const result = validateTemplate(DEFAULT_TEMPLATE);
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
  });

  it("should reject invalid syntax", () => {
    const result = validateTemplate("<% if (it.title { %>");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Syntax error");
  });

  it("should reject templates that crash at render time", () => {
    const result = validateTemplate("<%= it.nonExistent.deep.property %>");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Render error");
  });

  it("should warn when frontmatter delimiters are missing", () => {
    const result = validateTemplate("# <%= it.title %>\n<%= it.note %>");
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      "Template output is missing YAML frontmatter (--- delimiters)"
    );
  });

  it("should warn when bookmark_id is missing", () => {
    const result = validateTemplate("---\ntitle: test\n---\n# Test");
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bookmark_id"),
      ])
    );
  });

  it("should warn when original_note is missing", () => {
    const result = validateTemplate(
      "---\nbookmark_id: test\n---\n# Test\n\n## Notes\n\ntest"
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("original_note"),
      ])
    );
  });

  it("should warn when Notes section is missing", () => {
    const result = validateTemplate(
      "---\nbookmark_id: test\noriginal_note: test\n---\n# Test"
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("## Notes"),
      ])
    );
  });
});

describe("renderWithFallback", () => {
  it("should fall back to DEFAULT_TEMPLATE on error", () => {
    const bookmark = makeBookmark();
    const context = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());

    // This template references an undefined function, which will throw at render time
    const brokenTemplate = "<%= it.nonExistentFunction() %>";
    const result = renderWithFallback(brokenTemplate, context);

    // Should produce valid output from the default template
    expect(result).toContain("bookmark_id");
    expect(result).toContain("Test");
  });
});

describe("custom template", () => {
  it("should render a simple custom template", () => {
    const bookmark = makeBookmark({ note: "My note" });
    const context = buildTemplateContext(bookmark, "My Title", [], "", null, makeSettings());
    const customTemplate = `# <%= it.title %>\n\n<%= it.note %>`;
    const result = renderTemplate(customTemplate, context);
    expect(result).toBe("# My Title\n\nMy note");
  });

  it("should provide helper functions in context", () => {
    const bookmark = makeBookmark();
    const context = buildTemplateContext(bookmark, "Test", [], "", null, makeSettings());
    const template = `<%= it.escapeYaml("value: with colons") %>`;
    const result = renderTemplate(template, context);
    expect(result).toContain("value");
  });
});
