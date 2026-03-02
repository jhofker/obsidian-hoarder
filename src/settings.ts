import * as Obsidian from "obsidian";
import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";

/** Obsidian Keychain API (optional in older versions). Types may not be in @types. */
type SecretComponentCtor = new (
  app: App,
  el: HTMLElement
) => { setValue(v: string): unknown; onChange(fn: (v: string) => void): unknown };
const SecretComponent = (
  Obsidian as unknown as { SecretComponent?: SecretComponentCtor }
).SecretComponent as SecretComponentCtor | undefined;

import HoarderPlugin from "./main";

export interface HoarderSettings {
  /** @deprecated Use apiKeySecretName and Obsidian Keychain instead. Kept for migration fallback. */
  apiKey?: string;
  /** Obsidian Keychain secret name; API key stored securely, not in plain text. */
  apiKeySecretName?: string;
  apiEndpoint: string;
  syncFolder: string;
  attachmentsFolder: string;
  syncIntervalMinutes: number;
  lastSyncTimestamp: number;
  updateExistingFiles: boolean;
  excludeArchived: boolean;
  onlyFavorites: boolean;
  syncNotesToHoarder: boolean;
  syncHighlights: boolean;
  onlyBookmarksWithHighlights: boolean;
  excludedTags: string[];
  includedTags: string[];
  downloadAssets: boolean;
  syncDeletions: boolean;
  deletionAction: "delete" | "archive" | "tag";
  deletionTag: string;
  archiveFolder: string;
  handleArchivedBookmarks: boolean;
  archivedBookmarkAction: "delete" | "archive" | "tag" | "ignore";
  archivedBookmarkTag: string;
  archivedBookmarkFolder: string;
  useObsidianRequest: boolean;
}

export const DEFAULT_SETTINGS: HoarderSettings = {
  apiKey: "",
  apiKeySecretName: "",
  apiEndpoint: "https://api.hoarder.app/api/v1",
  syncFolder: "Hoarder",
  attachmentsFolder: "Hoarder/attachments",
  syncIntervalMinutes: 60,
  lastSyncTimestamp: 0,
  updateExistingFiles: false,
  excludeArchived: true,
  onlyFavorites: false,
  syncNotesToHoarder: true,
  syncHighlights: true,
  onlyBookmarksWithHighlights: false,
  excludedTags: [],
  includedTags: [],
  downloadAssets: true,
  syncDeletions: false,
  deletionAction: "delete",
  deletionTag: "deleted",
  archiveFolder: "Hoarder/deleted",
  handleArchivedBookmarks: false,
  archivedBookmarkAction: "delete",
  archivedBookmarkTag: "archived",
  archivedBookmarkFolder: "Hoarder/archived",
  useObsidianRequest: false,
};

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private folders: TFolder[];
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.folders = this.getFolders();
    this.inputEl = inputEl;
  }

  getSuggestions(inputStr: string): TFolder[] {
    const lowerCaseInputStr = inputStr.toLowerCase();
    return this.folders.filter((folder) => folder.path.toLowerCase().contains(lowerCaseInputStr));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }
  selectSuggestion(folder: TFolder): void {
    const value = folder.path;
    this.inputEl.value = value;
    this.inputEl.trigger("input");
    this.close();
  }

  private getFolders(): TFolder[] {
    const folders: TFolder[] = [];
    this.app.vault.getAllLoadedFiles().forEach((file) => {
      if (file instanceof TFolder) {
        folders.push(file);
      }
    });
    return folders.sort((a, b) => a.path.localeCompare(b.path));
  }
}

export class HoarderSettingTab extends PluginSettingTab {
  plugin: HoarderPlugin;
  syncButton: any;

