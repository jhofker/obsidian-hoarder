import { shouldIncludeBookmark } from "./filter-utils";

describe("shouldIncludeBookmark", () => {
  describe("no filters", () => {
    it("should include bookmark when no filters specified", () => {
      const result = shouldIncludeBookmark(["tag1", "tag2"], [], [], false);
      expect(result.include).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should include favorited bookmark with no filters", () => {
      const result = shouldIncludeBookmark(["tag1"], [], [], true);
      expect(result.include).toBe(true);
    });

    it("should include bookmark with no tags and no filters", () => {
      const result = shouldIncludeBookmark([], [], [], false);
      expect(result.include).toBe(true);
    });
  });

  describe("included tags filter", () => {
    it("should include bookmark with matching included tag", () => {
      const result = shouldIncludeBookmark(["work", "important"], ["work"], [], false);
      expect(result.include).toBe(true);
    });

    it("should include bookmark with one of multiple included tags", () => {
      const result = shouldIncludeBookmark(
        ["project", "web"],
        ["mobile", "web", "desktop"],
        [],
        false
      );
      expect(result.include).toBe(true);
    });

    it("should exclude bookmark without any included tags", () => {
      const result = shouldIncludeBookmark(["personal"], ["work"], [], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });

    it("should exclude bookmark with no tags when included tags specified", () => {
      const result = shouldIncludeBookmark([], ["work"], [], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });

    it("should handle multiple included tags", () => {
      const result = shouldIncludeBookmark(["dev", "javascript"], ["dev", "python"], [], false);
      expect(result.include).toBe(true);
    });

    it("should be case-sensitive (expects already lowercased)", () => {
      const result = shouldIncludeBookmark(["work"], ["WORK"], [], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });
  });

  describe("excluded tags filter", () => {
    it("should exclude bookmark with excluded tag", () => {
      const result = shouldIncludeBookmark(["spam", "newsletter"], [], ["spam"], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("excluded_tag");
    });

    it("should include bookmark without excluded tags", () => {
      const result = shouldIncludeBookmark(["work", "project"], [], ["spam"], false);
      expect(result.include).toBe(true);
    });

    it("should exclude if any excluded tag matches", () => {
      const result = shouldIncludeBookmark(
        ["work", "spam"],
        [],
        ["spam", "junk", "ads"],
        false
      );
      expect(result.include).toBe(false);
      expect(result.reason).toBe("excluded_tag");
    });

    it("should handle multiple excluded tags", () => {
      const result = shouldIncludeBookmark(["newsletter"], [], ["spam", "ads"], false);
      expect(result.include).toBe(true);
    });

    it("should be case-sensitive for excluded tags", () => {
      const result = shouldIncludeBookmark(["spam"], [], ["SPAM"], false);
      expect(result.include).toBe(true);
    });
  });

  describe("favorited bookmark behavior", () => {
    it("should bypass excluded tags for favorited bookmarks", () => {
      const result = shouldIncludeBookmark(["spam"], [], ["spam"], true);
      expect(result.include).toBe(true);
    });

    it("should still check included tags for favorited bookmarks", () => {
      const result = shouldIncludeBookmark(["spam"], ["work"], ["spam"], true);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });

    it("should include favorited with excluded tag but matching included tag", () => {
      const result = shouldIncludeBookmark(["work", "spam"], ["work"], ["spam"], true);
      expect(result.include).toBe(true);
    });

    it("should bypass multiple excluded tags when favorited", () => {
      const result = shouldIncludeBookmark(
        ["spam", "ads", "junk"],
        [],
        ["spam", "ads", "junk"],
        true
      );
      expect(result.include).toBe(true);
    });
  });

  describe("combined filters", () => {
    it("should require included tag and no excluded tags", () => {
      const result = shouldIncludeBookmark(["work"], ["work"], ["spam"], false);
      expect(result.include).toBe(true);
    });

    it("should exclude if has included but also excluded tag", () => {
      const result = shouldIncludeBookmark(["work", "spam"], ["work"], ["spam"], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("excluded_tag");
    });

    it("should exclude if missing included tag even without excluded", () => {
      const result = shouldIncludeBookmark(["personal"], ["work"], ["spam"], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });

    it("should prioritize included tag check over excluded", () => {
      // First checks included, so returns missing_included_tag not excluded_tag
      const result = shouldIncludeBookmark(["spam"], ["work"], ["spam"], false);
      expect(result.include).toBe(false);
      expect(result.reason).toBe("missing_included_tag");
    });
  });

  describe("edge cases", () => {
    it("should handle empty bookmark tags", () => {
      const result = shouldIncludeBookmark([], [], [], false);
      expect(result.include).toBe(true);
    });

    it("should handle bookmark with many tags", () => {
      const tags = ["a", "b", "c", "d", "e", "f", "g"];
      const result = shouldIncludeBookmark(tags, ["a"], [], false);
      expect(result.include).toBe(true);
    });

    it("should handle many included tags", () => {
      const included = ["tag1", "tag2", "tag3", "tag4", "tag5"];
      const result = shouldIncludeBookmark(["tag3"], included, [], false);
      expect(result.include).toBe(true);
    });

    it("should handle many excluded tags", () => {
      const excluded = ["spam1", "spam2", "spam3", "spam4"];
      const result = shouldIncludeBookmark(["spam2"], [], excluded, false);
      expect(result.include).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("should filter work-related bookmarks", () => {
      const result = shouldIncludeBookmark(["work", "meeting", "urgent"], ["work"], [], false);
      expect(result.include).toBe(true);
    });

    it("should exclude newsletters", () => {
      const result = shouldIncludeBookmark(
        ["tech", "newsletter"],
        [],
        ["newsletter", "spam"],
        false
      );
      expect(result.include).toBe(false);
      expect(result.reason).toBe("excluded_tag");
    });

    it("should keep favorited newsletter", () => {
      const result = shouldIncludeBookmark(
        ["tech", "newsletter"],
        [],
        ["newsletter", "spam"],
        true
      );
      expect(result.include).toBe(true);
    });

    it("should filter by project tag", () => {
      const result = shouldIncludeBookmark(
        ["project-x", "web", "frontend"],
        ["project-x"],
        ["archived"],
        false
      );
      expect(result.include).toBe(true);
    });

    it("should exclude archived unless favorited", () => {
      const notFavorited = shouldIncludeBookmark(
        ["project", "archived"],
        [],
        ["archived"],
        false
      );
      expect(notFavorited.include).toBe(false);

      const favorited = shouldIncludeBookmark(["project", "archived"], [], ["archived"], true);
      expect(favorited.include).toBe(true);
    });

    it("should handle reading list filtering", () => {
      const result = shouldIncludeBookmark(
        ["to-read", "article", "javascript"],
        ["to-read"],
        ["read"],
        false
      );
      expect(result.include).toBe(true);
    });

    it("should exclude already read articles", () => {
      const result = shouldIncludeBookmark(
        ["article", "read", "javascript"],
        ["article"],
        ["read"],
        false
      );
      expect(result.include).toBe(false);
      expect(result.reason).toBe("excluded_tag");
    });
  });
});
