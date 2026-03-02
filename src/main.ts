import { Events, Notice, Plugin, TFile } from "obsidian";

import { processBookmarkAssets } from "./asset-handler";
import { getBookmarkTitle } from "./bookmark-utils";
import {
  DeletionSettings,
  countDeletionResults,
  determineDeletionActions,
} from "./deletion-handler";
import { sanitizeFileName } from "./filename-utils";
import { shouldIncludeBookmark } from "./filter-utils";
import { escapeMarkdownPath, escapeYaml } from "./formatting-utils";
import {
  HoarderApiClient,
  HoarderBookmark,
  HoarderHighlight,
  PaginatedBookmarks,
} from "./hoarder-client";
import { extractNotesSection } from "./markdown-utils";
import { SyncStats, buildSyncMessage } from "./message-utils";
import { DEFAULT_SETTINGS, HoarderSettingTab, HoarderSettings } from "./settings";
import { sanitizeTags } from "./tag-utils";

export default class HoarderPlugin extends Plugin {
  settings: HoarderSettings;
  syncIntervalId: number;
  isSyncing: boolean = false;
  skippedFiles: number = 0;
  events: Events = new Events();
  private modificationTimeout: number | null = null;
  private lastSyncedNotes: string | null = null;
  private client: HoarderApiClient | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize the SDK client (async so Keychain can be read)
    await this.initializeClient();

    // Add settings tab
    this.addSettingTab(new HoarderSettingTab(this.app, this));

    // Add command to trigger sync
    this.addCommand({
      id: "trigger-hoarder-sync",
      name: "Sync Bookmarks",
      callback: async () => {
        const result = await this.syncBookmarks();
        new Notice(result.message);
      },
    });

