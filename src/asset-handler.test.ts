import {
  isImageExtension,
  processBookmarkAssets,
  resolveAssetExtension,
  sanitizeAssetFileName,
} from "./asset-handler";
import { HoarderBookmark } from "./hoarder-client";
import { DEFAULT_SETTINGS, HoarderSettings } from "./settings";

// Helper to build a minimal mock App with vault adapter
function createMockApp(existingFiles: string[] = []) {
  const writtenFiles: { path: string; data: ArrayBuffer }[] = [];
  const removedFiles: string[] = [];
  const createdFolders: string[] = [];

  return {
    app: {
      vault: {
        adapter: {
          exists: jest.fn(async (path: string) => {
            // Check if it's a folder that was created or the attachments folder with files
            return createdFolders.includes(path) || existingFiles.some((f) => f.startsWith(path));
          }),
          list: jest.fn(async (_path: string) => ({
            files: existingFiles,
            folders: [],
          })),
          writeBinary: jest.fn(async (path: string, data: ArrayBuffer) => {
            writtenFiles.push({ path, data });
          }),
          remove: jest.fn(async (path: string) => {
            removedFiles.push(path);
          }),
        },
        createFolder: jest.fn(async (path: string) => {
          createdFolders.push(path);
        }),
      },
    } as any,
    writtenFiles,
    removedFiles,
    createdFolders,
  };
}

function createMockClient(contentType: string = "image/jpeg") {
  return {
    downloadAsset: jest.fn(async (_assetId: string) => ({
      buffer: new ArrayBuffer(8),
      contentType,
    })),
    getAssetUrl: jest.fn((assetId: string) => `https://karakeep.example.com/assets/${assetId}`),
  } as any;
}

function createBookmark(overrides: Partial<HoarderBookmark> = {}): HoarderBookmark {
  return {
    id: "bm-1",
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: null,
    archived: false,
    favourited: false,
    taggingStatus: null,
    tags: [],
    assets: [],
    content: {
      type: "link",
      url: "https://example.com/article",
      imageAssetId: "img-asset-1",
    },
    ...overrides,
  };
}

function createSettings(overrides: Partial<HoarderSettings> = {}): HoarderSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiEndpoint: "https://karakeep.example.com/api/v1",
    attachmentsFolder: "Hoarder/attachments",
    downloadAssets: true,
    ...overrides,
  };
}

