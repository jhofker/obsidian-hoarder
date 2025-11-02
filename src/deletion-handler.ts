/**
 * Action to take for a deleted or archived bookmark
 */
export type DeletionAction = "delete" | "archive" | "tag" | "ignore";

/**
 * Settings related to deletion and archival handling
 */
export interface DeletionSettings {
  syncDeletions: boolean;
  deletionAction: DeletionAction;
  handleArchivedBookmarks: boolean;
  archivedBookmarkAction: DeletionAction;
}

/**
 * Instruction for how to handle a single bookmark file
 */
export interface FileHandlingInstruction {
  bookmarkId: string;
  action: DeletionAction;
  reason: "deleted" | "archived";
}

/**
 * Results from processing deleted and archived bookmarks
 */
export interface DeletionResults {
  deleted: number;
  archived: number;
  tagged: number;
  archivedHandled: number;
}

/**
 * Determines what action should be taken for bookmarks that exist locally
 * but have been deleted or archived remotely.
 *
 * @param localBookmarkIds - IDs of bookmarks that exist in local files
 * @param activeBookmarkIds - IDs of bookmarks that are active remotely
 * @param archivedBookmarkIds - IDs of bookmarks that are archived remotely
 * @param settings - Deletion and archival handling settings
 * @returns Array of instructions for handling each affected bookmark
 */
export function determineDeletionActions(
  localBookmarkIds: string[],
  activeBookmarkIds: Set<string>,
  archivedBookmarkIds: Set<string>,
  settings: DeletionSettings
): FileHandlingInstruction[] {
  const instructions: FileHandlingInstruction[] = [];

  // Early return if both features are disabled
  if (!settings.syncDeletions && !settings.handleArchivedBookmarks) {
    return instructions;
  }

  for (const bookmarkId of localBookmarkIds) {
    const isActive = activeBookmarkIds.has(bookmarkId);
    const isArchived = archivedBookmarkIds.has(bookmarkId);

    if (!isActive && !isArchived) {
      // Bookmark is completely deleted from remote
      if (settings.syncDeletions && settings.deletionAction !== "ignore") {
        instructions.push({
          bookmarkId,
          action: settings.deletionAction,
          reason: "deleted",
        });
      }
    } else if (!isActive && isArchived) {
      // Bookmark is archived remotely
      if (settings.handleArchivedBookmarks && settings.archivedBookmarkAction !== "ignore") {
        instructions.push({
          bookmarkId,
          action: settings.archivedBookmarkAction,
          reason: "archived",
        });
      }
    }
  }

  return instructions;
}

/**
 * Counts the results from executed file handling instructions.
 *
 * @param instructions - Array of instructions that were executed
 * @returns Counts of each action type
 */
export function countDeletionResults(instructions: FileHandlingInstruction[]): DeletionResults {
  const results: DeletionResults = {
    deleted: 0,
    archived: 0,
    tagged: 0,
    archivedHandled: 0,
  };

  for (const instruction of instructions) {
    if (instruction.reason === "deleted") {
      switch (instruction.action) {
        case "delete":
          results.deleted++;
          break;
        case "archive":
          results.archived++;
          break;
        case "tag":
          results.tagged++;
          break;
      }
    } else if (instruction.reason === "archived") {
      results.archivedHandled++;
    }
  }

  return results;
}
