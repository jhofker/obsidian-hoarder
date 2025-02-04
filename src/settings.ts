import {
  AbstractInputSuggest,
  App,
  Notice,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFolder,
} from "obsidian";

import HoarderPlugin from "./main";

export interface HoarderSettings {
  apiKey: string;
  apiEndpoint: string;
  syncFolder: string;
  attachmentsFolder: string;
  syncIntervalMinutes: number;
  lastSyncTimestamp: number;
  updateExistingFiles: boolean;
  excludeArchived: boolean;
  onlyFavorites: boolean;
  syncNotesToHoarder: boolean;
  excludedTags: string[];
  downloadAssets: boolean;
}

export const DEFAULT_SETTINGS: HoarderSettings = {
  apiKey: "",
  apiEndpoint: "https://api.hoarder.app/api/v1",
  syncFolder: "Hoarder",
  attachmentsFolder: "Hoarder/attachments",
  syncIntervalMinutes: 60,
  lastSyncTimestamp: 0,
  updateExistingFiles: false,
  excludeArchived: true,
  onlyFavorites: false,
  syncNotesToHoarder: true,
  excludedTags: [],
  downloadAssets: true,
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

    new Setting(containerEl)
      .setName("Api key")
      .setDesc("Your Hoarder API key")
      .addText((text) =>
        text
          .setPlaceholder("Enter your API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
          .inputEl.addClass("hoarder-wide-input")
      );

    new Setting(containerEl)
      .setName("Api endpoint")
      .setDesc("Hoarder API endpoint URL (default: https://api.hoarder.app/api/v1)")
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
      .setDesc("Whether to update or skip existing bookmark files")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.updateExistingFiles).onChange(async (value) => {
          this.plugin.settings.updateExistingFiles = value;
          await this.plugin.saveSettings();
        })
      );

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
      .setName("Sync notes to Hoarder")
      .setDesc("Whether to sync notes to Hoarder")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncNotesToHoarder).onChange(async (value) => {
          this.plugin.settings.syncNotesToHoarder = value;
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
