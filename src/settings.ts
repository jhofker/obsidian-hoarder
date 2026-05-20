import { EditorView } from "@codemirror/view";
import { AbstractInputSuggest, App, ButtonComponent, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";

import HoarderPlugin from "./main";
import { createTemplateEditor, setEditorValue } from "./template-editor";
import { DEFAULT_TEMPLATE, validateTemplate } from "./template-renderer";

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
  syncHighlights: boolean;
  onlyBookmarksWithHighlights: boolean;
  excludedTags: string[];
  includedTags: string[];
  downloadAssets: boolean;
  downloadBannerImages: boolean;
  downloadScreenshots: boolean;
  downloadPdfArchives: boolean;
  downloadFullPageArchives: boolean;
  syncDeletions: boolean;
  deletionAction: "delete" | "archive" | "tag";
  deletionTag: string;
  archiveFolder: string;
  handleArchivedBookmarks: boolean;
  archivedBookmarkAction: "delete" | "archive" | "tag" | "ignore";
  archivedBookmarkTag: string;
  archivedBookmarkFolder: string;
  useObsidianRequest: boolean;
  useCustomTemplate: boolean;
  customTemplate: string;
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
  syncHighlights: true,
  onlyBookmarksWithHighlights: false,
  excludedTags: [],
  includedTags: [],
  downloadAssets: true,
  downloadBannerImages: true,
  downloadScreenshots: true,
  downloadPdfArchives: true,
  downloadFullPageArchives: false,
  syncDeletions: false,
  deletionAction: "delete",
  deletionTag: "deleted",
  archiveFolder: "Hoarder/deleted",
  handleArchivedBookmarks: false,
  archivedBookmarkAction: "delete",
  archivedBookmarkTag: "archived",
  archivedBookmarkFolder: "Hoarder/archived",
  useObsidianRequest: false,
  useCustomTemplate: false,
  customTemplate: "",
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
  syncButton: ButtonComponent | null = null;
  private templateEditor: EditorView | null = null;

  constructor(app: App, plugin: HoarderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  onunload() {
    this.plugin.events.off("sync-state-change", this.updateSyncButton);
    if (this.templateEditor) {
      this.templateEditor.destroy();
      this.templateEditor = null;
    }
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
    containerEl.addClass("hoarder-settings");

    // =================
    // API Configuration
    // =================
    new Setting(containerEl).setName("API Configuration").setHeading();
    containerEl.createDiv({
      text: "Connection settings for your Karakeep instance",
      cls: "hoarder-section-description",
    });

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
    new Setting(containerEl).setName("File Organization").setHeading();
    containerEl.createDiv({
      text: "Configure where your bookmarks and assets are stored",
      cls: "hoarder-section-description",
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
    new Setting(containerEl).setName("Sync Behavior").setHeading();
    containerEl.createDiv({
      text: "Control how synchronization works",
      cls: "hoarder-section-description",
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
          this.display();
        })
      );

    if (this.plugin.settings.downloadAssets) {
      new Setting(containerEl)
        .setName("Download banner images")
        .setDesc("Download banner/preview images for bookmarks")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.downloadBannerImages).onChange(async (value) => {
            this.plugin.settings.downloadBannerImages = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName("Download screenshots")
        .setDesc("Download page screenshots")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.downloadScreenshots).onChange(async (value) => {
            this.plugin.settings.downloadScreenshots = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName("Download PDF archives")
        .setDesc("Download PDF archives of bookmarked pages")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.downloadPdfArchives).onChange(async (value) => {
            this.plugin.settings.downloadPdfArchives = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName("Download full page archives")
        .setDesc("Download full page archives (MHTML/HTML) — can be large")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.downloadFullPageArchives).onChange(async (value) => {
            this.plugin.settings.downloadFullPageArchives = value;
            await this.plugin.saveSettings();
          })
        );
    }

    // =================
    // Note Template
    // =================
    new Setting(containerEl).setName("Note Template").setHeading();
    containerEl.createDiv({
      text: "Customize the format of synced bookmark notes using Eta template syntax",
      cls: "hoarder-section-description",
    });

    new Setting(containerEl)
      .setName("Use custom template")
      .setDesc("Enable a custom template for bookmark note generation")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useCustomTemplate).onChange(async (value) => {
          this.plugin.settings.useCustomTemplate = value;
          if (value && !this.plugin.settings.customTemplate) {
            this.plugin.settings.customTemplate = DEFAULT_TEMPLATE;
          }
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.useCustomTemplate) {
      if (this.plugin.settings.syncNotesToHoarder) {
        containerEl.createDiv({
          text: "Warning: Your template must include a ## Notes section and original_note frontmatter field for bi-directional sync to work.",
          cls: "hoarder-section-description hoarder-text-error",
        });
      }

      containerEl.createDiv({
        text: "Eta template for bookmark notes. Use <%= it.variable %> for output, <% if (condition) { %> for logic.",
        cls: "hoarder-section-description",
      });

      const details = containerEl.createEl("details", { cls: "hoarder-template-reference" });
      details.createEl("summary", { text: "Available template variables" });
      const refContent = details.createDiv({ cls: "hoarder-template-ref-content" });

      const addVarLine = (parent: HTMLElement, codes: string[], suffix?: string) => {
        const div = parent.createDiv();
        for (const c of codes) {
          div.createEl("code", { text: c });
          div.appendText(" ");
        }
        if (suffix) div.appendText(suffix);
      };

      refContent.createEl("strong", { text: "Bookmark fields" });
      addVarLine(refContent, ["it.bookmark_id", "it.title", "it.url", "it.description"]);
      addVarLine(refContent, ["it.note"], "(raw text)");
      addVarLine(refContent, ["it.noteBlock"], "(editable, wrapped in comment markers)");
      addVarLine(refContent, ["it.summary", "it.created_at", "it.modified_at"]);
      addVarLine(refContent, ["it.content_type"], '("link", "text", "asset")');
      addVarLine(refContent, ["it.content_html", "it.author", "it.archived", "it.favourited"]);
      addVarLine(refContent, ["it.tags"], "(string array)");
      addVarLine(refContent, ["it.hoarder_url", "it.visit_link"]);

      refContent.createEl("br");
      refContent.createEl("strong", { text: "Pre-escaped for YAML frontmatter" });
      addVarLine(refContent, ["it.yaml.url", "it.yaml.title", "it.yaml.note", "it.yaml.summary"]);

      refContent.createEl("br");
      refContent.createEl("strong", { text: "Assets" });
      addVarLine(refContent, ["it.assets.content"], "(rendered embeds)");
      addVarLine(refContent, ["it.assets.banner", "it.assets.screenshot", "it.assets.image"]);
      addVarLine(refContent, ["it.assets.full_page_archive", "it.assets.pdf_archive", "it.assets.video"]);
      addVarLine(refContent, ["it.assets.additional"], "(string array)");

      refContent.createEl("br");
      const highlightsLine = refContent.createDiv();
      highlightsLine.createEl("strong", { text: "Highlights" });
      highlightsLine.appendText(" (array, each has:)");
      addVarLine(refContent, [".id", ".color", ".text", ".note", ".date", ".created_at"]);
      addVarLine(refContent, ["it.sync_highlights"], "(boolean)");

      refContent.createEl("br");
      refContent.createEl("strong", { text: "Helper functions" });
      addVarLine(refContent, ["it.escapeYaml(str)", "it.escapeMarkdownPath(str)", "it.formatDate(iso)"]);

      const editorContainer = containerEl.createDiv({ cls: "hoarder-template-editor" });

      // Clean up previous editor if re-rendering
      if (this.templateEditor) {
        this.templateEditor.destroy();
        this.templateEditor = null;
      }

      let templateSaveTimeout: number | null = null;
      const warningContainer = containerEl.createDiv({ cls: "hoarder-template-warnings" });

      this.templateEditor = createTemplateEditor(
        editorContainer,
        this.plugin.settings.customTemplate || DEFAULT_TEMPLATE,
        (value) => {
          if (templateSaveTimeout) window.clearTimeout(templateSaveTimeout);
          templateSaveTimeout = window.setTimeout(async () => {
            const result = validateTemplate(value);
            warningContainer.empty();
            if (result.valid) {
              this.plugin.settings.customTemplate = value;
              await this.plugin.saveSettings();
              if (result.warnings) {
                for (const warning of result.warnings) {
                  warningContainer.createDiv({
                    text: `Warning: ${warning}`,
                    cls: "hoarder-template-warning",
                  });
                }
              }
            } else {
              warningContainer.createDiv({
                text: `Error: ${result.error}`,
                cls: "hoarder-template-error",
              });
            }
          }, 500);
        }
      );

      new Setting(containerEl)
        .setName("Reset template")
        .setDesc("Reset the template to its default")
        .addButton((button) =>
          button.setButtonText("Reset to Default").onClick(async () => {
            this.plugin.settings.customTemplate = DEFAULT_TEMPLATE;
            await this.plugin.saveSettings();
            if (this.templateEditor) {
              setEditorValue(this.templateEditor, DEFAULT_TEMPLATE);
            }
          })
        );
    }

    // =================
    // Sync Filtering
    // =================
    new Setting(containerEl).setName("Sync Filtering").setHeading();
    containerEl.createDiv({
      text: "Control which bookmarks are synchronized",
      cls: "hoarder-section-description",
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
    new Setting(containerEl).setName("Deletion Handling").setHeading();
    containerEl.createDiv({
      text: "Configure what happens when bookmarks are deleted in Karakeep",
      cls: "hoarder-section-description",
    });

    new Setting(containerEl)
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
      new Setting(containerEl)
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
    new Setting(containerEl).setName("Archive Handling").setHeading();
    containerEl.createDiv({
      text: "Configure what happens when bookmarks are archived in Karakeep",
      cls: "hoarder-section-description",
    });

    new Setting(containerEl)
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
      new Setting(containerEl)
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
    new Setting(containerEl).setName("Manual Actions & Status").setHeading();
    containerEl.createDiv({
      text: "Manual sync controls and synchronization status",
      cls: "hoarder-section-description",
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
      containerEl.createDiv({
        text: `Last synced: ${new Date(this.plugin.settings.lastSyncTimestamp).toLocaleString()}`,
        cls: "hoarder-section-description",
      });
    }
  }
}