  constructor(app: App, plugin: HoarderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  onunload() {
    // Clean up event listener
    this.plugin.events.off("sync-state-change", this.updateSyncButton);
  }

  private updateSyncButton = (isSyncing: boolean) => {
    if (this.syncButton) {
      this.syncButton.setButtonText(isSyncing ? "Syncing..." : "Sync Now");
      this.syncButton.setDisabled(isSyncing);
    }
  };

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // =================
    // API Configuration
    // =================
    containerEl.createEl("h3", { text: "API Configuration" });
    containerEl.createEl("div", {
      text: "Connection settings for your Karakeep instance",
      cls: "setting-item-description",
    });

    // Prefer Obsidian Keychain (SecretComponent) so API key is not stored in plain text in data.json
    const apiKeySetting = new Setting(containerEl).setName("Api key");
    const settingWithAddComponent = apiKeySetting as Setting & {
      addComponent?: (cb: (el: HTMLElement) => void) => Setting;
    };
    if (
      typeof SecretComponent === "function" &&
      typeof settingWithAddComponent.addComponent === "function"
    ) {
      apiKeySetting.setDesc(
        "Select or create a secret in Obsidian's Keychain (Settings → Keychain). Your API key is stored securely and not in plain text."
      );
      settingWithAddComponent.addComponent!((el: HTMLElement): void => {
        // Obsidian types may not expose SecretComponent; safe at runtime when typeof check passes
        const Ctor = SecretComponent as SecretComponentCtor;
        const component = new Ctor(this.app, el) as {
          setValue(v: string): { onChange(fn: (v: string) => void): unknown };
        };
        component
          .setValue(this.plugin.settings.apiKeySecretName ?? "")
          .onChange(async (value: string) => {
            this.plugin.settings.apiKeySecretName = value;
            await this.plugin.saveSettings();
          });
      });
    } else {
      // Fallback for older Obsidian versions without SecretComponent / addComponent
      apiKeySetting
        .setDesc("Your Hoarder API key")
        .addText((text) =>
          text
            .setPlaceholder("Enter your API key")
            .setValue(this.plugin.settings.apiKey ?? "")
            .onChange(async (value: string) => {
              this.plugin.settings.apiKey = value;
              await this.plugin.saveSettings();
            })
            .inputEl.addClass("hoarder-wide-input")
        );
    }

    new Setting(containerEl)
      .setName("Api endpoint")
      .setDesc("Hoarder API endpoint URL (default: https://api.karakeep.app/api/v1)")
      .addText((text) =>
        text
          .setPlaceholder("Enter API endpoint")
          .setValue(this.plugin.settings.apiEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.apiEndpoint = value;
            await this.plugin.saveSettings();
          })
          .inputEl.addClass("hoarder-wide-input")
      );

