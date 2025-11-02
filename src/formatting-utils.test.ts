import { escapeMarkdownPath, escapeYaml } from "./formatting-utils";

describe("escapeYaml", () => {
  describe("null and empty handling", () => {
    it("should return empty string for null", () => {
      expect(escapeYaml(null)).toBe("");
    });

    it("should return empty string for undefined", () => {
      expect(escapeYaml(undefined)).toBe("");
    });

    it("should return empty string for empty string", () => {
      expect(escapeYaml("")).toBe("");
    });
  });

  describe("simple strings", () => {
    it("should return plain strings unchanged", () => {
      expect(escapeYaml("hello")).toBe("hello");
      expect(escapeYaml("simple text")).toBe("simple text");
      expect(escapeYaml("text-with-dashes")).toBe("text-with-dashes");
    });

    it("should handle numbers as strings", () => {
      expect(escapeYaml("123")).toBe("123");
      expect(escapeYaml("3.14")).toBe("3.14");
    });
  });

  describe("newline handling", () => {
    it("should use block scalar for strings with newlines", () => {
      const input = "line one\nline two";
      const expected = "|\n  line one\n  line two";
      expect(escapeYaml(input)).toBe(expected);
    });

    it("should indent all lines in block scalar", () => {
      const input = "first\nsecond\nthird";
      const expected = "|\n  first\n  second\n  third";
      expect(escapeYaml(input)).toBe(expected);
    });

    it("should handle multiple consecutive newlines", () => {
      const input = "line\n\n\nline";
      const expected = "|\n  line\n  \n  \n  line";
      expect(escapeYaml(input)).toBe(expected);
    });
  });

  describe("special YAML characters", () => {
    it("should use block scalar for colons", () => {
      expect(escapeYaml("key: value")).toMatch(/^\|/);
    });

    it("should use block scalar for hash/pound signs", () => {
      expect(escapeYaml("text # comment")).toMatch(/^\|/);
    });

    it("should use block scalar for curly braces", () => {
      expect(escapeYaml("text {data}")).toMatch(/^\|/);
    });

    it("should use block scalar for square brackets", () => {
      expect(escapeYaml("text [data]")).toMatch(/^\|/);
    });

    it("should use block scalar for commas", () => {
      expect(escapeYaml("one, two, three")).toMatch(/^\|/);
    });

    it("should use block scalar for ampersands", () => {
      expect(escapeYaml("text & more")).toMatch(/^\|/);
    });

    it("should use block scalar for asterisks", () => {
      expect(escapeYaml("*important*")).toMatch(/^\|/);
    });

    it("should use block scalar for question marks", () => {
      expect(escapeYaml("is this? yes")).toMatch(/^\|/);
    });

    it("should use block scalar for pipes", () => {
      expect(escapeYaml("text | more")).toMatch(/^\|/);
    });

    it("should use block scalar for angle brackets", () => {
      expect(escapeYaml("<html>")).toMatch(/^\|/);
      expect(escapeYaml("text > more")).toMatch(/^\|/);
    });

    it("should use block scalar for equals signs", () => {
      expect(escapeYaml("x = y")).toMatch(/^\|/);
    });

    it("should use block scalar for exclamation marks", () => {
      expect(escapeYaml("text!")).toMatch(/^\|/);
    });

    it("should use block scalar for percent signs", () => {
      expect(escapeYaml("100%")).toMatch(/^\|/);
    });

    it("should use block scalar for at signs", () => {
      expect(escapeYaml("user@example.com")).toMatch(/^\|/);
    });

    it("should use block scalar for backticks", () => {
      expect(escapeYaml("`code`")).toMatch(/^\|/);
    });
  });

  describe("quote handling", () => {
    it("should wrap in single quotes if string contains double quotes", () => {
      expect(escapeYaml('text "quoted" text')).toBe("'text \"quoted\" text'");
    });

    it("should wrap in double quotes and escape if string contains single quotes", () => {
      expect(escapeYaml("text's here")).toBe('"text\'s here"');
    });

    it("should handle leading/trailing spaces with quotes", () => {
      expect(escapeYaml("  text  ")).toBe('"  text  "');
    });

    it("should handle leading tabs with quotes", () => {
      expect(escapeYaml("\ttext")).toBe('"\ttext"');
    });

    it("should handle trailing tabs with quotes", () => {
      expect(escapeYaml("text\t")).toBe('"text\t"');
    });
  });

  describe("complex cases", () => {
    it("should handle URLs", () => {
      expect(escapeYaml("https://example.com/path?query=value")).toMatch(/^\|/);
    });

    it("should handle email addresses", () => {
      expect(escapeYaml("user@example.com")).toMatch(/^\|/);
    });

    it("should handle markdown formatting", () => {
      expect(escapeYaml("**bold** and *italic*")).toMatch(/^\|/);
    });

    it("should handle JSON-like strings", () => {
      expect(escapeYaml('{"key": "value"}')).toMatch(/^\|/);
    });

    it("should handle code snippets", () => {
      const code = "function test() {\n  return true;\n}";
      const result = escapeYaml(code);
      expect(result).toMatch(/^\|/);
      expect(result).toContain("function test()");
    });
  });

  describe("real-world examples", () => {
    it("should handle article titles", () => {
      expect(escapeYaml("How to Build a REST API")).toBe("How to Build a REST API");
    });

    it("should handle titles with colons", () => {
      expect(escapeYaml("React: A JavaScript Library")).toMatch(/^\|/);
    });

    it("should handle quoted speech", () => {
      // Contains '!' which is a YAML special character, so uses block scalar
      const result = escapeYaml('"Hello, World!" he said');
      expect(result).toMatch(/^\|/);
      expect(result).toContain('"Hello, World!" he said');
    });

    it("should handle book titles with apostrophes", () => {
      expect(escapeYaml("The Programmer's Guide")).toBe('"The Programmer\'s Guide"');
    });

    it("should handle descriptions with special chars", () => {
      const desc = "Learn React, Vue & Angular in 2024!";
      expect(escapeYaml(desc)).toMatch(/^\|/);
    });
  });
});

