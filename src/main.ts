import { Events, Notice, Plugin, TFile } from "obsidian";

import {
  HoarderApiClient,
  HoarderBookmark,
  HoarderBookmarkContent,
  HoarderTag,
  PaginatedBookmarks,
} from "./hoarder-client";
import { DEFAULT_SETTINGS, HoarderSettingTab, HoarderSettings } from "./settings";

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

    // Initialize the SDK client
    this.initializeClient();

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
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Reinitialize client when settings change
    this.initializeClient();
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

  getBookmarkTitle(bookmark: HoarderBookmark): string {
    // Try main title first
    if (bookmark.title) {
      return bookmark.title;
    }

    // Try content based on type
    if (bookmark.content.type === "link") {
      // For links, try content title, then URL
      if (bookmark.content.title) {
        return bookmark.content.title;
      }
      if (bookmark.content.url) {
        try {
          const url = new URL(bookmark.content.url);
          // Use pathname without extension as title
          const pathTitle = url.pathname
            .split("/")
            .pop()
            ?.replace(/\.[^/.]+$/, "") // Remove file extension
            ?.replace(/-|_/g, " "); // Replace dashes and underscores with spaces
          if (pathTitle) {
            return pathTitle;
          }
          // Fallback to hostname
          return url.hostname.replace(/^www\./, "");
        } catch {
          return bookmark.content.url;
        }
      }
    } else if (bookmark.content.type === "text") {
      // For text content, use first line or first few words
      if (bookmark.content.text) {
        const firstLine = bookmark.content.text.split("\n")[0];
        if (firstLine.length <= 100) {
          return firstLine;
        }
        return firstLine.substring(0, 97) + "...";
      }
    } else if (bookmark.content.type === "asset") {
      // For assets, use filename or source URL
      if (bookmark.content.fileName) {
        return bookmark.content.fileName.replace(/\.[^/.]+$/, ""); // Remove file extension
      }
      if (bookmark.content.sourceUrl) {
        try {
          const url = new URL(bookmark.content.sourceUrl);
          return url.pathname.split("/").pop() || url.hostname;
        } catch {
          return bookmark.content.sourceUrl;
        }
      }
    }

    // Fallback to ID with timestamp
    return `Bookmark-${bookmark.id}-${new Date(bookmark.createdAt).toISOString().split("T")[0]}`;
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
      const notesMatch = content.match(/## Notes\n\n([\s\S]*?)(?=\n##|\n\[|$)/);
      const currentNotes = notesMatch ? notesMatch[1].trim() : null;

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
    let deleted = 0;
    let archived = 0;
    let tagged = 0;
    let archivedHandled = 0;

    if (!this.settings.syncDeletions && !this.settings.handleArchivedBookmarks) {
      return { deleted, archived, tagged, archivedHandled };
    }

    // Find bookmarks that exist locally but not in active bookmarks
    const localBookmarkIds = Array.from(localBookmarkFiles.keys());

    for (const bookmarkId of localBookmarkIds) {
      const filePath = localBookmarkFiles.get(bookmarkId);
      if (!filePath) continue;

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) continue;

      const isActive = activeBookmarkIds.has(bookmarkId);
      const isArchived = archivedBookmarkIds.has(bookmarkId);

      try {
        if (!isActive && !isArchived) {
          // Bookmark is completely deleted from Karakeep
          if (this.settings.syncDeletions) {
            switch (this.settings.deletionAction) {
              case "delete":
                await this.app.vault.delete(file);
                deleted++;
                break;

              case "archive":
                await this.moveToArchiveFolder(file, this.settings.archiveFolder);
                archived++;
                break;

              case "tag":
                await this.addDeletionTag(file, this.settings.deletionTag);
                tagged++;
                break;
            }
          }
        } else if (!isActive && isArchived) {
          // Bookmark is archived in Karakeep
          if (
            this.settings.handleArchivedBookmarks &&
            this.settings.archivedBookmarkAction !== "ignore"
          ) {
            switch (this.settings.archivedBookmarkAction) {
              case "delete":
                await this.app.vault.delete(file);
                archivedHandled++;
                break;

              case "archive":
                await this.moveToArchiveFolder(file, this.settings.archivedBookmarkFolder);
                archivedHandled++;
                break;

              case "tag":
                await this.addDeletionTag(file, this.settings.archivedBookmarkTag);
                archivedHandled++;
                break;
            }
          }
        }
      } catch (error) {
        console.error(`Error handling bookmark ${bookmarkId}:`, error);
      }
    }

    return { deleted, archived, tagged, archivedHandled };
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
      return { success: false, message: "Sync already in progress" };
    }

    if (!this.settings.apiKey) {
      return { success: false, message: "Hoarder API key not configured" };
    }

    this.setSyncing(true);
    let totalBookmarks = 0;
    this.skippedFiles = 0;
    let updatedInHoarder = 0;
    let excludedByTags = 0;
    let includedByTags = 0;
    let totalBookmarksProcessed = 0;

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

      let cursor: string | undefined;

      do {
        const result = await this.fetchBookmarks(cursor);
        const bookmarks = result.bookmarks || [];
        cursor = result.nextCursor || undefined;
        totalBookmarksProcessed += bookmarks.length;

        // Process each bookmark
        for (const bookmark of bookmarks) {
          // Get bookmark tags for filtering
          const bookmarkTags = bookmark.tags.map((tag) => tag.name.toLowerCase());

          // Filter by included tags if specified
          if (this.settings.includedTags.length > 0) {
            const hasIncludedTag = this.settings.includedTags.some((includedTag) =>
              bookmarkTags.includes(includedTag.toLowerCase())
            );
            if (!hasIncludedTag) {
              excludedByTags++;
              continue;
            }
            includedByTags++;
          }

          // Skip if bookmark has any excluded tags
          if (!bookmark.favourited && this.settings.excludedTags.length > 0) {
            const hasExcludedTag = this.settings.excludedTags.some((excludedTag) =>
              bookmarkTags.includes(excludedTag.toLowerCase())
            );
            if (hasExcludedTag) {
              excludedByTags++;
              continue;
            }
          }

          const title = this.getBookmarkTitle(bookmark);
          const fileName = `${folderPath}/${this.sanitizeFileName(title, bookmark.createdAt)}.md`;

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

              // Only update if:
              // 1. updateExistingFiles is true OR
              // 2. No modified timestamp in frontmatter (old file) OR
              // 3. Bookmark has been modified since our last sync OR
              // 4. Notes have changed from their original version
              if (
                this.settings.updateExistingFiles ||
                !storedModifiedTime ||
                bookmarkModifiedTime > storedModifiedTime ||
                (this.settings.syncNotesToHoarder && metadata?.original_note !== bookmark.note)
              ) {
                // Check for local changes to notes if bi-directional sync is enabled
                if (this.settings.syncNotesToHoarder) {
                  const { currentNotes, originalNotes } = await this.extractNotesFromFile(fileName);
                  const remoteNotes = bookmark.note || "";

                  // Only update if notes have changed from their original version
                  if (
                    currentNotes !== null &&
                    originalNotes !== null &&
                    currentNotes !== originalNotes &&
                    currentNotes !== remoteNotes
                  ) {
                    // Local notes have changed from original, update in Hoarder
                    const updated = await this.updateBookmarkInHoarder(bookmark.id, currentNotes);
                    if (updated) {
                      updatedInHoarder++;
                      bookmark.note = currentNotes; // Update the bookmark object with local notes
                    }
                  }
                }

                if (this.settings.updateExistingFiles) {
                  const content = await this.formatBookmarkAsMarkdown(bookmark, title);
                  await this.app.vault.adapter.write(fileName, content);
                  totalBookmarks++;
                } else {
                  this.skippedFiles++;
                }
              }
            }
          } else {
            const content = await this.formatBookmarkAsMarkdown(bookmark, title);
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

      let message = `Successfully synced ${totalBookmarks} bookmark${
        totalBookmarks === 1 ? "" : "s"
      }`;
      if (this.skippedFiles > 0) {
        message += ` (skipped ${this.skippedFiles} existing file${
          this.skippedFiles === 1 ? "" : "s"
        })`;
      }
      if (updatedInHoarder > 0) {
        message += ` and updated ${updatedInHoarder} note${
          updatedInHoarder === 1 ? "" : "s"
        } in Karakeep`;
      }
      if (excludedByTags > 0) {
        message += `, excluded ${excludedByTags} bookmark${
          excludedByTags === 1 ? "" : "s"
        } by tags`;
      }
      if (includedByTags > 0 && this.settings.includedTags.length > 0) {
        message += `, included ${includedByTags} bookmark${
          includedByTags === 1 ? "" : "s"
        } by tags`;
      }

      // Add deletion results to message
      const totalDeleted =
        deletionResults.deleted + deletionResults.archived + deletionResults.tagged;
      const totalArchived = deletionResults.archivedHandled;
      if (totalDeleted > 0 || totalArchived > 0) {
        if (totalDeleted > 0) {
          message += `, processed ${totalDeleted} deleted bookmark${totalDeleted === 1 ? "" : "s"}`;
          if (deletionResults.deleted > 0) {
            message += ` (${deletionResults.deleted} deleted)`;
          }
          if (deletionResults.archived > 0) {
            message += ` (${deletionResults.archived} archived)`;
          }
          if (deletionResults.tagged > 0) {
            message += ` (${deletionResults.tagged} tagged)`;
          }
        }
        if (totalArchived > 0) {
          message += `, handled ${totalArchived} archived bookmark${totalArchived === 1 ? "" : "s"}`;
        }
      }

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

  sanitizeFileName(title: string, created_at: string): string {
    // Format the date as YYYY-MM-DD
    const date = new Date(created_at);
    const dateStr = date.toISOString().split("T")[0]; // This is 10 characters

    // Sanitize the title
    let sanitizedTitle = title
      .replace(/[\\/:*?"<>|]/g, "-") // Replace invalid characters with dash
      .replace(/\s+/g, "-") // Replace spaces with dash
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ""); // Remove dashes from start and end

    // Calculate how much space we have for the title
    // 50 (max) - 10 (date) - 1 (dash) - 3 (.md) = 36 characters for title
    const maxTitleLength = 36;

    if (sanitizedTitle.length > maxTitleLength) {
      // If title is too long, try to cut at a word boundary
      const truncated = sanitizedTitle.substring(0, maxTitleLength);
      const lastDash = truncated.lastIndexOf("-");
      if (lastDash > maxTitleLength / 2) {
        // If we can find a reasonable word break, use it
        sanitizedTitle = truncated.substring(0, lastDash);
      } else {
        // Otherwise just truncate
        sanitizedTitle = truncated;
      }
    }

    return `${dateStr}-${sanitizedTitle}`;
  }

  sanitizeAssetFileName(title: string): string {
    // Sanitize the title
    let sanitizedTitle = title
      .replace(/[\\/:*?"<>|]/g, "-") // Replace invalid characters with dash
      .replace(/\s+/g, "-") // Replace spaces with dash
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ""); // Remove dashes from start and end

    // Use a shorter max length for asset filenames
    const maxTitleLength = 30;

    if (sanitizedTitle.length > maxTitleLength) {
      // If title is too long, try to cut at a word boundary
      const truncated = sanitizedTitle.substring(0, maxTitleLength);
      const lastDash = truncated.lastIndexOf("-");
      if (lastDash > maxTitleLength / 2) {
        // If we can find a reasonable word break, use it
        sanitizedTitle = truncated.substring(0, lastDash);
      } else {
        // Otherwise just truncate
        sanitizedTitle = truncated;
      }
    }

    return sanitizedTitle;
  }

  async downloadImage(url: string, assetId: string, title: string): Promise<string | null> {
    try {
      // Create attachments folder if it doesn't exist
      if (!(await this.app.vault.adapter.exists(this.settings.attachmentsFolder))) {
        await this.app.vault.createFolder(this.settings.attachmentsFolder);
      }

      // Get file extension from URL or default to jpg
      const extension = url.split(".").pop()?.toLowerCase() || "jpg";
      const safeExtension = ["jpg", "jpeg", "png", "gif", "webp"].includes(extension)
        ? extension
        : "jpg";

      // Create a safe filename using just the assetId and a short title
      const safeTitle = this.sanitizeAssetFileName(title);
      const fileName = `${assetId}${safeTitle ? "-" + safeTitle : ""}.${safeExtension}`;
      const filePath = `${this.settings.attachmentsFolder}/${fileName}`;

      // Check if file already exists with any extension
      const files = await this.app.vault.adapter.list(this.settings.attachmentsFolder);
      const existingFile = files.files.find((file) =>
        file.startsWith(`${this.settings.attachmentsFolder}/${assetId}`)
      );
      if (existingFile) {
        return existingFile;
      }

      // Download the image
      let buffer: ArrayBuffer;

      // Check if this is a Hoarder asset URL by checking if it's from the same domain
      const apiDomain = new URL(this.settings.apiEndpoint).origin;
      if (url.startsWith(apiDomain) && this.client) {
        // Use the client's downloadAsset method for Hoarder assets
        buffer = await this.client.downloadAsset(assetId);
      } else {
        // Use fetch for external URLs
        const headers: Record<string, string> = {};
        if (url.startsWith(apiDomain)) {
          headers["Authorization"] = `Bearer ${this.settings.apiKey}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        buffer = await response.arrayBuffer();
      }
      await this.app.vault.adapter.writeBinary(filePath, buffer);

      return filePath;
    } catch (error) {
      console.error("Error downloading image:", url, error);
      return null;
    }
  }

  async formatBookmarkAsMarkdown(bookmark: HoarderBookmark, title: string): Promise<string> {
    const url =
      bookmark.content.type === "link" ? bookmark.content.url : bookmark.content.sourceUrl;
    const description =
      bookmark.content.type === "link" ? bookmark.content.description : bookmark.content.text;
    const tags = bookmark.tags.map((tag) => tag.name);

    // Helper function to get asset URL
    const getAssetUrl = (assetId: string): string => {
      if (this.client) {
        return this.client.getAssetUrl(assetId);
      }
      // Fallback if client is not initialized
      const baseUrl = this.settings.apiEndpoint.replace(/\/v1\/?$/, "");
      return `${baseUrl}/assets/${assetId}`;
    };

    // Helper function to escape paths for markdown (handles spaces)
    const escapeMarkdownPath = (path: string): string => {
      // If path contains spaces or other special characters, wrap in angle brackets
      if (path.includes(" ") || /[<>[\](){}]/.test(path)) {
        return `<${path}>`;
      }
      return path;
    };

    // Helper function to escape YAML values
    const escapeYaml = (str: string | null | undefined): string => {
      if (!str) return "";
      // If string contains newlines or special characters, use block scalar
      if (str.includes("\n") || /[:#{}\[\],&*?|<>=!%@`]/.test(str)) {
        return `|\n  ${str.replace(/\n/g, "\n  ")}`;
      }
      // For simple strings, just wrap in quotes if needed
      if (str.includes('"')) {
        return `'${str}'`;
      }
      if (str.includes("'") || /^[ \t]|[ \t]$/.test(str)) {
        return `"${str.replace(/"/g, '\\"')}"`;
      }
      return str;
    };

    // Helper function to escape tag values
    const escapeTag = (tag: string): string => {
      // Replace spaces with hyphens and handle other special characters
      const processedTag = tag.replace(/\s+/g, "-");
      // Always quote tags to handle other special characters
      if (processedTag.includes('"')) {
        return `'${processedTag}'`;
      }
      return `"${processedTag}"`;
    };

    let content = `---
bookmark_id: "${bookmark.id}"
url: ${escapeYaml(url)}
title: ${escapeYaml(title)}
date: ${new Date(bookmark.createdAt).toISOString()}
${bookmark.modifiedAt ? `modified: ${new Date(bookmark.modifiedAt).toISOString()}\n` : ""}tags:
  - ${tags.map(escapeTag).join("\n  - ")}
note: ${escapeYaml(bookmark.note)}
original_note: ${escapeYaml(bookmark.note)}
summary: ${escapeYaml(bookmark.summary)}
---

# ${title}
`;

    // Handle images
    if (bookmark.content.type === "asset" && bookmark.content.assetType === "image") {
      if (bookmark.content.assetId) {
        const assetUrl = getAssetUrl(bookmark.content.assetId);
        if (this.settings.downloadAssets) {
          const imagePath = await this.downloadImage(assetUrl, bookmark.content.assetId, title);
          if (imagePath) {
            content += `\n![${title}](${escapeMarkdownPath(imagePath)})\n`;
          }
        } else {
          content += `\n![${title}](${escapeMarkdownPath(assetUrl)})\n`;
        }
      } else if (bookmark.content.sourceUrl) {
        content += `\n![${title}](${escapeMarkdownPath(bookmark.content.sourceUrl)})\n`;
      }
    } else if (bookmark.content.type === "link") {
      // For link types, handle Hoarder-hosted images and external images
      if (bookmark.content.imageAssetId) {
        const assetUrl = getAssetUrl(bookmark.content.imageAssetId);
        if (this.settings.downloadAssets) {
          const imagePath = await this.downloadImage(
            assetUrl,
            bookmark.content.imageAssetId,
            title
          );
          if (imagePath) {
            content += `\n![${title}](${escapeMarkdownPath(imagePath)})\n`;
          }
        } else {
          content += `\n![${title}](${escapeMarkdownPath(assetUrl)})\n`;
        }
      } else if (bookmark.content.imageUrl) {
        content += `\n![${title}](${escapeMarkdownPath(bookmark.content.imageUrl)})\n`;
      }
    }

    // Add summary if available
    if (bookmark.summary) {
      content += `\n## Summary\n\n${bookmark.summary}\n`;
    }

    // Add description if available
    if (description) {
      content += `\n## Description\n\n${description}\n`;
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
      // Extract current and original notes
      const { currentNotes, originalNotes } = await this.extractNotesFromFile(file.path);

      // Convert null to empty string for comparison
      const currentNotesStr = currentNotes || "";
      const originalNotesStr = originalNotes || "";

      // Skip if we just synced these exact notes
      if (currentNotesStr === this.lastSyncedNotes) {
        return;
      }

      // Get bookmark ID from frontmatter using MetadataCache
      const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const bookmarkId = metadata?.bookmark_id;
      if (!bookmarkId) return;

      // Only update if notes have changed
      if (currentNotesStr !== originalNotesStr) {
        const updated = await this.updateBookmarkInHoarder(bookmarkId, currentNotesStr);
        if (updated) {
          // Store these notes as the last synced version
          this.lastSyncedNotes = currentNotesStr;

          // Schedule frontmatter update for later
          setTimeout(async () => {
            try {
              // Re-read the file to get the latest content
              const { currentNotes: latestNotes } = await this.extractNotesFromFile(file.path);

              // Only update frontmatter if notes haven't changed since sync
              if (latestNotes === currentNotesStr) {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                  frontmatter["original_note"] = currentNotesStr;
                });
              }
            } catch (error) {
              console.error("Error updating frontmatter:", error);
            }
          }, 5000); // Wait 5 seconds before updating frontmatter

          new Notice("Notes synced to Hoarder");
        }
      }
    } catch (error) {
      console.error("Error handling file modification:", error);
      new Notice("Failed to sync notes to Hoarder");
    }
  }

  private initializeClient() {
    if (!this.settings.apiKey || !this.settings.apiEndpoint) {
      this.client = null;
      return;
    }

    this.client = new HoarderApiClient(
      this.settings.apiEndpoint,
      this.settings.apiKey,
      this.settings.useObsidianRequest
    );
  }
}