describe("sanitizeAssetFileName", () => {
  describe("invalid character replacement", () => {
    it("should replace backslash with dash", () => {
      expect(sanitizeAssetFileName("file\\name")).toBe("file-name");
    });

    it("should replace forward slash with dash", () => {
      expect(sanitizeAssetFileName("path/to/file")).toBe("path-to-file");
    });

    it("should replace colon with dash", () => {
      expect(sanitizeAssetFileName("time:12:30")).toBe("time-12-30");
    });

    it("should replace asterisk with dash", () => {
      expect(sanitizeAssetFileName("file*name")).toBe("file-name");
    });

    it("should replace question mark with dash", () => {
      expect(sanitizeAssetFileName("what?yes")).toBe("what-yes");
    });

    it("should replace double quotes with dash", () => {
      expect(sanitizeAssetFileName('say "hello"')).toBe("say-hello");
    });

    it("should replace angle brackets with dash", () => {
      expect(sanitizeAssetFileName("a<b>c")).toBe("a-b-c");
    });

    it("should replace pipe with dash", () => {
      expect(sanitizeAssetFileName("a|b")).toBe("a-b");
    });
  });

  describe("space handling", () => {
    it("should replace single space with dash", () => {
      expect(sanitizeAssetFileName("my image")).toBe("my-image");
    });

    it("should replace multiple spaces with single dash", () => {
      expect(sanitizeAssetFileName("my  image")).toBe("my-image");
    });

    it("should replace tabs with dash", () => {
      expect(sanitizeAssetFileName("a\tb")).toBe("a-b");
    });
  });

  describe("dash normalisation", () => {
    it("should collapse consecutive dashes into one", () => {
      expect(sanitizeAssetFileName("a--b")).toBe("a-b");
    });

    it("should remove leading dash", () => {
      expect(sanitizeAssetFileName("-title")).toBe("title");
    });

    it("should remove trailing dash", () => {
      expect(sanitizeAssetFileName("title-")).toBe("title");
    });

    it("should remove both leading and trailing dashes", () => {
      expect(sanitizeAssetFileName("-title-")).toBe("title");
    });
  });

  describe("length limiting at 30 characters", () => {
    it("should not truncate titles under 30 chars", () => {
      expect(sanitizeAssetFileName("short title")).toBe("short-title");
    });

    it("should not truncate a title of exactly 30 chars", () => {
      const title = "a".repeat(30);
      expect(sanitizeAssetFileName(title)).toBe(title);
    });

    it("should truncate at a word boundary when one exists in the first half", () => {
      // 'this is a very long title that' = 30 chars after sanitize
      const title = "this is a very long title that exceeds the limit";
      const result = sanitizeAssetFileName(title);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).not.toMatch(/-$/);
      // Should cut before a word boundary, not mid-word
      expect(result).toMatch(/^this-is-a-very-long-title/);
    });

    it("should hard-truncate when no word boundary is in the first half", () => {
      const title = "a".repeat(40);
      const result = sanitizeAssetFileName(title);
      expect(result.length).toBe(30);
    });
  });

  describe("edge cases", () => {
    it("should return empty string for empty input", () => {
      expect(sanitizeAssetFileName("")).toBe("");
    });

    it("should return empty string for a title of only invalid characters", () => {
      // '***' → '---' → '-' → ''
      expect(sanitizeAssetFileName("***")).toBe("");
    });

    it("should handle a title that is only spaces", () => {
      // '   ' → '---' → '-' → ''
      expect(sanitizeAssetFileName("   ")).toBe("");
    });

    it("should handle normal alphanumeric titles unchanged", () => {
      expect(sanitizeAssetFileName("MyPhoto123")).toBe("MyPhoto123");
    });

    it("should strip periods to avoid fake extensions", () => {
      expect(sanitizeAssetFileName("Keeper.sh-Calendar-Syncing,")).toBe("Keeper-sh-Calendar-Syncing");
    });

    it("should strip commas, semicolons, and other punctuation", () => {
      expect(sanitizeAssetFileName("hello, world; foo & bar")).toBe("hello-world-foo-bar");
    });

    it("should strip parentheses and brackets", () => {
      expect(sanitizeAssetFileName("article (draft) [v2]")).toBe("article-draft-v2");
    });

    it("should strip hash and at signs", () => {
      expect(sanitizeAssetFileName("issue #42 @user")).toBe("issue-42-user");
    });
  });
});

describe("resolveAssetExtension", () => {
  describe("Content-Type header detection", () => {
    it("should detect JPEG from content-type", () => {
      expect(resolveAssetExtension("image/jpeg", "Banner Image", "")).toBe("jpg");
    });

    it("should detect PNG from content-type", () => {
      expect(resolveAssetExtension("image/png", "Screenshot", "")).toBe("png");
    });

    it("should detect PDF from content-type", () => {
      expect(resolveAssetExtension("application/pdf", "Unknown", "")).toBe("pdf");
    });

    it("should detect HTML from content-type", () => {
      expect(resolveAssetExtension("text/html", "Full Page Archive", "")).toBe("html");
    });

    it("should detect MHTML from content-type", () => {
      expect(resolveAssetExtension("multipart/related", "Full Page Archive", "")).toBe("mhtml");
    });

    it("should strip charset from content-type", () => {
      expect(resolveAssetExtension("text/html; charset=utf-8", "Archive", "")).toBe("html");
    });

    it("should detect WebP from content-type", () => {
      expect(resolveAssetExtension("image/webp", "Banner Image", "")).toBe("webp");
    });
  });

  describe("asset label fallback", () => {
    it("should return pdf for PDF labels", () => {
      expect(resolveAssetExtension(null, "PDF Archive", "")).toBe("pdf");
    });

    it("should return mhtml for Full Page Archive labels", () => {
      expect(resolveAssetExtension(null, "Full Page Archive", "")).toBe("mhtml");
    });

    it("should return png for Screenshot labels", () => {
      expect(resolveAssetExtension(null, "Screenshot", "")).toBe("png");
    });
  });

  describe("URL extension fallback", () => {
    it("should detect png from URL", () => {
      expect(resolveAssetExtension(null, "Additional Image", "https://example.com/img.png")).toBe(
        "png"
      );
    });

    it("should detect pdf from URL", () => {
      expect(resolveAssetExtension(null, "Unknown", "https://example.com/doc.pdf")).toBe("pdf");
    });

    it("should ignore query strings in URL", () => {
      expect(
        resolveAssetExtension(null, "Additional Image", "https://example.com/img.png?w=100")
      ).toBe("png");
    });

    it("should ignore unsupported extensions", () => {
      expect(resolveAssetExtension(null, "Unknown", "https://example.com/assets/abc123")).toBe(
        "jpg"
      );
    });
  });

  describe("default fallback", () => {
    it("should default to jpg when nothing matches", () => {
      expect(resolveAssetExtension(null, "Unknown", "")).toBe("jpg");
    });

    it("should default to jpg for Karakeep asset URLs with no extension", () => {
      expect(
        resolveAssetExtension(null, "Additional Image", "https://karakeep.example.com/assets/abc")
      ).toBe("jpg");
    });
  });

  describe("priority order", () => {
    it("should prefer content-type over label", () => {
      // Content-type says PNG, label says Screenshot (which maps to PNG anyway)
      expect(resolveAssetExtension("image/jpeg", "Screenshot", "")).toBe("jpg");
    });

    it("should prefer content-type over URL extension", () => {
      expect(
        resolveAssetExtension("application/pdf", "Unknown", "https://example.com/file.jpg")
      ).toBe("pdf");
    });
  });
});