    // Register file modification event
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        // Check if it's a markdown file in our sync folder
        if (
          this.settings.syncNotesToHoarder &&
          file.path.startsWith(this.settings.syncFolder) &&
          file.path.endsWith(".md") &&
          file instanceof TFile
        ) {
          // Clear any existing timeout
          if (this.modificationTimeout) {
            window.clearTimeout(this.modificationTimeout);
          }

          // Set a new timeout
          this.modificationTimeout = window.setTimeout(async () => {
            await this.handleFileModification(file);
          }, 2000); // Wait 2 seconds after last modification
        }
      })
    );

    // Start periodic sync
    this.startPeriodicSync();
  }

  onunload() {
    // Clear the sync interval when plugin is disabled
    if (this.syncIntervalId) {
      window.clearInterval(this.syncIntervalId);
    }
    // Clear any pending modification timeout
    if (this.modificationTimeout) {
      window.clearTimeout(this.modificationTimeout);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // One-time migration: move plain apiKey into Obsidian Keychain and set apiKeySecretName
    const storage = (this.app as unknown as { secretStorage?: Record<string, unknown> })
      ?.secretStorage;
    const setSecretFn =
      storage &&
      (typeof (storage as { setSecret?: (k: string, v: string) => Promise<void> }).setSecret ===
        "function"
        ? (storage as { setSecret: (k: string, v: string) => Promise<void> }).setSecret.bind(storage)
        : typeof (storage as { set?: (k: string, v: string) => Promise<void> }).set === "function"
          ? (storage as { set: (k: string, v: string) => Promise<void> }).set.bind(storage)
          : null);
    if (
      this.settings.apiKey &&
      !this.settings.apiKeySecretName &&
      setSecretFn
    ) {
      try {
        const secretName = "hoarder-sync-karakeep-api-key";
        await setSecretFn(secretName, this.settings.apiKey);
        this.settings.apiKeySecretName = secretName;
        this.settings.apiKey = "";
        await this.saveData(this.settings);
      } catch (migErr) {
        throw migErr;
      }
    }
  }

  /** Resolve API key from Keychain (apiKeySecretName) or fallback to legacy settings.apiKey */
  async getResolvedApiKey(): Promise<string> {
    const storage = (this.app as unknown as { secretStorage?: Record<string, unknown> })
      ?.secretStorage;
    const getSecretFn =
      storage &&
      (typeof (storage as { getSecret?: (k: string) => Promise<string | undefined> }).getSecret ===
        "function"
        ? (storage as { getSecret: (k: string) => Promise<string | undefined> }).getSecret.bind(
            storage
          )
        : typeof (storage as { get?: (k: string) => Promise<string | undefined> }).get === "function"
          ? (storage as { get: (k: string) => Promise<string | undefined> }).get.bind(storage)
          : null);
    if (this.settings.apiKeySecretName && getSecretFn) {
      const value = await getSecretFn(this.settings.apiKeySecretName);
      return value ?? "";
    }
    return this.settings.apiKey ?? "";
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Reinitialize client when settings change
    await this.initializeClient();
  }

  startPeriodicSync() {
    // Clear existing interval if any
    if (this.syncIntervalId) {
      window.clearInterval(this.syncIntervalId);
    }

    // Convert minutes to milliseconds
    const interval = this.settings.syncIntervalMinutes * 60 * 1000;

    // Perform initial sync
    this.syncBookmarks();

    // Set up periodic sync
    this.syncIntervalId = window.setInterval(() => {
      this.syncBookmarks();
    }, interval);
  }

  async fetchBookmarks(cursor?: string, limit: number = 100): Promise<PaginatedBookmarks> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    return await this.client.getBookmarks({
      limit,
      cursor: cursor || undefined,
      archived: this.settings.excludeArchived ? false : undefined,
      favourited: this.settings.onlyFavorites ? true : undefined,
    });
  }

  async fetchAllBookmarks(includeArchived: boolean = false): Promise<HoarderBookmark[]> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const allBookmarks: HoarderBookmark[] = [];
    let cursor: string | undefined;

    do {
      const data = await this.client.getBookmarks({
        limit: 100,
        cursor: cursor || undefined,
        archived: includeArchived ? undefined : false,
        favourited: this.settings.onlyFavorites ? true : undefined,
      });

      allBookmarks.push(...(data.bookmarks || []));
      cursor = data.nextCursor || undefined;
    } while (cursor);

    return allBookmarks;
  }

  async extractNotesFromFile(
    filePath: string
  ): Promise<{ currentNotes: string | null; originalNotes: string | null }> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return { currentNotes: null, originalNotes: null };
      }

      const content = await this.app.vault.adapter.read(filePath);

      // Extract notes from the content
      const currentNotes = extractNotesSection(content);

      // Use MetadataCache to get frontmatter
      const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const originalNotes = metadata?.original_note ?? null;

      return { currentNotes, originalNotes };
    } catch (error) {
      console.error("Error reading file:", error);
      return { currentNotes: null, originalNotes: null };
    }
  }

  async updateBookmarkInHoarder(bookmarkId: string, note: string): Promise<boolean> {
    try {
      if (!this.client) {
        throw new Error("Client not initialized");
      }

      await this.client.updateBookmark(bookmarkId, { note });
      return true;
    } catch (error) {
      console.error("Error updating bookmark in Hoarder:", error);
      return false;
    }
  }

  private setSyncing(value: boolean) {
    this.isSyncing = value;
    this.events.trigger("sync-state-change", value);
  }

  async getLocalBookmarkFiles(): Promise<Map<string, string>> {
    const bookmarkFiles = new Map<string, string>();
    const folderPath = this.settings.syncFolder;

    if (!(await this.app.vault.adapter.exists(folderPath))) {
      return bookmarkFiles;
    }

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (file.path.startsWith(folderPath) && file.path.endsWith(".md")) {
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const bookmarkId = metadata?.bookmark_id;
        if (bookmarkId) {
          bookmarkFiles.set(bookmarkId, file.path);
        }
      }
    }

    return bookmarkFiles;
  }

  async handleDeletedAndArchivedBookmarks(
    localBookmarkFiles: Map<string, string>,
    activeBookmarkIds: Set<string>,
    archivedBookmarkIds: Set<string>
  ): Promise<{ deleted: number; archived: number; tagged: number; archivedHandled: number }> {
    const deletionSettings: DeletionSettings = {
      syncDeletions: this.settings.syncDeletions,
      deletionAction: this.settings.deletionAction,
      handleArchivedBookmarks: this.settings.handleArchivedBookmarks,
      archivedBookmarkAction: this.settings.archivedBookmarkAction,
    };

    const localBookmarkIds = Array.from(localBookmarkFiles.keys());
    const instructions = determineDeletionActions(
      localBookmarkIds,
      activeBookmarkIds,
      archivedBookmarkIds,
      deletionSettings
    );

    // Execute each instruction
    for (const instruction of instructions) {
      const filePath = localBookmarkFiles.get(instruction.bookmarkId);
      if (!filePath) continue;

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) continue;

      try {
        switch (instruction.action) {
          case "delete":
            await this.app.vault.delete(file);
            break;

          case "archive":
            const archiveFolder =
              instruction.reason === "deleted"
                ? this.settings.archiveFolder
                : this.settings.archivedBookmarkFolder;
            await this.moveToArchiveFolder(file, archiveFolder);
            break;

          case "tag":
            const tag =
              instruction.reason === "deleted"
                ? this.settings.deletionTag
                : this.settings.archivedBookmarkTag;
            await this.addDeletionTag(file, tag);
            break;
        }
      } catch (error) {
        console.error(`Error handling bookmark ${instruction.bookmarkId}:`, error);
      }
    }

    return countDeletionResults(instructions);
  }

  async moveToArchiveFolder(file: TFile, archiveFolder: string): Promise<void> {
    if (!archiveFolder) {
      throw new Error("Archive folder not configured");
    }

    // Create archive folder if it doesn't exist
    if (!(await this.app.vault.adapter.exists(archiveFolder))) {
      await this.app.vault.createFolder(archiveFolder);
    }

    // Generate new path in archive folder
    const fileName = file.name;
    const newPath = `${archiveFolder}/${fileName}`;

    // Handle name conflicts
    let finalPath = newPath;
    let counter = 1;
    while (await this.app.vault.adapter.exists(finalPath)) {
      const nameWithoutExt = fileName.replace(/\.md$/, "");
      finalPath = `${archiveFolder}/${nameWithoutExt}-${counter}.md`;
      counter++;
    }

    await this.app.fileManager.renameFile(file, finalPath);
  }

  async addDeletionTag(file: TFile, tag: string): Promise<void> {
    if (!tag) {
      throw new Error("Tag not configured");
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (!frontmatter.tags) {
        frontmatter.tags = [];
      }

      // Ensure tags is an array
      if (typeof frontmatter.tags === "string") {
        frontmatter.tags = [frontmatter.tags];
      }

      // Add tag if not already present
      if (!frontmatter.tags.includes(tag)) {
        frontmatter.tags.push(tag);
      }
    });
  }

  async syncBookmarks(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      console.error("[Hoarder] Sync already in progress");
      return { success: false, message: "Sync already in progress" };
    }

    // Use resolved key (Keychain or legacy apiKey)
    const apiKey = await this.getResolvedApiKey();
    if (!apiKey) {
      console.log("[Hoarder] API key not configured");
      return { success: false, message: "Hoarder API key not configured" };
    }

    console.log("[Hoarder] Starting sync...");
    console.log(
      `[Hoarder] Settings: syncNotesToHoarder=${this.settings.syncNotesToHoarder}, updateExistingFiles=${this.settings.updateExistingFiles}`
    );
    this.setSyncing(true);
    let totalBookmarks = 0;
    this.skippedFiles = 0;
    let updatedInHoarder = 0;
    let excludedByTags = 0;
    let includedByTags = 0;
    let totalBookmarksProcessed = 0;
    let skippedNoHighlights = 0;

    try {
      // Create sync folder if it doesn't exist
      const folderPath = this.settings.syncFolder;
      if (!(await this.app.vault.adapter.exists(folderPath))) {
        await this.app.vault.createFolder(folderPath);
      }

      // Get existing local bookmark files for deletion detection
      const localBookmarkFiles = await this.getLocalBookmarkFiles();

      // Fetch all bookmarks to distinguish between active, archived, and deleted
      const activeBookmarks = await this.fetchAllBookmarks(false); // Only active bookmarks
      const allBookmarks = await this.fetchAllBookmarks(true); // All bookmarks including archived

      const activeBookmarkIds = new Set(activeBookmarks.map((b) => b.id));
      const allBookmarkIds = new Set(allBookmarks.map((b) => b.id));
      const archivedBookmarkIds = new Set(
        allBookmarks.filter((b) => b.archived && !activeBookmarkIds.has(b.id)).map((b) => b.id)
      );

      // Fetch all highlights in bulk if enabled or if filtering by highlights
      let highlightsByBookmarkId = new Map<string, HoarderHighlight[]>();
      let bookmarkIdsWithHighlights = new Set<string>();
      if (
        (this.settings.syncHighlights || this.settings.onlyBookmarksWithHighlights) &&
        this.client
      ) {
        try {
          const allHighlights = await this.client.getAllHighlights();

          // Group highlights by bookmark ID
          for (const highlight of allHighlights) {
            if (!highlightsByBookmarkId.has(highlight.bookmarkId)) {
              highlightsByBookmarkId.set(highlight.bookmarkId, []);
            }
            highlightsByBookmarkId.get(highlight.bookmarkId)!.push(highlight);
            bookmarkIdsWithHighlights.add(highlight.bookmarkId);
          }
        } catch (error) {
          console.error("Error fetching highlights in bulk:", error);
          // Continue without highlights rather than failing the entire sync
        }
      }

      let cursor: string | undefined;

      do {
        const result = await this.fetchBookmarks(cursor);
        const bookmarks = result.bookmarks || [];
        cursor = result.nextCursor || undefined;
        totalBookmarksProcessed += bookmarks.length;

        // Process each bookmark
        for (const bookmark of bookmarks) {
          // Skip if filtering by highlights and bookmark has no highlights
          if (
            this.settings.onlyBookmarksWithHighlights &&
            !bookmarkIdsWithHighlights.has(bookmark.id)
          ) {
            skippedNoHighlights++;
            continue;
          }

          // Get bookmark tags for filtering
          const bookmarkTags = bookmark.tags.map((tag) => tag.name.toLowerCase());

          // Check if bookmark should be included based on tag filters
          const filterResult = shouldIncludeBookmark(
            bookmarkTags,
            this.settings.includedTags.map((t) => t.toLowerCase()),
            this.settings.excludedTags.map((t) => t.toLowerCase()),
            bookmark.favourited
          );

          if (!filterResult.include) {
            excludedByTags++;
            continue;
          }

          // Count included bookmarks when using include filter
          if (this.settings.includedTags.length > 0) {
            includedByTags++;
          }

          const title = getBookmarkTitle(bookmark);
          const fileName = `${folderPath}/${sanitizeFileName(title, bookmark.createdAt)}.md`;

          // Get highlights for this bookmark from pre-fetched map
          const highlights = highlightsByBookmarkId.get(bookmark.id) || [];

          const fileExists = await this.app.vault.adapter.exists(fileName);

          if (fileExists) {
            // Check if we need to update the file
            const file = this.app.vault.getAbstractFileByPath(fileName);
            if (file instanceof TFile) {
              const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
              const storedModifiedTime = metadata?.modified
                ? new Date(metadata.modified).getTime()
                : 0;
              const bookmarkModifiedTime = bookmark.modifiedAt
                ? new Date(bookmark.modifiedAt).getTime()
                : new Date(bookmark.createdAt).getTime();

              // Check if there are new highlights since last file update
              let hasNewHighlights = false;
              if (this.settings.syncHighlights && highlights.length > 0) {
                const newestHighlightTime = Math.max(
                  ...highlights.map((h) => new Date(h.createdAt).getTime())
                );
                hasNewHighlights = !storedModifiedTime || newestHighlightTime > storedModifiedTime;
              }

              // Check if we should update existing files based on user setting
              if (!this.settings.updateExistingFiles) {
                // User has disabled updates to existing files
                this.skippedFiles++;
                continue;
              }

              // Check for local changes to notes if bi-directional sync is enabled
              if (this.settings.syncNotesToHoarder) {
                const { currentNotes, originalNotes } = await this.extractNotesFromFile(fileName);
                const remoteNotes = bookmark.note || "";

                // Initialize original_note if it's missing
                if (originalNotes === null && currentNotes !== null) {
                  console.debug(`[Hoarder] original_note missing for ${fileName}`);

                  // If current notes differ from remote, sync them
                  if (currentNotes !== remoteNotes) {
                    console.log(`[Hoarder] Local notes differ from remote, syncing to Hoarder`);
                    const updated = await this.updateBookmarkInHoarder(bookmark.id, currentNotes);
                    if (updated) {
                      updatedInHoarder++;
                      bookmark.note = currentNotes; // Update the bookmark object with local notes
                      this.lastSyncedNotes = currentNotes; // Track this to avoid re-syncing

                      // Now initialize original_note to match the synced version
                      console.debug(
                        `[Hoarder] Initializing original_note to synced value for ${fileName}`
                      );
                      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                        frontmatter["original_note"] = currentNotes;
                      });
                    }
                  } else {
                    // Current notes match remote, only update frontmatter if they're different
                    // Since currentNotes === remoteNotes, we can skip the frontmatter update entirely
                    // to avoid changing mtime. The frontmatter will be initialized on the next actual change.
                    console.debug(
                      `[Hoarder] Notes match remote, skipping original_note initialization to preserve mtime`
                    );
                  }
                } else if (
                  currentNotes !== null &&
                  originalNotes !== null &&
                  currentNotes !== originalNotes &&
                  currentNotes !== remoteNotes
                ) {
                  // Local notes have changed from original, update in Hoarder
                  console.log(`[Hoarder] Local notes changed for ${fileName}, syncing to Hoarder`);
                  const updated = await this.updateBookmarkInHoarder(bookmark.id, currentNotes);
                  if (updated) {
                    updatedInHoarder++;
                    bookmark.note = currentNotes; // Update the bookmark object with local notes
                    this.lastSyncedNotes = currentNotes; // Track this to avoid re-syncing
                  }
                }
              }

              // Generate new content and compare with existing
              const newContent = await this.formatBookmarkAsMarkdown(
                bookmark,
                title,
                highlights,
                apiKey
              );
              const existingContent = await this.app.vault.adapter.read(fileName);

              if (existingContent !== newContent) {
                // Content has actually changed, update the file
                await this.app.vault.adapter.write(fileName, newContent);
                totalBookmarks++;
              } else {
                // Content is identical, skip writing to preserve modification time
                this.skippedFiles++;
              }
            }
          } else {
            const content = await this.formatBookmarkAsMarkdown(
              bookmark,
              title,
              highlights,
              apiKey
            );
            await this.app.vault.create(fileName, content);
            totalBookmarks++;
          }
        }
      } while (cursor);

      // Handle deleted/archived bookmarks
      const deletionResults = await this.handleDeletedAndArchivedBookmarks(
        localBookmarkFiles,
        activeBookmarkIds,
        archivedBookmarkIds
      );

      // Update last sync timestamp
      this.settings.lastSyncTimestamp = Date.now();
      await this.saveSettings();

      const stats: SyncStats = {
        totalBookmarks,
        skippedFiles: this.skippedFiles,
        updatedInHoarder,
        excludedByTags,
        includedByTags,
        includedTagsEnabled: this.settings.includedTags.length > 0,
        skippedNoHighlights,
        deletionResults,
      };
      const message = buildSyncMessage(stats);

      return {
        success: true,
        message,
      };
    } catch (error) {
      console.error("Error syncing bookmarks:", error);
      return {
        success: false,
        message: `Error syncing: ${error.message}`,
      };
    } finally {
      this.setSyncing(false);
      this.skippedFiles = 0;
    }
  }

  async formatBookmarkAsMarkdown(
    bookmark: HoarderBookmark,
    title: string,
    highlights?: HoarderHighlight[],
    resolvedApiKey?: string
  ): Promise<string> {
    const url =
      bookmark.content.type === "link" ? bookmark.content.url : bookmark.content.sourceUrl;
    const description =
      bookmark.content.type === "link" ? bookmark.content.description : bookmark.content.text;
    const rawTags = bookmark.tags.map((tag) => tag.name);
    const tags = sanitizeTags(rawTags);

    // Use resolved API key for asset requests when provided (Keychain or legacy)
    const settingsForAssets =
      resolvedApiKey != null ? { ...this.settings, apiKey: resolvedApiKey } : this.settings;
    const { content: assetContent, frontmatter: assetsFm } = await processBookmarkAssets(
      this.app,
      bookmark,
      title,
      this.client,
      settingsForAssets
    );

    // Build top-level asset YAML entries (wikilinks only)
    let assetsYaml = "";
    if (assetsFm) {
      const lines: string[] = [];
      if (assetsFm.image) lines.push(`image: ${assetsFm.image}`);
      if (assetsFm.banner) lines.push(`banner: ${assetsFm.banner}`);
      if (assetsFm.screenshot) lines.push(`screenshot: ${assetsFm.screenshot}`);
      if (assetsFm.full_page_archive)
        lines.push(`full_page_archive: ${assetsFm.full_page_archive}`);
      if (assetsFm.video) lines.push(`video: ${assetsFm.video}`);
      if (assetsFm.additional && assetsFm.additional.length > 0) {
        lines.push("additional:");
        for (const link of assetsFm.additional) {
          lines.push(`  - ${link}`);
        }
      }
      assetsYaml = lines.join("\n") + "\n";
    }

    // Build tags YAML - only include if there are valid tags
    const tagsYaml = tags.length > 0 ? `tags:\n  - ${tags.join("\n  - ")}\n` : "";

    let content = `---
bookmark_id: "${bookmark.id}"
url: ${escapeYaml(url)}
title: ${escapeYaml(title)}
date: ${new Date(bookmark.createdAt).toISOString()}
${bookmark.modifiedAt ? `modified: ${new Date(bookmark.modifiedAt).toISOString()}\n` : ""}${tagsYaml}note: ${escapeYaml(bookmark.note)}
original_note: ${escapeYaml(bookmark.note)}
summary: ${escapeYaml(bookmark.summary)}
${assetsYaml}
---

# ${title}
`;

    // Append any asset content (images/links embeds)
    content += assetContent;

    // Add summary if available
    if (bookmark.summary) {
      content += `\n## Summary\n\n${bookmark.summary}\n`;
    }

    // Add description if available
    if (description) {
      content += `\n## Description\n\n${description}\n`;
    }

    // Add highlights if available and enabled
    if (highlights && highlights.length > 0 && this.settings.syncHighlights) {
      content += `\n## Highlights\n\n`;

      // Sort highlights by startOffset (position in document)
      const sortedHighlights = highlights.sort((a, b) => a.startOffset - b.startOffset);

      for (const highlight of sortedHighlights) {
        const date = new Date(highlight.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        content += `> [!karakeep-${highlight.color}] ${date}\n`;

        // Handle multi-line highlight text by prefixing each line with '> '
        const highlightLines = highlight.text.split("\n");
        for (const line of highlightLines) {
          content += `> ${line}\n`;
        }

        if (highlight.note && highlight.note.trim()) {
          content += `>\n`;
          // Handle multi-line notes by prefixing each line with '> '
          const noteLines = highlight.note.split("\n");
          for (let i = 0; i < noteLines.length; i++) {
            if (i === 0) {
              content += `> *Note: ${noteLines[i]}*\n`;
            } else {
              content += `> *${noteLines[i]}*\n`;
            }
          }
        }

        content += `\n`;
      }
    }

    // Always add Notes section
    content += `\n## Notes\n\n${bookmark.note || ""}\n`;

    // Add link if available (and it's not just an image)
    if (url && bookmark.content.type !== "asset") {
      content += `\n[Visit Link](${escapeMarkdownPath(url)})\n`;
    }
    const hoarderUrl = `${this.settings.apiEndpoint.replace("/api/v1", "/dashboard/preview")}/${bookmark.id}`;
    content += `\n[View in Hoarder](${escapeMarkdownPath(hoarderUrl)})`;

    return content;
  }

  private async handleFileModification(file: TFile) {
    try {
      console.debug(`[Hoarder] File modified: ${file.path}`);

      // Extract current and original notes
      const { currentNotes, originalNotes } = await this.extractNotesFromFile(file.path);

      // Convert null to empty string for comparison
      const currentNotesStr = currentNotes || "";
      const originalNotesStr = originalNotes || "";

      console.log(
        `[Hoarder] Current notes length: ${currentNotesStr.length}, Original notes length: ${originalNotesStr.length}`
      );

      // Skip if we just synced these exact notes
      if (currentNotesStr === this.lastSyncedNotes) {
        console.log("[Hoarder] Skipping - notes match last synced version");
        return;
      }

      // Get bookmark ID from frontmatter using MetadataCache
      const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const bookmarkId = metadata?.bookmark_id;
      if (!bookmarkId) {
        console.log("[Hoarder] No bookmark_id found in frontmatter");
        return;
      }

      console.log(`[Hoarder] Bookmark ID: ${bookmarkId}`);

      // If original_note is null/undefined, initialize it to current value from frontmatter
      // This handles files that were created before this fix or when updateExistingFiles was disabled
      if (originalNotes === null) {
        const frontmatterNote = metadata?.note || "";
        console.log(`[Hoarder] original_note is null for ${file.path}`);

        // Check if current notes differ from what's in frontmatter
        if (currentNotesStr !== frontmatterNote) {
          console.log("[Hoarder] Notes have changed from frontmatter note");
          const success = await this.updateBookmarkInHoarder(bookmarkId, currentNotesStr);
          if (success) {
            this.lastSyncedNotes = currentNotesStr;

            // Initialize original_note after successful sync
            setTimeout(async () => {
              try {
                const { currentNotes: latestNotes, originalNotes: currentOriginalNotes } =
                  await this.extractNotesFromFile(file.path);
                // Only update if notes haven't changed AND original_note still needs initialization
                if (latestNotes === currentNotesStr && currentOriginalNotes !== currentNotesStr) {
                  await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    frontmatter["original_note"] = currentNotesStr;
                  });
                  console.debug("[Hoarder] Initialized and updated original_note in frontmatter");
                } else if (currentOriginalNotes === currentNotesStr) {
                  console.debug(
                    "[Hoarder] original_note already initialized, skipping frontmatter update"
                  );
                }
              } catch (error) {
                console.error("[Hoarder] Error updating frontmatter:", error);
              }
            }, 5000);

            new Notice("Notes synced to Hoarder");
          } else {
            console.error("[Hoarder] Failed to update bookmark in Hoarder");
          }
        } else {
          // Notes match frontmatter note, skip initialization to preserve mtime
          // The field will be initialized on the next actual change
          console.debug(
            "[Hoarder] Notes match frontmatter, skipping original_note initialization to preserve mtime"
          );
        }
        return;
      }

      // Only update if notes have changed
      if (currentNotesStr !== originalNotesStr) {
        console.log("[Hoarder] Notes have changed, syncing to Hoarder");
        const updated = await this.updateBookmarkInHoarder(bookmarkId, currentNotesStr);
        if (updated) {
          // Store these notes as the last synced version
          this.lastSyncedNotes = currentNotesStr;
          console.log("[Hoarder] Successfully synced notes to Hoarder");

          // Schedule frontmatter update for later
          setTimeout(async () => {
            try {
              // Re-read the file to get the latest content
              const { currentNotes: latestNotes, originalNotes: currentOriginalNotes } =
                await this.extractNotesFromFile(file.path);

              // Only update frontmatter if notes haven't changed since sync AND original_note needs updating
              if (latestNotes === currentNotesStr && currentOriginalNotes !== currentNotesStr) {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                  frontmatter["original_note"] = currentNotesStr;
                });
                console.debug("[Hoarder] Updated original_note in frontmatter");
              } else if (latestNotes !== currentNotesStr) {
                console.debug("[Hoarder] Notes changed again, skipping frontmatter update");
              } else {
                console.debug(
                  "[Hoarder] original_note already up to date, skipping frontmatter update"
                );
              }
            } catch (error) {
              console.error("[Hoarder] Error updating frontmatter:", error);
            }
          }, 5000); // Wait 5 seconds before updating frontmatter

          new Notice("Notes synced to Hoarder");
        } else {
          console.error("[Hoarder] Failed to update bookmark in Hoarder");
          new Notice("Failed to sync notes to Hoarder");
        }
      } else {
        console.log("[Hoarder] Notes unchanged, no sync needed");
      }
    } catch (error) {
      console.error("[Hoarder] Error handling file modification:", error);
      new Notice("Failed to sync notes to Hoarder");
    }
  }

  private async initializeClient() {
    const apiKey = await this.getResolvedApiKey();
    if (!apiKey || !this.settings.apiEndpoint) {
      this.client = null;
    } else {
      this.client = new HoarderApiClient(
        this.settings.apiEndpoint,
        apiKey,
        this.settings.useObsidianRequest
      );
    }
  }
}
