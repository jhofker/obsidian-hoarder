import {
  determineDeletionActions,
  countDeletionResults,
  DeletionSettings,
  FileHandlingInstruction,
} from "./deletion-handler";

describe("determineDeletionActions", () => {
  const defaultSettings: DeletionSettings = {
    syncDeletions: false,
    deletionAction: "delete",
    handleArchivedBookmarks: false,
    archivedBookmarkAction: "archive",
  };

  describe("disabled features", () => {
    it("should return empty array when both features disabled", () => {
      const result = determineDeletionActions(
        ["bookmark1", "bookmark2"],
        new Set(["bookmark3"]),
        new Set(["bookmark4"]),
        defaultSettings
      );
      expect(result).toEqual([]);
    });

    it("should not process deletions when syncDeletions is false", () => {
      const settings = { ...defaultSettings, handleArchivedBookmarks: true };
      const result = determineDeletionActions(
        ["deleted-bookmark"],
        new Set(),
        new Set(),
        settings
      );
      expect(result).toEqual([]);
    });

    it("should not process archived when handleArchivedBookmarks is false", () => {
      const settings = { ...defaultSettings, syncDeletions: true };
      const result = determineDeletionActions(
        ["archived-bookmark"],
        new Set(),
        new Set(["archived-bookmark"]),
        settings
      );
      expect(result).toEqual([]);
    });
  });

  describe("deleted bookmarks", () => {
    const settings: DeletionSettings = {
      syncDeletions: true,
      deletionAction: "delete",
      handleArchivedBookmarks: false,
      archivedBookmarkAction: "ignore",
    };

    it("should detect completely deleted bookmark", () => {
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(),
        settings
      );
      expect(result).toEqual([
        { bookmarkId: "bookmark1", action: "delete", reason: "deleted" },
      ]);
    });

    it("should handle multiple deleted bookmarks", () => {
      const result = determineDeletionActions(
        ["bookmark1", "bookmark2", "bookmark3"],
        new Set(),
        new Set(),
        settings
      );
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.action === "delete" && r.reason === "deleted")).toBe(true);
    });

    it("should not include active bookmarks", () => {
      const result = determineDeletionActions(
        ["active1", "deleted1"],
        new Set(["active1"]),
        new Set(),
        settings
      );
      expect(result).toEqual([
        { bookmarkId: "deleted1", action: "delete", reason: "deleted" },
      ]);
    });

    it("should not include archived bookmarks in deleted", () => {
      const result = determineDeletionActions(
        ["archived1", "deleted1"],
        new Set(),
        new Set(["archived1"]),
        settings
      );
      expect(result).toEqual([
        { bookmarkId: "deleted1", action: "delete", reason: "deleted" },
      ]);
    });
  });

  describe("deletion actions", () => {
    it("should use delete action", () => {
      const settings: DeletionSettings = {
        syncDeletions: true,
        deletionAction: "delete",
        handleArchivedBookmarks: false,
        archivedBookmarkAction: "ignore",
      };
      const result = determineDeletionActions(["bookmark1"], new Set(), new Set(), settings);
      expect(result[0].action).toBe("delete");
    });

    it("should use archive action", () => {
      const settings: DeletionSettings = {
        syncDeletions: true,
        deletionAction: "archive",
        handleArchivedBookmarks: false,
        archivedBookmarkAction: "ignore",
      };
      const result = determineDeletionActions(["bookmark1"], new Set(), new Set(), settings);
      expect(result[0].action).toBe("archive");
    });

    it("should use tag action", () => {
      const settings: DeletionSettings = {
        syncDeletions: true,
        deletionAction: "tag",
        handleArchivedBookmarks: false,
        archivedBookmarkAction: "ignore",
      };
      const result = determineDeletionActions(["bookmark1"], new Set(), new Set(), settings);
      expect(result[0].action).toBe("tag");
    });

    it("should not create instruction for ignore action", () => {
      const settings: DeletionSettings = {
        syncDeletions: true,
        deletionAction: "ignore",
        handleArchivedBookmarks: false,
        archivedBookmarkAction: "ignore",
      };
      const result = determineDeletionActions(["bookmark1"], new Set(), new Set(), settings);
      expect(result).toEqual([]);
    });
  });

  describe("archived bookmarks", () => {
    const settings: DeletionSettings = {
      syncDeletions: false,
      deletionAction: "ignore",
      handleArchivedBookmarks: true,
      archivedBookmarkAction: "archive",
    };

    it("should detect archived bookmark", () => {
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(["bookmark1"]),
        settings
      );
      expect(result).toEqual([
        { bookmarkId: "bookmark1", action: "archive", reason: "archived" },
      ]);
    });

    it("should handle multiple archived bookmarks", () => {
      const result = determineDeletionActions(
        ["bookmark1", "bookmark2"],
        new Set(),
        new Set(["bookmark1", "bookmark2"]),
        settings
      );
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.reason === "archived")).toBe(true);
    });

    it("should not include active bookmarks", () => {
      const result = determineDeletionActions(
        ["active1", "archived1"],
        new Set(["active1"]),
        new Set(["archived1"]),
        settings
      );
      expect(result).toEqual([
        { bookmarkId: "archived1", action: "archive", reason: "archived" },
      ]);
    });
  });

  describe("archived actions", () => {
    it("should use delete action for archived", () => {
      const settings: DeletionSettings = {
        syncDeletions: false,
        deletionAction: "ignore",
        handleArchivedBookmarks: true,
        archivedBookmarkAction: "delete",
      };
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(["bookmark1"]),
        settings
      );
      expect(result[0].action).toBe("delete");
    });

    it("should use archive action for archived", () => {
      const settings: DeletionSettings = {
        syncDeletions: false,
        deletionAction: "ignore",
        handleArchivedBookmarks: true,
        archivedBookmarkAction: "archive",
      };
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(["bookmark1"]),
        settings
      );
      expect(result[0].action).toBe("archive");
    });

    it("should use tag action for archived", () => {
      const settings: DeletionSettings = {
        syncDeletions: false,
        deletionAction: "ignore",
        handleArchivedBookmarks: true,
        archivedBookmarkAction: "tag",
      };
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(["bookmark1"]),
        settings
      );
      expect(result[0].action).toBe("tag");
    });

    it("should not create instruction for ignore action on archived", () => {
      const settings: DeletionSettings = {
        syncDeletions: false,
        deletionAction: "ignore",
        handleArchivedBookmarks: true,
        archivedBookmarkAction: "ignore",
      };
      const result = determineDeletionActions(
        ["bookmark1"],
        new Set(),
        new Set(["bookmark1"]),
        settings
      );
      expect(result).toEqual([]);
    });
  });

  describe("combined scenarios", () => {
    const settings: DeletionSettings = {
      syncDeletions: true,
      deletionAction: "delete",
      handleArchivedBookmarks: true,
      archivedBookmarkAction: "archive",
    };

    it("should handle both deleted and archived bookmarks", () => {
      const result = determineDeletionActions(
        ["deleted1", "archived1"],
        new Set(),
        new Set(["archived1"]),
        settings
      );
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.bookmarkId === "deleted1")).toEqual({
        bookmarkId: "deleted1",
        action: "delete",
        reason: "deleted",
      });
      expect(result.find((r) => r.bookmarkId === "archived1")).toEqual({
        bookmarkId: "archived1",
        action: "archive",
        reason: "archived",
      });
    });

    it("should handle mix of active, deleted, and archived", () => {
      const result = determineDeletionActions(
        ["active1", "deleted1", "archived1"],
        new Set(["active1"]),
        new Set(["archived1"]),
        settings
      );
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.bookmarkId === "active1")).toBeUndefined();
    });

    it("should handle empty local bookmarks", () => {
      const result = determineDeletionActions([], new Set(["active1"]), new Set(), settings);
      expect(result).toEqual([]);
    });

    it("should handle all active bookmarks", () => {
      const result = determineDeletionActions(
        ["bookmark1", "bookmark2"],
        new Set(["bookmark1", "bookmark2"]),
        new Set(),
        settings
      );
      expect(result).toEqual([]);
    });
  });
});

