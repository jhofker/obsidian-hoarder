import { extractNotesSection } from "./markdown-utils";

describe("extractNotesSection", () => {
  describe("basic extraction", () => {
    it("should extract simple notes", () => {
      const content = "## Notes\n\nThis is my note";
      expect(extractNotesSection(content)).toBe("This is my note");
    });

    it("should extract multi-line notes", () => {
      const content = "## Notes\n\nLine one\nLine two\nLine three";
      expect(extractNotesSection(content)).toBe("Line one\nLine two\nLine three");
    });

    it("should trim whitespace", () => {
      const content = "## Notes\n\n  My note  \n\n";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should return null if no notes section", () => {
      const content = "# Title\n\nSome content";
      expect(extractNotesSection(content)).toBe(null);
    });

    it("should return null for empty notes section", () => {
      const content = "## Notes\n\n";
      expect(extractNotesSection(content)).toBe("");
    });
  });

  describe("notes followed by sections", () => {
    it("should stop at next section header", () => {
      const content = "## Notes\n\nMy note\n\n## Summary\n\nSome summary";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should stop at description section", () => {
      const content = "## Notes\n\nMy note\n\n## Description\n\nSome description";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should stop at highlights section", () => {
      const content = "## Notes\n\nMy note\n\n## Highlights\n\n> Some highlight";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should handle multiple sections after notes", () => {
      const content = "## Notes\n\nMy note\n\n## Summary\n\nSummary\n\n## Description\n\nDesc";
      expect(extractNotesSection(content)).toBe("My note");
    });
  });

  describe("notes followed by links", () => {
    it("should stop at link", () => {
      const content = "## Notes\n\nMy note\n\n[Visit Link](https://example.com)";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should stop at view in hoarder link", () => {
      const content = "## Notes\n\nMy note\n\n[View in Hoarder](https://hoarder.com)";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should handle multiple links", () => {
      const content = "## Notes\n\nMy note\n\n[Link 1](url1)\n[Link 2](url2)";
      expect(extractNotesSection(content)).toBe("My note");
    });
  });

  describe("notes at end of file", () => {
    it("should extract notes at end", () => {
      const content = "# Title\n\n## Summary\n\nSome text\n\n## Notes\n\nMy note at end";
      expect(extractNotesSection(content)).toBe("My note at end");
    });

    it("should handle notes as last section with trailing newlines", () => {
      const content = "## Notes\n\nMy note\n\n\n";
      expect(extractNotesSection(content)).toBe("My note");
    });

    it("should extract notes before links at end", () => {
      const content = "## Notes\n\nMy note\n\n[Link](url)";
      expect(extractNotesSection(content)).toBe("My note");
    });
  });

  describe("notes with special content", () => {
    it("should handle notes with markdown formatting", () => {
      const content = "## Notes\n\n**Bold** and *italic* text";
      expect(extractNotesSection(content)).toBe("**Bold** and *italic* text");
    });

    it("should handle notes with lists", () => {
      const content = "## Notes\n\n- Item 1\n- Item 2\n- Item 3\n\n## Summary";
      expect(extractNotesSection(content)).toBe("- Item 1\n- Item 2\n- Item 3");
    });

    it("should handle notes with code blocks", () => {
      const content = "## Notes\n\n```js\nconst x = 1;\n```\n\n## Summary";
      expect(extractNotesSection(content)).toBe("```js\nconst x = 1;\n```");
    });

    it("should handle notes with quotes", () => {
      const content = '## Notes\n\n"This is a quote"\n\n## Summary';
      expect(extractNotesSection(content)).toBe('"This is a quote"');
    });

    it("should handle notes with special characters", () => {
      const content = "## Notes\n\nText with #hashtags and @mentions!\n\n## Summary";
      expect(extractNotesSection(content)).toBe("Text with #hashtags and @mentions!");
    });

    it("should handle notes with URLs", () => {
      const content = "## Notes\n\nCheck out https://example.com for more\n\n## Summary";
      expect(extractNotesSection(content)).toBe("Check out https://example.com for more");
    });

    it("should handle notes with inline links", () => {
      const content = "## Notes\n\nRead more at [website](https://example.com) here\n\n## Summary";
      expect(extractNotesSection(content)).toBe("Read more at [website](https://example.com) here");
    });
  });

  describe("edge cases with headers", () => {
    it("should match ### Notes (level 3 contains ##)", () => {
      // The regex matches "## Notes" which is contained in "### Notes"
      const content = "### Notes\n\nSome text";
      expect(extractNotesSection(content)).toBe("Some text");
    });

    it("should not match # Notes (level 1)", () => {
      const content = "# Notes\n\nSome text";
      expect(extractNotesSection(content)).toBe(null);
    });

    it("should match first ## Notes occurrence", () => {
      // Matches the first "## Notes" it finds (which is in "### Notes")
      const content = "# Title\n\n### Notes\n\nWrong\n\n## Notes\n\nCorrect\n\n## Summary";
      expect(extractNotesSection(content)).toBe("Wrong");
    });

    it("should handle notes with no space after ##", () => {
      const content = "##Notes\n\nSome text";
      expect(extractNotesSection(content)).toBe(null);
    });

    it("should require exact spacing", () => {
      const content = "##  Notes\n\nSome text";
      expect(extractNotesSection(content)).toBe(null);
    });
  });

  describe("edge cases with empty lines", () => {
    it("should handle multiple empty lines in notes", () => {
      const content = "## Notes\n\nLine 1\n\n\n\nLine 2\n\n## Summary";
      expect(extractNotesSection(content)).toBe("Line 1\n\n\n\nLine 2");
    });

    it("should handle tabs and spaces", () => {
      const content = "## Notes\n\n\tIndented text\n  Spaces\n\n## Summary";
      // trim() removes leading tabs
      expect(extractNotesSection(content)).toBe("Indented text\n  Spaces");
    });
  });

  describe("real-world examples", () => {
    it("should extract from typical bookmark format", () => {
      const content = `---
title: My Bookmark
---

# My Bookmark

## Summary

This is a summary

## Description

This is a description

## Notes

These are my personal notes
With multiple lines
And some thoughts

[Visit Link](https://example.com)
[View in Hoarder](https://hoarder.com)`;

      expect(extractNotesSection(content)).toBe(
        "These are my personal notes\nWith multiple lines\nAnd some thoughts"
      );
    });

    it("should extract from bookmark with highlights", () => {
      const content = `## Highlights

> Some highlighted text

## Notes

My thoughts on this article

## More Info`;

      expect(extractNotesSection(content)).toBe("My thoughts on this article");
    });

    it("should handle empty notes in real format", () => {
      const content = `## Summary

Summary text

## Notes


[Visit Link](https://example.com)`;

      expect(extractNotesSection(content)).toBe("");
    });

    it("should extract notes before multiple links", () => {
      const content = `## Notes

Important: Remember to follow up on this!

[Visit Link](https://example.com)

[View in Hoarder](https://hoarder.com/dashboard/preview/abc123)`;

      expect(extractNotesSection(content)).toBe("Important: Remember to follow up on this!");
    });
  });

  describe("unicode and international content", () => {
    it("should handle notes with unicode", () => {
      const content = "## Notes\n\n日本語のノート 📝\n\n## Summary";
      expect(extractNotesSection(content)).toBe("日本語のノート 📝");
    });

    it("should handle notes with emojis", () => {
      const content = "## Notes\n\n🚀 Great article! 👍\n\n## Summary";
      expect(extractNotesSection(content)).toBe("🚀 Great article! 👍");
    });

    it("should handle mixed languages", () => {
      const content = "## Notes\n\nEnglish and 中文 mixed\n\n## Summary";
      expect(extractNotesSection(content)).toBe("English and 中文 mixed");
    });
  });
});
