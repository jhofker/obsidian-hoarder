import { App } from "obsidian";

import { escapeAltText, escapeMarkdownPath } from "./formatting-utils";
import { HoarderApiClient, HoarderBookmark } from "./hoarder-client";
import { HoarderSettings } from "./settings";

export type AssetFrontmatter = {
  image?: string; // wikilink [[path]]
  banner?: string; // wikilink [[path]]
  screenshot?: string; // wikilink [[path]]
  full_page_archive?: string; // wikilink [[path]]
  pdf_archive?: string; // wikilink [[path]]
  video?: string; // wikilink [[path]] (only if downloaded, typically omitted)
  additional?: string[]; // array of wikilinks
};

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/html": "html",
  "multipart/related": "mhtml",
  "application/x-mimearchive": "mhtml",
  "message/rfc822": "mhtml",
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);

const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, "pdf", "html", "mhtml"]);

/**
 * Determines the file extension for a downloaded asset.
 *
 * Priority: Content-Type header > asset label mapping > URL extension > "jpg" default
 */
export function resolveAssetExtension(
  contentType: string | null,
  assetLabel: string,
  url: string
): string {
  if (contentType) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    const ext = CONTENT_TYPE_TO_EXT[mimeType];
    if (ext) return ext;
  }

  const labelLower = assetLabel.toLowerCase();
  if (labelLower.includes("pdf")) return "pdf";
  if (labelLower.includes("full page archive")) return "mhtml";
  if (labelLower.includes("screenshot")) return "png";

  const urlExt = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (urlExt && SUPPORTED_EXTENSIONS.has(urlExt)) return urlExt;

  return "jpg";
}

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Returns true if the existing file can be reused (i.e., its extension is already
 * correct for the expected asset type). Images are interchangeable (a .png banner
 * doesn't need re-download just because we'd default to .jpg), but non-image types
 * must match exactly.
 */
function canReuseExistingFile(existingFile: string, assetLabel: string, url: string): boolean {
  const existingExt = existingFile.split(".").pop()?.toLowerCase() || "";
  const expectedFromLabel = resolveAssetExtension(null, assetLabel, url);
  if (isImageExtension(existingExt) && isImageExtension(expectedFromLabel)) {
    return true;
  }
  return existingExt === expectedFromLabel;
}

function getAssetUrl(
  assetId: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): string {
  if (client) {
    return client.getAssetUrl(assetId);
  }
  const baseUrl = settings.apiEndpoint.replace(/\/v1\/?$/, "");
  return `${baseUrl}/assets/${assetId}`;
}

export function sanitizeAssetFileName(title: string): string {
  let sanitizedTitle = title
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const maxTitleLength = 30;

  if (sanitizedTitle.length > maxTitleLength) {
    const truncated = sanitizedTitle.substring(0, maxTitleLength);
    const lastDash = truncated.lastIndexOf("-");
    if (lastDash > maxTitleLength / 2) {
      sanitizedTitle = truncated.substring(0, lastDash);
    } else {
      sanitizedTitle = truncated;
    }
  }

  return sanitizedTitle;
}