describe("countDeletionResults", () => {
  it("should count zero results for empty array", () => {
    const result = countDeletionResults([]);
    expect(result).toEqual({
      deleted: 0,
      archived: 0,
      tagged: 0,
      archivedHandled: 0,
    });
  });

  it("should count deleted actions", () => {
    const instructions: FileHandlingInstruction[] = [
      { bookmarkId: "1", action: "delete", reason: "deleted" },
      { bookmarkId: "2", action: "delete", reason: "deleted" },
    ];
    const result = countDeletionResults(instructions);
    expect(result.deleted).toBe(2);
    expect(result.archived).toBe(0);
    expect(result.tagged).toBe(0);
    expect(result.archivedHandled).toBe(0);
  });

  it("should count archived actions", () => {
    const instructions: FileHandlingInstruction[] = [
      { bookmarkId: "1", action: "archive", reason: "deleted" },
      { bookmarkId: "2", action: "archive", reason: "deleted" },
      { bookmarkId: "3", action: "archive", reason: "deleted" },
    ];
    const result = countDeletionResults(instructions);
    expect(result.archived).toBe(3);
    expect(result.deleted).toBe(0);
  });

  it("should count tagged actions", () => {
    const instructions: FileHandlingInstruction[] = [
      { bookmarkId: "1", action: "tag", reason: "deleted" },
    ];
    const result = countDeletionResults(instructions);
    expect(result.tagged).toBe(1);
  });

  it("should count archivedHandled actions", () => {
    const instructions: FileHandlingInstruction[] = [
      { bookmarkId: "1", action: "delete", reason: "archived" },
      { bookmarkId: "2", action: "archive", reason: "archived" },
      { bookmarkId: "3", action: "tag", reason: "archived" },
    ];
    const result = countDeletionResults(instructions);
    expect(result.archivedHandled).toBe(3);
    expect(result.deleted).toBe(0);
    expect(result.archived).toBe(0);
    expect(result.tagged).toBe(0);
  });

  it("should count mixed deleted and archived reasons", () => {
    const instructions: FileHandlingInstruction[] = [
      { bookmarkId: "1", action: "delete", reason: "deleted" },
      { bookmarkId: "2", action: "archive", reason: "deleted" },
      { bookmarkId: "3", action: "tag", reason: "deleted" },
      { bookmarkId: "4", action: "delete", reason: "archived" },
      { bookmarkId: "5", action: "archive", reason: "archived" },
    ];
    const result = countDeletionResults(instructions);
    expect(result.deleted).toBe(1);
    expect(result.archived).toBe(1);
    expect(result.tagged).toBe(1);
    expect(result.archivedHandled).toBe(2);
  });

  it("should handle large number of instructions", () => {
    const instructions: FileHandlingInstruction[] = Array.from({ length: 100 }, (_, i) => ({
      bookmarkId: `bookmark${i}`,
      action: i % 2 === 0 ? ("delete" as const) : ("archive" as const),
      reason: i % 3 === 0 ? ("archived" as const) : ("deleted" as const),
    }));
    const result = countDeletionResults(instructions);
    expect(result.deleted + result.archived + result.tagged + result.archivedHandled).toBe(100);
  });
});
