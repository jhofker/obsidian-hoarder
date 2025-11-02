import { getBookmarkTitle } from "./bookmark-utils";
import { HoarderBookmark } from "./hoarder-client";

describe("getBookmarkTitle", () => {
  const baseBookmark = {
    id: "test-id-123",
    createdAt: "2024-01-15T10:30:00.000Z",
    tags: [],
  } as HoarderBookmark;

  describe("main title priority", () => {
    it("should use bookmark.title if present", () => {
      const bookmark = {
        ...baseBookmark,
        title: "Main Title",
        content: { type: "link" as const, url: "https://example.com", title: "Content Title" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Main Title");
    });

    it("should prefer bookmark.title over content.title", () => {
      const bookmark = {
        ...baseBookmark,
        title: "Bookmark Title",
        content: { type: "link" as const, url: "https://example.com", title: "Content Title" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Bookmark Title");
    });
  });

  describe("link bookmarks", () => {
    it("should use content.title for links", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com", title: "Article Title" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Article Title");
    });

    it("should extract title from URL pathname", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/my-article" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my article");
    });

    it("should remove file extensions from URL paths", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/article.html" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("article");
    });

    it("should replace dashes with spaces in URL paths", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/my-great-article" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my great article");
    });

    it("should replace underscores with spaces in URL paths", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/my_great_article" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my great article");
    });

    it("should use hostname when path is empty", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("example.com");
    });

    it("should remove www. prefix from hostname", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://www.example.com/" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("example.com");
    });

    it("should handle URLs with query parameters", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/article?id=123" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("article");
    });

    it("should handle URLs with fragments", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "https://example.com/article#section" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("article");
    });

    it("should return URL as-is if parsing fails", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const, url: "not-a-valid-url" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("not-a-valid-url");
    });
  });

  describe("text bookmarks", () => {
    it("should use first line for short text", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "text" as const, text: "This is a short note" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("This is a short note");
    });

    it("should use first line for multi-line text", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "text" as const,
          text: "First line\nSecond line\nThird line",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("First line");
    });

    it("should truncate long first lines to 100 chars", () => {
      const longText = "a".repeat(150);
      const bookmark = {
        ...baseBookmark,
        content: { type: "text" as const, text: longText },
      } as HoarderBookmark;
      const result = getBookmarkTitle(bookmark);
      expect(result).toBe("a".repeat(97) + "...");
      expect(result.length).toBe(100);
    });

    it("should not truncate text at exactly 100 chars", () => {
      const text = "a".repeat(100);
      const bookmark = {
        ...baseBookmark,
        content: { type: "text" as const, text },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe(text);
    });

    it("should handle text with 99 chars", () => {
      const text = "a".repeat(99);
      const bookmark = {
        ...baseBookmark,
        content: { type: "text" as const, text },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe(text);
    });

    it("should handle empty text", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "text" as const, text: "" },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Bookmark-test-id-123-2024-01-15");
    });
  });

  describe("asset bookmarks", () => {
    it("should use fileName without extension", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "asset" as const,
          assetType: "image" as const,
          assetId: "asset-123",
          fileName: "my-image.png",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my-image");
    });

    it("should handle filenames with multiple dots", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "asset" as const,
          assetType: "image" as const,
          assetId: "asset-123",
          fileName: "my.file.name.jpg",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my.file.name");
    });

    it("should extract title from sourceUrl if no fileName", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "asset" as const,
          assetType: "image" as const,
          assetId: "asset-123",
          sourceUrl: "https://example.com/image.jpg",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("image");
    });

    it("should prefer fileName over sourceUrl", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "asset" as const,
          assetType: "image" as const,
          assetId: "asset-123",
          fileName: "my-image.png",
          sourceUrl: "https://example.com/other-image.jpg",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my-image");
    });
  });

  describe("fallback behavior", () => {
    it("should use fallback format when no title sources available", () => {
      const bookmark = {
        ...baseBookmark,
        content: { type: "link" as const },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Bookmark-test-id-123-2024-01-15");
    });

    it("should format fallback date correctly", () => {
      const bookmark = {
        ...baseBookmark,
        id: "abc-123",
        createdAt: "2024-12-31T23:59:59.999Z",
        content: { type: "link" as const },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Bookmark-abc-123-2024-12-31");
    });
  });

  describe("real-world examples", () => {
    it("should handle GitHub URLs", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "link" as const,
          url: "https://github.com/user/repo",
          title: "user/repo: Description",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("user/repo: Description");
    });

    it("should handle blog post URLs", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "link" as const,
          url: "https://blog.example.com/2024/01/my-post",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("my post");
    });

    it("should handle Wikipedia URLs", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "link" as const,
          url: "https://en.wikipedia.org/wiki/Machine_learning",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("Machine learning");
    });

    it("should handle YouTube URLs", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "link" as const,
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      } as HoarderBookmark;
      // YouTube URLs have query params, so it extracts "watch" from the path
      expect(getBookmarkTitle(bookmark)).toBe("watch");
    });

    it("should handle documentation URLs", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "link" as const,
          url: "https://docs.example.com/guides/getting-started.html",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("getting started");
    });

    it("should handle quote notes", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "text" as const,
          text: '"The only way to do great work is to love what you do." - Steve Jobs',
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe(
        '"The only way to do great work is to love what you do." - Steve Jobs'
      );
    });

    it("should handle todo list text", () => {
      const bookmark = {
        ...baseBookmark,
        content: {
          type: "text" as const,
          text: "- [ ] Buy groceries\n- [ ] Walk the dog\n- [ ] Write report",
        },
      } as HoarderBookmark;
      expect(getBookmarkTitle(bookmark)).toBe("- [ ] Buy groceries");
    });
  });
});
