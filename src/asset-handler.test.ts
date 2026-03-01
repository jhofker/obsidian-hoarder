import { sanitizeAssetFileName } from "./asset-handler";

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
  });
});
