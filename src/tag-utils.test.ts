import { sanitizeTag, sanitizeTags } from "./tag-utils";

describe("sanitizeTag", () => {
  describe("valid tags", () => {
    it("should return simple alphanumeric tags unchanged", () => {
      expect(sanitizeTag("meeting")).toBe("meeting");
      expect(sanitizeTag("project123")).toBe("project123");
      expect(sanitizeTag("y1984")).toBe("y1984");
    });

    it("should preserve underscores", () => {
      expect(sanitizeTag("snake_case")).toBe("snake_case");
      expect(sanitizeTag("my_tag_name")).toBe("my_tag_name");
    });

    it("should preserve hyphens", () => {
      expect(sanitizeTag("kebab-case")).toBe("kebab-case");
      expect(sanitizeTag("my-tag-name")).toBe("my-tag-name");
    });

    it("should preserve forward slashes for nested tags", () => {
      expect(sanitizeTag("inbox/to-read")).toBe("inbox/to-read");
      expect(sanitizeTag("project/web/frontend")).toBe("project/web/frontend");
    });

    it("should preserve mixed valid characters", () => {
      expect(sanitizeTag("tag_2024-01")).toBe("tag_2024-01");
      expect(sanitizeTag("project/v2_final-draft")).toBe("project/v2_final-draft");
    });
  });

  describe("space handling", () => {
    it("should convert spaces to hyphens", () => {
      expect(sanitizeTag("web dev")).toBe("web-dev");
      expect(sanitizeTag("my tag")).toBe("my-tag");
    });

    it("should convert multiple spaces to single hyphen", () => {
      expect(sanitizeTag("web   dev")).toBe("web-dev");
      expect(sanitizeTag("my    long    tag")).toBe("my-long-tag");
    });

    it("should handle tabs and other whitespace", () => {
      expect(sanitizeTag("web\tdev")).toBe("web-dev");
      expect(sanitizeTag("tag\nwith\nnewlines")).toBe("tag-with-newlines");
    });

    it("should trim leading and trailing spaces", () => {
      expect(sanitizeTag("  tag  ")).toBe("tag");
      expect(sanitizeTag("   web dev   ")).toBe("web-dev");
    });
  });

  describe("invalid character handling", () => {
    it("should remove special characters", () => {
      expect(sanitizeTag("tag!")).toBe("tag");
      expect(sanitizeTag("tag@email")).toBe("tagemail");
      expect(sanitizeTag("tag#hash")).toBe("taghash");
      expect(sanitizeTag("tag$money")).toBe("tagmoney");
    });

    it("should remove punctuation", () => {
      expect(sanitizeTag("tag.dot")).toBe("tagdot");
      expect(sanitizeTag("tag,comma")).toBe("tagcomma");
      expect(sanitizeTag("tag;semicolon")).toBe("tagsemicolon");
      expect(sanitizeTag("tag:colon")).toBe("tagcolon");
    });

    it("should remove brackets and parentheses", () => {
      expect(sanitizeTag("tag[bracket]")).toBe("tagbracket");
      expect(sanitizeTag("tag{brace}")).toBe("tagbrace");
      expect(sanitizeTag("tag(paren)")).toBe("tagparen");
    });

    it("should remove quotes", () => {
      expect(sanitizeTag('tag"quote')).toBe("tagquote");
      expect(sanitizeTag("tag'apostrophe")).toBe("tagapostrophe");
    });

    it("should handle mixed invalid characters", () => {
      expect(sanitizeTag("my!@#$%tag")).toBe("mytag");
      expect(sanitizeTag("tag<>with|special*chars")).toBe("tagwithspecialchars");
    });
  });

  describe("numeric tag handling", () => {
    it("should prepend 'tag-' to purely numeric tags", () => {
      expect(sanitizeTag("1984")).toBe("tag-1984");
      expect(sanitizeTag("123")).toBe("tag-123");
      expect(sanitizeTag("42")).toBe("tag-42");
    });

    it("should NOT modify tags with letters and numbers", () => {
      expect(sanitizeTag("y1984")).toBe("y1984");
      expect(sanitizeTag("tag123")).toBe("tag123");
      expect(sanitizeTag("123abc")).toBe("123abc");
    });

    it("should prepend 'tag-' to tags with only numbers and separators", () => {
      expect(sanitizeTag("2024-01")).toBe("tag-2024-01");
      expect(sanitizeTag("123_456")).toBe("tag-123_456");
      expect(sanitizeTag("2024/01/15")).toBe("tag-2024/01/15");
    });
  });

  describe("empty and null handling", () => {
    it("should return null for empty strings", () => {
      expect(sanitizeTag("")).toBe(null);
      expect(sanitizeTag("   ")).toBe(null);
      expect(sanitizeTag("\t\n")).toBe(null);
    });

    it("should return null if only invalid characters remain", () => {
      expect(sanitizeTag("!!!")).toBe(null);
      expect(sanitizeTag("@#$%")).toBe(null);
      expect(sanitizeTag("...")).toBe(null);
    });

    it("should return null if spaces leave nothing after conversion", () => {
      expect(sanitizeTag("   @@@   ")).toBe(null);
    });
  });

  describe("edge cases", () => {
    it("should handle very long tags", () => {
      const longTag = "a".repeat(1000);
      expect(sanitizeTag(longTag)).toBe(longTag);
    });

    it("should handle unicode characters by removing them", () => {
      expect(sanitizeTag("tag🚀emoji")).toBe("tagemoji");
      expect(sanitizeTag("café")).toBe("caf");
      expect(sanitizeTag("日本語")).toBe(null);
    });

    it("should handle mixed case", () => {
      expect(sanitizeTag("MyTag")).toBe("MyTag");
      expect(sanitizeTag("WEB-DEV")).toBe("WEB-DEV");
    });

    it("should handle nested tags with invalid characters", () => {
      expect(sanitizeTag("inbox / to-read")).toBe("inbox-/-to-read");
      expect(sanitizeTag("project/web dev")).toBe("project/web-dev");
    });
  });

  describe("real-world examples", () => {
    it("should handle common tag patterns", () => {
      expect(sanitizeTag("work")).toBe("work");
      expect(sanitizeTag("personal")).toBe("personal");
      expect(sanitizeTag("to-do")).toBe("to-do");
      expect(sanitizeTag("follow_up")).toBe("follow_up");
    });

    it("should handle tags from various sources", () => {
      expect(sanitizeTag("Web Development")).toBe("Web-Development");
      expect(sanitizeTag("JavaScript/React")).toBe("JavaScript/React");
      expect(sanitizeTag("2024 goals")).toBe("2024-goals");
      expect(sanitizeTag("Q1-2024")).toBe("Q1-2024");
      expect(sanitizeTag("men's fashion")).toBe("mens-fashion");
    });

    it("should handle problematic user inputs", () => {
      expect(sanitizeTag("tag!!!")).toBe("tag");
      expect(sanitizeTag("  my tag  ")).toBe("my-tag");
      expect(sanitizeTag("#hashtag")).toBe("hashtag");
      expect(sanitizeTag("@mention")).toBe("mention");
    });
  });
});

describe("sanitizeTags", () => {
  it("should sanitize array of valid tags", () => {
    expect(sanitizeTags(["tag1", "tag2", "tag3"])).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("should filter out null results", () => {
    expect(sanitizeTags(["valid", "", "also-valid", "!!!"])).toEqual(["valid", "also-valid"]);
  });

  it("should handle empty array", () => {
    expect(sanitizeTags([])).toEqual([]);
  });

  it("should handle array with all invalid tags", () => {
    expect(sanitizeTags(["!!!", "@@@", "   "])).toEqual([]);
  });

  it("should sanitize and filter mixed tags", () => {
    const input = ["Web Dev", "1984", "", "project/web", "!!!", "valid"];
    const expected = ["Web-Dev", "tag-1984", "project/web", "valid"];
    expect(sanitizeTags(input)).toEqual(expected);
  });

  it("should preserve order of valid tags", () => {
    const input = ["zebra", "apple", "monkey", "banana"];
    const expected = ["zebra", "apple", "monkey", "banana"];
    expect(sanitizeTags(input)).toEqual(expected);
  });
});
