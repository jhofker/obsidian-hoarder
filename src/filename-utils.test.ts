import { sanitizeFileName } from "./filename-utils";

describe("sanitizeFileName", () => {
  const testDate = "2024-01-15T10:30:00.000Z";

  describe("basic functionality", () => {
    it("should create filename with date prefix", () => {
      expect(sanitizeFileName("My Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should handle Date objects", () => {
      const date = new Date(testDate);
      expect(sanitizeFileName("Test", date)).toBe("2024-01-15-Test");
    });

    it("should format date correctly", () => {
      expect(sanitizeFileName("Title", "2024-12-31T23:59:59.999Z")).toBe("2024-12-31-Title");
      expect(sanitizeFileName("Title", "2024-01-01T00:00:00.000Z")).toBe("2024-01-01-Title");
    });
  });

  describe("invalid character handling", () => {
    it("should replace backslashes with dashes", () => {
      expect(sanitizeFileName("My\\Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace forward slashes with dashes", () => {
      expect(sanitizeFileName("My/Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace colons with dashes", () => {
      expect(sanitizeFileName("My:Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace asterisks with dashes", () => {
      expect(sanitizeFileName("My*Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace question marks with dashes", () => {
      expect(sanitizeFileName("My?Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace quotes with dashes", () => {
      expect(sanitizeFileName('My"Title', testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace angle brackets with dashes", () => {
      expect(sanitizeFileName("My<Title>", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should replace pipes with dashes", () => {
      expect(sanitizeFileName("My|Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should handle multiple invalid characters", () => {
      expect(sanitizeFileName('My\\/:*?"<>|Title', testDate)).toBe("2024-01-15-My-Title");
    });
  });

  describe("space and dash handling", () => {
    it("should replace spaces with dashes", () => {
      expect(sanitizeFileName("My Title Here", testDate)).toBe("2024-01-15-My-Title-Here");
    });

    it("should replace multiple spaces with single dash", () => {
      expect(sanitizeFileName("My    Title    Here", testDate)).toBe("2024-01-15-My-Title-Here");
    });

    it("should collapse multiple dashes into one", () => {
      expect(sanitizeFileName("My---Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should remove leading dashes", () => {
      expect(sanitizeFileName("---Title", testDate)).toBe("2024-01-15-Title");
    });

    it("should remove trailing dashes", () => {
      expect(sanitizeFileName("Title---", testDate)).toBe("2024-01-15-Title");
    });

    it("should handle combination of spaces and invalid chars", () => {
      expect(sanitizeFileName("My / Title", testDate)).toBe("2024-01-15-My-Title");
    });

    it("should handle tabs and newlines", () => {
      expect(sanitizeFileName("My\tTitle\nHere", testDate)).toBe("2024-01-15-My-Title-Here");
    });
  });

  describe("length limiting", () => {
    it("should truncate titles longer than 36 characters", () => {
      const longTitle = "This is a very long title that exceeds the maximum allowed length";
      const result = sanitizeFileName(longTitle, testDate);
      expect(result).toMatch(/^2024-01-15-/);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should try to break at word boundaries", () => {
      // 40 chars: "This-is-a-long-title-with-many-words-here"
      const longTitle = "This is a long title with many words here";
      const result = sanitizeFileName(longTitle, testDate);
      expect(result).toMatch(/^2024-01-15-/);
      expect(result.length).toBeLessThanOrEqual(50);
      // Result should be: "2024-01-15-This-is-a-long-title-with-many"
      // which is a reasonable word boundary break
      expect(result).toBe("2024-01-15-This-is-a-long-title-with-many");
    });

    it("should truncate if no good word boundary exists", () => {
      // One very long word
      const longTitle = "Supercalifragilisticexpialidocious-and-more";
      const result = sanitizeFileName(longTitle, testDate);
      expect(result).toMatch(/^2024-01-15-/);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should handle exactly 36 character titles", () => {
      const title = "a".repeat(36);
      const result = sanitizeFileName(title, testDate);
      expect(result).toBe(`2024-01-15-${"a".repeat(36)}`);
    });

    it("should handle titles just over 36 characters", () => {
      const title = "a".repeat(37);
      const result = sanitizeFileName(title, testDate);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(sanitizeFileName("", testDate)).toBe("2024-01-15-");
    });

    it("should handle only spaces", () => {
      expect(sanitizeFileName("   ", testDate)).toBe("2024-01-15-");
    });

    it("should handle only invalid characters", () => {
      expect(sanitizeFileName("///***???", testDate)).toBe("2024-01-15-");
    });

    it("should handle single character", () => {
      expect(sanitizeFileName("a", testDate)).toBe("2024-01-15-a");
    });

    it("should handle unicode characters", () => {
      expect(sanitizeFileName("My 日本語 Title", testDate)).toBe("2024-01-15-My-日本語-Title");
      expect(sanitizeFileName("Café ☕ Title", testDate)).toBe("2024-01-15-Café-☕-Title");
    });

    it("should handle mixed case", () => {
      expect(sanitizeFileName("MyTitle", testDate)).toBe("2024-01-15-MyTitle");
      expect(sanitizeFileName("MY-TITLE", testDate)).toBe("2024-01-15-MY-TITLE");
    });

    it("should handle numbers", () => {
      expect(sanitizeFileName("123 Test 456", testDate)).toBe("2024-01-15-123-Test-456");
    });
  });

  describe("real-world examples", () => {
    it("should handle blog post titles", () => {
      expect(sanitizeFileName("How to Build a REST API", testDate)).toBe(
        "2024-01-15-How-to-Build-a-REST-API"
      );
    });

    it("should handle URL-like titles", () => {
      expect(sanitizeFileName("https://example.com/article", testDate)).toBe(
        "2024-01-15-https-example.com-article"
      );
    });

    it("should handle titles with version numbers", () => {
      expect(sanitizeFileName("Node.js v20.0.0 Release", testDate)).toBe(
        "2024-01-15-Node.js-v20.0.0-Release"
      );
    });

    it("should handle titles with parentheses", () => {
      expect(sanitizeFileName("My Title (Draft)", testDate)).toBe("2024-01-15-My-Title-(Draft)");
    });

    it("should handle titles with brackets", () => {
      expect(sanitizeFileName("My [Important] Title", testDate)).toBe(
        "2024-01-15-My-[Important]-Title"
      );
    });

    it("should handle programming-related titles", () => {
      expect(sanitizeFileName("Understanding async/await in JavaScript", testDate)).toBe(
        "2024-01-15-Understanding-async-await-in"
      );
    });

    it("should handle article titles with punctuation", () => {
      expect(sanitizeFileName("What's New in 2024?", testDate)).toBe("2024-01-15-What's-New-in-2024");
    });

    it("should handle book titles", () => {
      expect(sanitizeFileName("The Art of War: Ancient Wisdom", testDate)).toBe(
        "2024-01-15-The-Art-of-War-Ancient-Wisdom"
      );
    });
  });

  describe("consistency", () => {
    it("should produce same result for same input", () => {
      const title = "My Test Title";
      const result1 = sanitizeFileName(title, testDate);
      const result2 = sanitizeFileName(title, testDate);
      expect(result1).toBe(result2);
    });

    it("should handle different dates with same title", () => {
      const title = "Same Title";
      const date1 = "2024-01-15T10:00:00.000Z";
      const date2 = "2024-12-31T23:59:59.999Z";
      expect(sanitizeFileName(title, date1)).toBe("2024-01-15-Same-Title");
      expect(sanitizeFileName(title, date2)).toBe("2024-12-31-Same-Title");
    });
  });
});