    new Setting(containerEl)
      .setName("Bypass CORS")
      .setDesc(
        "Use Obsidian's internal request method to avoid CORS issues. Enable this if you're experiencing connection problems."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useObsidianRequest).onChange(async (value) => {
          this.plugin.settings.useObsidianRequest = value;
          await this.plugin.saveSettings();
        })
      );

    // =================
    // File Organization
    // =================
    containerEl.createEl("h3", { text: "File Organization" });
    containerEl.createEl("div", {
      text: "Configure where your bookmarks and assets are stored",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Sync folder")
      .setDesc("Folder where bookmarks will be saved")
      .addText((text) => {
        text
          .setPlaceholder("Example: folder1/folder2")
          .setValue(this.plugin.settings.syncFolder)
          .onChange(async (value) => {
            this.plugin.settings.syncFolder = value;
            await this.plugin.saveSettings();
          });

        text.inputEl.addClass("hoarder-medium-input");
        new FolderSuggest(this.app, text.inputEl);
        return text;
      });

    new Setting(containerEl)
      .setName("Attachments folder")
      .setDesc("Folder where bookmark images will be saved")
      .addText((text) => {
        text
          .setPlaceholder("Example: folder1/attachments")
          .setValue(this.plugin.settings.attachmentsFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentsFolder = value;
            await this.plugin.saveSettings();
          });

        text.inputEl.addClass("hoarder-medium-input");
        new FolderSuggest(this.app, text.inputEl);
        return text;
      });

    // =================
    // Sync Behavior
    // =================
    containerEl.createEl("h3", { text: "Sync Behavior" });
    containerEl.createEl("div", {
      text: "Control how synchronization works",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Sync interval")
      .setDesc("How often to sync (in minutes)")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange(async (value) => {
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue > 0) {
              this.plugin.settings.syncIntervalMinutes = numValue;
              await this.plugin.saveSettings();
              this.plugin.startPeriodicSync();
            }
          })
          .inputEl.addClass("hoarder-small-input")
      );

    new Setting(containerEl)
      .setName("Update existing files")
      .setDesc(
        "Whether to update existing bookmark files when remote data changes. When disabled, only new bookmarks will be created."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.updateExistingFiles).onChange(async (value) => {
          this.plugin.settings.updateExistingFiles = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sync notes to Karakeep")
      .setDesc("Whether to sync notes to Karakeep")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncNotesToHoarder).onChange(async (value) => {
          this.plugin.settings.syncNotesToHoarder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sync highlights")
      .setDesc("Whether to sync highlights from Karakeep into bookmark files")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncHighlights).onChange(async (value) => {
          this.plugin.settings.syncHighlights = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Download assets")
      .setDesc(
        "Download images and other assets locally (if disabled, assets will be embedded using their source URLs)"
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.downloadAssets).onChange(async (value) => {
          this.plugin.settings.downloadAssets = value;
          await this.plugin.saveSettings();
        })
      );

    // =================
    // Sync Filtering
    // =================
    containerEl.createEl("h3", { text: "Sync Filtering" });
    containerEl.createEl("div", {
      text: "Control which bookmarks are synchronized",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Exclude archived")
      .setDesc("Exclude archived bookmarks from sync")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.excludeArchived).onChange(async (value) => {
          this.plugin.settings.excludeArchived = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Only favorites")
      .setDesc("Only sync favorited bookmarks")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.onlyFavorites).onChange(async (value) => {
          this.plugin.settings.onlyFavorites = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Only bookmarks with highlights")
      .setDesc(
        "Only sync bookmarks that have highlights (requires 'Sync highlights' to be enabled)"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.onlyBookmarksWithHighlights)
          .onChange(async (value) => {
            this.plugin.settings.onlyBookmarksWithHighlights = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excluded tags")
      .setDesc("Bookmarks with these tags will not be synced (comma-separated), unless favorited")
      .addText((text) =>
        text
          .setPlaceholder("private, secret, draft")
          .setValue(this.plugin.settings.excludedTags.join(", "))
          .onChange(async (value) => {
            // Split by comma, trim whitespace, and filter out empty strings
            this.plugin.settings.excludedTags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          })
          .inputEl.addClass("hoarder-wide-input")
      );

    new Setting(containerEl)
      .setName("Included tags")
      .setDesc("Bookmarks with these tags will be synced (comma-separated)")
      .addText((text) =>
        text
          .setPlaceholder("public, shared")
          .setValue(this.plugin.settings.includedTags.join(", "))
          .onChange(async (value) => {
            // Split by comma, trim whitespace, and filter out empty strings
            this.plugin.settings.includedTags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          })
          .inputEl.addClass("hoarder-wide-input")
      );

    // =================
    // Deletion Handling
    // =================
    containerEl.createEl("h3", { text: "Deletion Handling" });
    containerEl.createEl("div", {
      text: "Configure what happens when bookmarks are deleted in Karakeep",
      cls: "setting-item-description",
    });

    const syncDeletionsToggle = new Setting(containerEl)
      .setName("Sync deletions")
      .setDesc("Automatically handle bookmarks that are deleted in Karakeep")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncDeletions).onChange(async (value) => {
          this.plugin.settings.syncDeletions = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh the display to show/hide conditional settings
        })
      );

    if (this.plugin.settings.syncDeletions) {
      const deletionActionSetting = new Setting(containerEl)
        .setName("Deletion action")
        .setDesc("What to do with local files when bookmarks are deleted in Karakeep")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("delete", "Delete file")
            .addOption("archive", "Move to archive folder")
            .addOption("tag", "Add deletion tag")
            .setValue(this.plugin.settings.deletionAction)
            .onChange(async (value: "delete" | "archive" | "tag") => {
              this.plugin.settings.deletionAction = value;
              await this.plugin.saveSettings();
              this.display(); // Refresh the display to show/hide conditional settings
            })
        );

      if (this.plugin.settings.deletionAction === "archive") {
        new Setting(containerEl)
          .setName("Archive folder")
          .setDesc("Folder to move deleted bookmarks to")
          .addText((text) => {
            text
              .setPlaceholder("Example: Hoarder/deleted")
              .setValue(this.plugin.settings.archiveFolder)
              .onChange(async (value) => {
                this.plugin.settings.archiveFolder = value;
                await this.plugin.saveSettings();
              });

            text.inputEl.addClass("hoarder-medium-input");
            new FolderSuggest(this.app, text.inputEl);
            return text;
          });
      }

      if (this.plugin.settings.deletionAction === "tag") {
        new Setting(containerEl)
          .setName("Deletion tag")
          .setDesc("Tag to add to files when bookmarks are deleted")
          .addText((text) =>
            text
              .setPlaceholder("deleted")
              .setValue(this.plugin.settings.deletionTag)
              .onChange(async (value) => {
                this.plugin.settings.deletionTag = value;
                await this.plugin.saveSettings();
              })
              .inputEl.addClass("hoarder-medium-input")
          );
      }
    }

    // =================
    // Archive Handling
    // =================
    containerEl.createEl("h3", { text: "Archive Handling" });
    containerEl.createEl("div", {
      text: "Configure what happens when bookmarks are archived in Karakeep",
      cls: "setting-item-description",
    });

    const handleArchivedToggle = new Setting(containerEl)
      .setName("Handle archived bookmarks")
      .setDesc("Separately handle bookmarks that are archived (not deleted) in Karakeep")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.handleArchivedBookmarks).onChange(async (value) => {
          this.plugin.settings.handleArchivedBookmarks = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh the display to show/hide conditional settings
        })
      );

    if (this.plugin.settings.handleArchivedBookmarks) {
      const archivedActionSetting = new Setting(containerEl)
        .setName("Archived bookmark action")
        .setDesc("What to do with local files when bookmarks are archived in Karakeep")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("ignore", "Do nothing")
            .addOption("delete", "Delete file")
            .addOption("archive", "Move to archive folder")
            .addOption("tag", "Add archived tag")
            .setValue(this.plugin.settings.archivedBookmarkAction)
            .onChange(async (value: "delete" | "archive" | "tag" | "ignore") => {
              this.plugin.settings.archivedBookmarkAction = value;
              await this.plugin.saveSettings();
              this.display(); // Refresh the display to show/hide conditional settings
            })
        );

      if (this.plugin.settings.archivedBookmarkAction === "archive") {
        new Setting(containerEl)
          .setName("Archived bookmark folder")
          .setDesc("Folder to move archived bookmarks to")
          .addText((text) => {
            text
              .setPlaceholder("Example: Hoarder/archived")
              .setValue(this.plugin.settings.archivedBookmarkFolder)
              .onChange(async (value) => {
                this.plugin.settings.archivedBookmarkFolder = value;
                await this.plugin.saveSettings();
              });

            text.inputEl.addClass("hoarder-medium-input");
            new FolderSuggest(this.app, text.inputEl);
            return text;
          });
      }

      if (this.plugin.settings.archivedBookmarkAction === "tag") {
        new Setting(containerEl)
          .setName("Archived bookmark tag")
          .setDesc("Tag to add to files when bookmarks are archived")
          .addText((text) =>
            text
              .setPlaceholder("archived")
              .setValue(this.plugin.settings.archivedBookmarkTag)
              .onChange(async (value) => {
                this.plugin.settings.archivedBookmarkTag = value;
                await this.plugin.saveSettings();
              })
              .inputEl.addClass("hoarder-medium-input")
          );
      }
    }

    // =================
    // Manual Actions & Status
    // =================
    containerEl.createEl("h3", { text: "Manual Actions & Status" });
    containerEl.createEl("div", {
      text: "Manual sync controls and synchronization status",
      cls: "setting-item-description",
    });

    // Add Sync Now button
    new Setting(containerEl)
      .setName("Manual sync")
      .setDesc("Sync bookmarks now")
      .addButton((button) => {
        this.syncButton = button
          .setButtonText(this.plugin.isSyncing ? "Syncing..." : "Sync Now")
          .setDisabled(this.plugin.isSyncing)
          .onClick(async () => {
            const result = await this.plugin.syncBookmarks();
            new Notice(result.message);
          });

        // Subscribe to sync state changes
        this.plugin.events.on("sync-state-change", this.updateSyncButton);

        return button;
      });

    // Add Last Sync Time
    if (this.plugin.settings.lastSyncTimestamp > 0) {
      containerEl.createEl("div", {
        text: `Last synced: ${new Date(this.plugin.settings.lastSyncTimestamp).toLocaleString()}`,
        cls: "setting-item-description",
      });
    }
  }
}
