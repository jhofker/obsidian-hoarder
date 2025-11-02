import { SyncStats, buildSyncMessage } from "./message-utils";

describe("buildSyncMessage", () => {
  const baseStats: SyncStats = {
    totalBookmarks: 0,
    skippedFiles: 0,
    updatedInHoarder: 0,
    excludedByTags: 0,
    includedByTags: 0,
    includedTagsEnabled: false,
    skippedNoHighlights: 0,
    deletionResults: {
      deleted: 0,
      archived: 0,
      tagged: 0,
      archivedHandled: 0,
    },
  };

  describe("basic sync results", () => {
    it("should handle zero bookmarks", () => {
      expect(buildSyncMessage(baseStats)).toBe("Successfully synced 0 bookmarks");
    });

    it("should handle one bookmark (singular)", () => {
      const stats = { ...baseStats, totalBookmarks: 1 };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 1 bookmark");
    });

    it("should handle multiple bookmarks (plural)", () => {
      const stats = { ...baseStats, totalBookmarks: 5 };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 5 bookmarks");
    });

    it("should handle large numbers", () => {
      const stats = { ...baseStats, totalBookmarks: 1234 };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 1234 bookmarks");
    });
  });

  describe("skipped files", () => {
    it("should include one skipped file (singular)", () => {
      const stats = { ...baseStats, totalBookmarks: 5, skippedFiles: 1 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks (skipped 1 existing file)"
      );
    });

    it("should include multiple skipped files (plural)", () => {
      const stats = { ...baseStats, totalBookmarks: 10, skippedFiles: 7 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 10 bookmarks (skipped 7 existing files)"
      );
    });

    it("should not show skipped files when zero", () => {
      const stats = { ...baseStats, totalBookmarks: 5, skippedFiles: 0 };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 5 bookmarks");
    });
  });

  describe("Hoarder updates", () => {
    it("should include one note update (singular)", () => {
      const stats = { ...baseStats, totalBookmarks: 3, updatedInHoarder: 1 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 3 bookmarks and updated 1 note in Karakeep"
      );
    });

    it("should include multiple note updates (plural)", () => {
      const stats = { ...baseStats, totalBookmarks: 5, updatedInHoarder: 3 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks and updated 3 notes in Karakeep"
      );
    });

    it("should combine skipped files and note updates", () => {
      const stats = { ...baseStats, totalBookmarks: 10, skippedFiles: 5, updatedInHoarder: 2 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 10 bookmarks (skipped 5 existing files) and updated 2 notes in Karakeep"
      );
    });
  });

  describe("tag filtering", () => {
    it("should show one excluded bookmark (singular)", () => {
      const stats = { ...baseStats, totalBookmarks: 4, excludedByTags: 1 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 4 bookmarks, excluded 1 bookmark by tags"
      );
    });

    it("should show multiple excluded bookmarks (plural)", () => {
      const stats = { ...baseStats, totalBookmarks: 10, excludedByTags: 5 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 10 bookmarks, excluded 5 bookmarks by tags"
      );
    });

    it("should show included bookmarks when filter enabled", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 3,
        includedByTags: 3,
        includedTagsEnabled: true,
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 3 bookmarks, included 3 bookmarks by tags"
      );
    });

    it("should show one included bookmark (singular)", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 1,
        includedByTags: 1,
        includedTagsEnabled: true,
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 1 bookmark, included 1 bookmark by tags"
      );
    });

    it("should not show included count when filter disabled", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        includedByTags: 5,
        includedTagsEnabled: false,
      };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 5 bookmarks");
    });

    it("should show both excluded and included", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        excludedByTags: 2,
        includedByTags: 5,
        includedTagsEnabled: true,
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, excluded 2 bookmarks by tags, included 5 bookmarks by tags"
      );
    });
  });

  describe("highlight filtering", () => {
    it("should show one skipped bookmark without highlights (singular)", () => {
      const stats = { ...baseStats, totalBookmarks: 2, skippedNoHighlights: 1 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 2 bookmarks, skipped 1 bookmark without highlights"
      );
    });

    it("should show multiple skipped bookmarks without highlights (plural)", () => {
      const stats = { ...baseStats, totalBookmarks: 5, skippedNoHighlights: 3 };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, skipped 3 bookmarks without highlights"
      );
    });
  });

  describe("deletion results", () => {
    it("should show deleted bookmarks", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 2, archived: 0, tagged: 0, archivedHandled: 0 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, processed 2 deleted bookmarks (2 deleted)"
      );
    });

    it("should show archived bookmarks", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 0, archived: 3, tagged: 0, archivedHandled: 0 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, processed 3 deleted bookmarks (3 archived)"
      );
    });

    it("should show tagged bookmarks", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 0, archived: 0, tagged: 1, archivedHandled: 0 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, processed 1 deleted bookmark (1 tagged)"
      );
    });

    it("should combine multiple deletion types", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 10,
        deletionResults: { deleted: 2, archived: 3, tagged: 1, archivedHandled: 0 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 10 bookmarks, processed 6 deleted bookmarks (2 deleted) (3 archived) (1 tagged)"
      );
    });

    it("should show archived handled bookmarks", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 0, archived: 0, tagged: 0, archivedHandled: 2 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 5 bookmarks, handled 2 archived bookmarks"
      );
    });

    it("should show both deleted and archived handled", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 10,
        deletionResults: { deleted: 1, archived: 0, tagged: 0, archivedHandled: 3 },
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 10 bookmarks, processed 1 deleted bookmark (1 deleted), handled 3 archived bookmarks"
      );
    });

    it("should use singular for one deleted", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 1, archived: 0, tagged: 0, archivedHandled: 0 },
      };
      expect(buildSyncMessage(stats)).toContain("1 deleted bookmark");
    });

    it("should use singular for one archived handled", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 5,
        deletionResults: { deleted: 0, archived: 0, tagged: 0, archivedHandled: 1 },
      };
      expect(buildSyncMessage(stats)).toContain("1 archived bookmark");
    });
  });

  describe("comprehensive scenarios", () => {
    it("should handle all features enabled", () => {
      const stats: SyncStats = {
        totalBookmarks: 20,
        skippedFiles: 10,
        updatedInHoarder: 3,
        excludedByTags: 5,
        includedByTags: 20,
        includedTagsEnabled: true,
        skippedNoHighlights: 2,
        deletionResults: { deleted: 1, archived: 2, tagged: 1, archivedHandled: 1 },
      };
      const message = buildSyncMessage(stats);
      expect(message).toContain("20 bookmarks");
      expect(message).toContain("skipped 10 existing files");
      expect(message).toContain("updated 3 notes");
      expect(message).toContain("excluded 5 bookmarks");
      expect(message).toContain("included 20 bookmarks");
      expect(message).toContain("skipped 2 bookmarks without highlights");
      expect(message).toContain("processed 4 deleted bookmarks");
      expect(message).toContain("handled 1 archived bookmark");
    });

    it("should handle minimal sync (only synced bookmarks)", () => {
      const stats = { ...baseStats, totalBookmarks: 1 };
      expect(buildSyncMessage(stats)).toBe("Successfully synced 1 bookmark");
    });

    it("should handle sync with no new bookmarks but updates", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 0,
        skippedFiles: 5,
        updatedInHoarder: 2,
      };
      expect(buildSyncMessage(stats)).toBe(
        "Successfully synced 0 bookmarks (skipped 5 existing files) and updated 2 notes in Karakeep"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle all zeros", () => {
      expect(buildSyncMessage(baseStats)).toBe("Successfully synced 0 bookmarks");
    });

    it("should handle very large numbers", () => {
      const stats = {
        ...baseStats,
        totalBookmarks: 9999,
        skippedFiles: 8888,
        excludedByTags: 7777,
      };
      const message = buildSyncMessage(stats);
      expect(message).toContain("9999 bookmarks");
      expect(message).toContain("8888 existing files");
      expect(message).toContain("7777 bookmarks by tags");
    });

    it("should maintain order of message components", () => {
      const stats: SyncStats = {
        totalBookmarks: 10,
        skippedFiles: 5,
        updatedInHoarder: 2,
        excludedByTags: 3,
        includedByTags: 10,
        includedTagsEnabled: true,
        skippedNoHighlights: 1,
        deletionResults: { deleted: 1, archived: 0, tagged: 0, archivedHandled: 0 },
      };
      const message = buildSyncMessage(stats);
      const parts = [
        "Successfully synced",
        "skipped",
        "updated",
        "excluded",
        "included",
        "without highlights",
        "processed",
      ];
      let lastIndex = -1;
      parts.forEach((part) => {
        const index = message.indexOf(part);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
      });
    });
  });
});
