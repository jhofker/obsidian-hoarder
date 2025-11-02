/**
 * Statistics from a bookmark sync operation
 */
export interface SyncStats {
  /** Number of bookmarks created/updated */
  totalBookmarks: number;
  /** Number of existing files skipped (no changes) */
  skippedFiles: number;
  /** Number of notes updated in Hoarder */
  updatedInHoarder: number;
  /** Number of bookmarks excluded by tag filters */
  excludedByTags: number;
  /** Number of bookmarks included by tag filters */
  includedByTags: number;
  /** Whether included tags filter is enabled */
  includedTagsEnabled: boolean;
  /** Number of bookmarks skipped due to no highlights */
  skippedNoHighlights: number;
  /** Results from deletion/archival processing */
  deletionResults: {
    deleted: number;
    archived: number;
    tagged: number;
    archivedHandled: number;
  };
}

/**
 * Builds a human-readable sync success message from statistics.
 *
 * @param stats - Sync operation statistics
 * @returns Formatted message string
 */
export function buildSyncMessage(stats: SyncStats): string {
  let message = `Successfully synced ${stats.totalBookmarks} bookmark${
    stats.totalBookmarks === 1 ? "" : "s"
  }`;

  if (stats.skippedFiles > 0) {
    message += ` (skipped ${stats.skippedFiles} existing file${
      stats.skippedFiles === 1 ? "" : "s"
    })`;
  }

  if (stats.updatedInHoarder > 0) {
    message += ` and updated ${stats.updatedInHoarder} note${
      stats.updatedInHoarder === 1 ? "" : "s"
    } in Karakeep`;
  }

  if (stats.excludedByTags > 0) {
    message += `, excluded ${stats.excludedByTags} bookmark${
      stats.excludedByTags === 1 ? "" : "s"
    } by tags`;
  }

  if (stats.includedByTags > 0 && stats.includedTagsEnabled) {
    message += `, included ${stats.includedByTags} bookmark${
      stats.includedByTags === 1 ? "" : "s"
    } by tags`;
  }

  if (stats.skippedNoHighlights > 0) {
    message += `, skipped ${stats.skippedNoHighlights} bookmark${
      stats.skippedNoHighlights === 1 ? "" : "s"
    } without highlights`;
  }

  // Add deletion results to message
  const totalDeleted =
    stats.deletionResults.deleted +
    stats.deletionResults.archived +
    stats.deletionResults.tagged;
  const totalArchived = stats.deletionResults.archivedHandled;

  if (totalDeleted > 0 || totalArchived > 0) {
    if (totalDeleted > 0) {
      message += `, processed ${totalDeleted} deleted bookmark${totalDeleted === 1 ? "" : "s"}`;
      if (stats.deletionResults.deleted > 0) {
        message += ` (${stats.deletionResults.deleted} deleted)`;
      }
      if (stats.deletionResults.archived > 0) {
        message += ` (${stats.deletionResults.archived} archived)`;
      }
      if (stats.deletionResults.tagged > 0) {
        message += ` (${stats.deletionResults.tagged} tagged)`;
      }
    }
    if (totalArchived > 0) {
      message += `, handled ${totalArchived} archived bookmark${totalArchived === 1 ? "" : "s"}`;
    }
  }

  return message;
}