async function downloadAssetFile(
  app: App,
  url: string,
  assetId: string,
  title: string,
  assetLabel: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings,
  existingFiles?: string[]
): Promise<string | null> {
  try {
    if (!(await app.vault.adapter.exists(settings.attachmentsFolder))) {
      await app.vault.createFolder(settings.attachmentsFolder);
    }

    // Find existing file for this asset ID (from pre-fetched listing or fresh query)
    let fileList = existingFiles;
    if (!fileList) {
      const listing = await app.vault.adapter.list(settings.attachmentsFolder);
      fileList = listing.files;
    }
    const existingFile = fileList.find((f: string) =>
      f.startsWith(`${settings.attachmentsFolder}/${assetId}`)
    );

    // If existing file has a correct extension, skip the download entirely
    if (existingFile && canReuseExistingFile(existingFile, assetLabel, url)) {
      return existingFile;
    }

    // Download the asset
    let buffer: ArrayBuffer;
    let contentType: string | null = null;

    const apiDomain = new URL(settings.apiEndpoint).origin;
    if (url.startsWith(apiDomain) && client) {
      const result = await client.downloadAsset(assetId);
      buffer = result.buffer;
      contentType = result.contentType;
    } else {
      const headers: Record<string, string> = {};
      if (url.startsWith(apiDomain)) {
        headers["Authorization"] = `Bearer ${settings.apiKey}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      buffer = await response.arrayBuffer();
      contentType = response.headers.get("content-type");
    }

    const extension = resolveAssetExtension(contentType, assetLabel, url);
    const safeTitle = sanitizeAssetFileName(title);
    const fileName = `${assetId}${safeTitle ? "-" + safeTitle : ""}.${extension}`;
    const filePath = `${settings.attachmentsFolder}/${fileName}`;

    await app.vault.adapter.writeBinary(filePath, buffer);

    // Remove the old file if it had a wrong extension
    if (existingFile && existingFile !== filePath) {
      try {
        await app.vault.adapter.remove(existingFile);
        console.log(`[Hoarder] Replaced misnamed asset: ${existingFile} -> ${filePath}`);
      } catch (err) {
        console.error(`[Hoarder] Failed to remove old asset file: ${existingFile}`, err);
      }
    }

    return filePath;
  } catch (error) {
    console.error("Error downloading asset:", url, error);
    return null;
  }
}

function formatAssetEmbed(path: string, altText: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const safeAlt = escapeAltText(altText);
  if (ext === "pdf") {
    return `\n![[${path}]]\n`;
  }
  if (ext === "html" || ext === "mhtml") {
    return `\n[${safeAlt}](${escapeMarkdownPath(path)})\n`;
  }
  return `\n![${safeAlt}](${escapeMarkdownPath(path)})\n`;
}

const toWikilink = (path: string): string => `"[[${path}]]"`;

function shouldDownloadAssetType(label: string, settings: HoarderSettings): boolean {
  if (!settings.downloadAssets) return false;

  const labelLower = label.toLowerCase();
  if (labelLower.includes("banner")) return settings.downloadBannerImages;
  if (labelLower.includes("screenshot")) return settings.downloadScreenshots;
  if (labelLower.includes("full page archive")) return settings.downloadFullPageArchives;
  if (labelLower.includes("pdf")) return settings.downloadPdfArchives;
  return true;
}

export async function processBookmarkAssets(
  app: App,
  bookmark: HoarderBookmark,
  title: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): Promise<{ content: string; frontmatter: AssetFrontmatter | null }> {
  let content = "";
  const fm: AssetFrontmatter = {};

  // Pre-fetch attachment file listing once for all asset downloads in this bookmark
  let existingFiles: string[] | undefined;
  if (settings.downloadAssets) {
    try {
      if (await app.vault.adapter.exists(settings.attachmentsFolder)) {
        const listing = await app.vault.adapter.list(settings.attachmentsFolder);
        existingFiles = listing.files;
      }
    } catch {
      // Will fall back to per-download listing
    }
  }

  if (bookmark.content.type === "asset" && bookmark.content.assetType === "image") {
    if (bookmark.content.assetId) {
      const assetUrl = getAssetUrl(bookmark.content.assetId, client, settings);
      let imagePath: string | null = null;
      if (shouldDownloadAssetType("Banner Image", settings)) {
        imagePath = await downloadAssetFile(
          app,
          assetUrl,
          bookmark.content.assetId,
          title,
          "Banner Image",
          client,
          settings,
          existingFiles
        );
      }
      if (imagePath) {
        content += formatAssetEmbed(imagePath, title);
        fm.image = toWikilink(imagePath);
      } else {
        content += `\n![${escapeAltText(title)}](${escapeMarkdownPath(assetUrl)})\n`;
      }
    } else if (bookmark.content.sourceUrl) {
      content += `\n![${escapeAltText(title)}](${escapeMarkdownPath(bookmark.content.sourceUrl)})\n`;
    }
  } else if (bookmark.content.type === "asset" && bookmark.content.assetType === "pdf") {
    if (bookmark.content.assetId) {
      const assetUrl = getAssetUrl(bookmark.content.assetId, client, settings);
      let pdfPath: string | null = null;
      if (shouldDownloadAssetType("PDF Archive", settings)) {
        pdfPath = await downloadAssetFile(
          app,
          assetUrl,
          bookmark.content.assetId,
          title,
          "PDF Archive",
          client,
          settings,
          existingFiles
        );
      }
      if (pdfPath) {
        content += formatAssetEmbed(pdfPath, title);
        fm.pdf_archive = toWikilink(pdfPath);
      } else {
        content += `\n[${escapeAltText(title)} - PDF](${escapeMarkdownPath(assetUrl)})\n`;
      }
    }
  } else if (bookmark.content.type === "link") {
    const assetIds: string[] = [];
    const assetLabels: string[] = [];

    if (bookmark.content.imageAssetId) {
      assetIds.push(bookmark.content.imageAssetId);
      assetLabels.push("Banner Image");
    }
    if (bookmark.content.screenshotAssetId) {
      assetIds.push(bookmark.content.screenshotAssetId);
      assetLabels.push("Screenshot");
    }
    if (bookmark.content.fullPageArchiveAssetId) {
      assetIds.push(bookmark.content.fullPageArchiveAssetId);
      assetLabels.push("Full Page Archive");
    }
    if (bookmark.content.videoAssetId) {
      assetIds.push(bookmark.content.videoAssetId);
      assetLabels.push("Video");
    }

    for (let i = 0; i < assetIds.length; i++) {
      const assetId = assetIds[i];
      const label = assetLabels[i];
      const assetUrl = getAssetUrl(assetId, client, settings);

      if (label === "Video") {
        content += `\n[${escapeAltText(title)} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
      } else {
        let assetPath: string | null = null;
        if (shouldDownloadAssetType(label, settings)) {
          assetPath = await downloadAssetFile(
            app,
            assetUrl,
            assetId,
            `${title}-${label}`,
            label,
            client,
            settings,
            existingFiles
          );
        }
        if (assetPath) {
          content += formatAssetEmbed(assetPath, `${title} - ${label}`);
          if (label === "Banner Image") {
            fm.banner = toWikilink(assetPath);
          } else if (label === "Screenshot") {
            fm.screenshot = toWikilink(assetPath);
          } else if (label === "Full Page Archive") {
            fm.full_page_archive = toWikilink(assetPath);
          }
        } else {
          content += `\n![${escapeAltText(title)} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
        }
      }
    }

    if (assetIds.length === 0 && bookmark.content.imageUrl) {
      content += `\n![${escapeAltText(title)}](${escapeMarkdownPath(bookmark.content.imageUrl)})\n`;
    }
  }

  if (bookmark.assets && bookmark.assets.length > 0) {
    const processedAssetIds = new Set<string>();

    if (bookmark.content.type === "asset" && bookmark.content.assetId) {
      processedAssetIds.add(bookmark.content.assetId);
    }
    if (bookmark.content.type === "link") {
      if (bookmark.content.imageAssetId) processedAssetIds.add(bookmark.content.imageAssetId);
      if (bookmark.content.screenshotAssetId)
        processedAssetIds.add(bookmark.content.screenshotAssetId);
      if (bookmark.content.fullPageArchiveAssetId)
        processedAssetIds.add(bookmark.content.fullPageArchiveAssetId);
      if (bookmark.content.videoAssetId) processedAssetIds.add(bookmark.content.videoAssetId);
    }

    for (const asset of bookmark.assets) {
      if (!processedAssetIds.has(asset.id)) {
        if (asset.assetType === "linkHtmlContent") {
          continue;
        }

        const assetUrl = getAssetUrl(asset.id, client, settings);
        const label =
          asset.assetType === "image"
            ? "Additional Image"
            : asset.assetType === "pdf"
              ? "PDF Archive"
              : asset.assetType;

        if (asset.assetType === "video") {
          content += `\n[${escapeAltText(title)} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
        } else {
          let assetPath: string | null = null;
          if (shouldDownloadAssetType(label, settings)) {
            assetPath = await downloadAssetFile(
              app,
              assetUrl,
              asset.id,
              `${title}-${label}`,
              label,
              client,
              settings,
              existingFiles
            );
          }
          if (assetPath) {
            content += formatAssetEmbed(assetPath, `${title} - ${label}`);
            if (asset.assetType === "pdf") {
              fm.pdf_archive = toWikilink(assetPath);
            } else {
              fm.additional = fm.additional || [];
              fm.additional.push(toWikilink(assetPath));
            }
          } else {
            content += `\n![${escapeAltText(title)} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
          }
        }
      }
    }
  }

  return { content, frontmatter: Object.keys(fm).length > 0 ? fm : null };
}