describe("escapeMarkdownPath", () => {
  describe("simple paths", () => {
    it("should return simple paths unchanged", () => {
      expect(escapeMarkdownPath("https://example.com")).toBe("https://example.com");
      expect(escapeMarkdownPath("/path/to/file")).toBe("/path/to/file");
    });

    it("should handle paths with dashes and underscores", () => {
      expect(escapeMarkdownPath("https://example.com/my-page_name")).toBe(
        "https://example.com/my-page_name"
      );
    });

    it("should handle query parameters without spaces", () => {
      expect(escapeMarkdownPath("https://example.com?query=value")).toBe(
        "https://example.com?query=value"
      );
    });
  });

  describe("paths with spaces", () => {
    it("should wrap paths with spaces in angle brackets", () => {
      expect(escapeMarkdownPath("path with spaces")).toBe("<path with spaces>");
    });

    it("should wrap URLs with spaces in angle brackets", () => {
      expect(escapeMarkdownPath("https://example.com/my page")).toBe(
        "<https://example.com/my page>"
      );
    });

    it("should wrap file paths with spaces", () => {
      expect(escapeMarkdownPath("/path/to/my file.pdf")).toBe("</path/to/my file.pdf>");
    });
  });

  describe("paths with special characters", () => {
    it("should wrap paths with angle brackets", () => {
      expect(escapeMarkdownPath("<path>")).toBe("<<path>>");
    });

    it("should wrap paths with square brackets", () => {
      expect(escapeMarkdownPath("path[test]")).toBe("<path[test]>");
    });

    it("should wrap paths with parentheses", () => {
      expect(escapeMarkdownPath("path(test)")).toBe("<path(test)>");
    });

    it("should wrap paths with curly braces", () => {
      expect(escapeMarkdownPath("path{test}")).toBe("<path{test}>");
    });
  });

  describe("real-world examples", () => {
    it("should handle normal URLs", () => {
      expect(escapeMarkdownPath("https://github.com/user/repo")).toBe(
        "https://github.com/user/repo"
      );
    });

    it("should handle URLs with query parameters", () => {
      expect(escapeMarkdownPath("https://example.com?id=123&name=test")).toBe(
        "https://example.com?id=123&name=test"
      );
    });

    it("should handle local file paths", () => {
      expect(escapeMarkdownPath("./local/file.pdf")).toBe("./local/file.pdf");
    });

    it("should handle Windows paths with spaces", () => {
      expect(escapeMarkdownPath("C:\\Program Files\\App\\file.exe")).toBe(
        "<C:\\Program Files\\App\\file.exe>"
      );
    });

    it("should handle SharePoint URLs with spaces", () => {
      expect(escapeMarkdownPath("https://sharepoint.com/sites/My Site/Documents/File.docx")).toBe(
        "<https://sharepoint.com/sites/My Site/Documents/File.docx>"
      );
    });

    it("should handle Obsidian wikilinks", () => {
      expect(escapeMarkdownPath("[[My Note]]")).toBe("<[[My Note]]>");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(escapeMarkdownPath("")).toBe("");
    });

    it("should handle single character", () => {
      expect(escapeMarkdownPath("a")).toBe("a");
    });

    it("should handle only spaces", () => {
      expect(escapeMarkdownPath("   ")).toBe("<   >");
    });

    it("should handle unicode characters", () => {
      expect(escapeMarkdownPath("https://example.com/日本語")).toBe("https://example.com/日本語");
    });

    it("should handle unicode with spaces", () => {
      expect(escapeMarkdownPath("https://example.com/日本語 page")).toBe(
        "<https://example.com/日本語 page>"
      );
    });
  });
});