describe("isImageExtension", () => {
  it("should return true for image extensions", () => {
    expect(isImageExtension("jpg")).toBe(true);
    expect(isImageExtension("jpeg")).toBe(true);
    expect(isImageExtension("png")).toBe(true);
    expect(isImageExtension("gif")).toBe(true);
    expect(isImageExtension("webp")).toBe(true);
    expect(isImageExtension("svg")).toBe(true);
  });

  it("should return false for non-image extensions", () => {
    expect(isImageExtension("pdf")).toBe(false);
    expect(isImageExtension("html")).toBe(false);
    expect(isImageExtension("mhtml")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isImageExtension("JPG")).toBe(true);
    expect(isImageExtension("PNG")).toBe(true);
    expect(isImageExtension("PDF")).toBe(false);
  });
});

describe("processBookmarkAssets", () => {
  describe("correct extension detection", () => {
    it("should save a banner image with correct extension from content-type", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("image/png");
      const bookmark = createBookmark();
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "Test Article", client, settings);

      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.png$/);
    });

    it("should save a PDF asset with .pdf extension", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "My Document", client, settings);

      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.pdf$/);
    });

    it("should save a full page archive with .mhtml extension", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("multipart/related");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          fullPageArchiveAssetId: "archive-1",
        },
      });
      const settings = createSettings({ downloadFullPageArchives: true });

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.mhtml$/);
    });

    it("should save a screenshot with extension from content-type", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("image/png");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          screenshotAssetId: "screenshot-1",
        },
      });
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.png$/);
    });
  });

  describe("cleanup of broken files", () => {
    it("should replace a PDF saved as .jpg with correct .pdf file", async () => {
      const { app, writtenFiles, removedFiles } = createMockApp([
        "Hoarder/attachments/pdf-asset-1-My-Document.jpg",
      ]);
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "My Document", client, settings);

      // Should have written the new .pdf file
      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.pdf$/);

      // Should have removed the old .jpg file
      expect(removedFiles).toContain("Hoarder/attachments/pdf-asset-1-My-Document.jpg");
    });

    it("should replace an MHTML archive saved as .jpg with correct .mhtml file", async () => {
      const { app, writtenFiles, removedFiles } = createMockApp([
        "Hoarder/attachments/archive-1-Article-Full-Page-Archive.jpg",
      ]);
      const client = createMockClient("multipart/related");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          fullPageArchiveAssetId: "archive-1",
        },
      });
      const settings = createSettings({ downloadFullPageArchives: true });

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(1);
      expect(writtenFiles[0].path).toMatch(/\.mhtml$/);
      expect(removedFiles).toContain("Hoarder/attachments/archive-1-Article-Full-Page-Archive.jpg");
    });

    it("should NOT re-download an image that already has a correct image extension", async () => {
      const { app, writtenFiles } = createMockApp([
        "Hoarder/attachments/img-asset-1-Test-Article-Banner-Image.png",
      ]);
      const client = createMockClient("image/png");
      const bookmark = createBookmark();
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "Test Article", client, settings);

      // Should not have downloaded or written anything
      expect(writtenFiles.length).toBe(0);
      expect(client.downloadAsset).not.toHaveBeenCalled();
    });

    it("should NOT re-download a PDF that already has .pdf extension", async () => {
      const { app, writtenFiles } = createMockApp([
        "Hoarder/attachments/pdf-asset-1-My-Document.pdf",
      ]);
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "My Document", client, settings);

      expect(writtenFiles.length).toBe(0);
      expect(client.downloadAsset).not.toHaveBeenCalled();
    });
  });

  describe("embed syntax", () => {
    it("should use ![[]] syntax for PDFs", async () => {
      const { app } = createMockApp();
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings();

      const result = await processBookmarkAssets(app, bookmark, "Doc", client, settings);

      expect(result.content).toMatch(/!\[\[.*\.pdf\]\]/);
    });

    it("should use []() link syntax for HTML archives", async () => {
      const { app } = createMockApp();
      const client = createMockClient("text/html");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          fullPageArchiveAssetId: "archive-1",
        },
      });
      const settings = createSettings({ downloadFullPageArchives: true });

      const result = await processBookmarkAssets(app, bookmark, "Article", client, settings);

      // Should be a link, not an image embed
      expect(result.content).toMatch(/\[Article - Full Page Archive\]/);
      expect(result.content).not.toMatch(/!\[/);
    });

    it("should use ![]() syntax for images", async () => {
      const { app } = createMockApp();
      const client = createMockClient("image/jpeg");
      const bookmark = createBookmark();
      const settings = createSettings();

      const result = await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(result.content).toMatch(/!\[Article - Banner Image\]/);
    });
  });

  describe("per-type download toggles", () => {
    it("should skip banner images when downloadBannerImages is false", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("image/jpeg");
      const bookmark = createBookmark();
      const settings = createSettings({ downloadBannerImages: false });

      const result = await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(0);
      // Should fall back to remote URL embed
      expect(result.content).toContain("karakeep.example.com/assets/img-asset-1");
    });

    it("should skip screenshots when downloadScreenshots is false", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("image/png");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          screenshotAssetId: "screenshot-1",
        },
      });
      const settings = createSettings({ downloadScreenshots: false });

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(0);
    });

    it("should skip PDF archives when downloadPdfArchives is false", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings({ downloadPdfArchives: false });

      const result = await processBookmarkAssets(app, bookmark, "Doc", client, settings);

      expect(writtenFiles.length).toBe(0);
      // Should link to remote URL instead
      expect(result.content).toContain("karakeep.example.com/assets/pdf-asset-1");
    });

    it("should skip full page archives when downloadFullPageArchives is false", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("multipart/related");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          fullPageArchiveAssetId: "archive-1",
        },
      });
      const settings = createSettings({ downloadFullPageArchives: false });

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(0);
    });

    it("should skip all downloads when downloadAssets is false", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("image/jpeg");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          imageAssetId: "img-1",
          screenshotAssetId: "ss-1",
          fullPageArchiveAssetId: "arch-1",
        },
      });
      const settings = createSettings({ downloadAssets: false });

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(0);
    });
  });

  describe("frontmatter", () => {
    it("should include pdf_archive in frontmatter for PDF assets", async () => {
      const { app } = createMockApp();
      const client = createMockClient("application/pdf");
      const bookmark = createBookmark({
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "pdf-asset-1",
        },
      });
      const settings = createSettings();

      const result = await processBookmarkAssets(app, bookmark, "Doc", client, settings);

      expect(result.frontmatter?.pdf_archive).toMatch(/^\"\[\[.*\.pdf\]\]\"$/);
    });

    it("should include banner in frontmatter for image assets", async () => {
      const { app } = createMockApp();
      const client = createMockClient("image/jpeg");
      const bookmark = createBookmark();
      const settings = createSettings();

      const result = await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(result.frontmatter?.banner).toMatch(/^\"\[\[.*\.jpg\]\]\"$/);
    });

    it("should include full_page_archive in frontmatter", async () => {
      const { app } = createMockApp();
      const client = createMockClient("multipart/related");
      const bookmark = createBookmark({
        content: {
          type: "link",
          url: "https://example.com",
          fullPageArchiveAssetId: "archive-1",
        },
      });
      const settings = createSettings({ downloadFullPageArchives: true });

      const result = await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(result.frontmatter?.full_page_archive).toMatch(/^\"\[\[.*\.mhtml\]\]\"$/);
    });
  });

  describe("linkHtmlContent skipping", () => {
    it("should skip assets with assetType linkHtmlContent", async () => {
      const { app, writtenFiles } = createMockApp();
      const client = createMockClient("text/html");
      const bookmark = createBookmark({
        content: { type: "link", url: "https://example.com" },
        assets: [{ id: "html-1", assetType: "linkHtmlContent" }],
      });
      const settings = createSettings();

      await processBookmarkAssets(app, bookmark, "Article", client, settings);

      expect(writtenFiles.length).toBe(0);
    });
  });
});
