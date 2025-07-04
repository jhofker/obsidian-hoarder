import { App } from "obsidian";

import { HoarderApiClient, HoarderBookmark } from "./hoarder-client";
import { HoarderSettings } from "./settings";

function getAssetUrl(
  assetId: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): string {
  if (client) {
    return client.getAssetUrl(assetId);
  }
  // Fallback if client is not initialized
  const baseUrl = settings.apiEndpoint.replace(/\/v1\/?$/, "");
  return `${baseUrl}/assets/${assetId}`;
}

function sanitizeAssetFileName(title: string): string {
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

async function downloadImage(
  app: App,
  url: string,
  assetId: string,
  title: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): Promise<string | null> {
  try {
    // Create attachments folder if it doesn't exist
    if (!(await app.vault.adapter.exists(settings.attachmentsFolder))) {
      await app.vault.createFolder(settings.attachmentsFolder);
    }

    // Get file extension from URL or default to jpg
    const extension = url.split(".").pop()?.toLowerCase() || "jpg";
    const safeExtension = ["jpg", "jpeg", "png", "gif", "webp"].includes(extension)
      ? extension
      : "jpg";

    // Create a safe filename using just the assetId and a short title
    const safeTitle = sanitizeAssetFileName(title);
    const fileName = `${assetId}${safeTitle ? "-" + safeTitle : ""}.${safeExtension}`;
    const filePath = `${settings.attachmentsFolder}/${fileName}`;

    // Check if file already exists with any extension
    const files = await app.vault.adapter.list(settings.attachmentsFolder);
    const existingFile = files.files.find((file) =>
      file.startsWith(`${settings.attachmentsFolder}/${assetId}`)
    );
    if (existingFile) {
      return existingFile;
    }

    // Download the image
    let buffer: ArrayBuffer;

    // Check if this is a Hoarder asset URL by checking if it's from the same domain
    const apiDomain = new URL(settings.apiEndpoint).origin;
    if (url.startsWith(apiDomain) && client) {
      // Use the client's downloadAsset method for Hoarder assets
      buffer = await client.downloadAsset(assetId);
    } else {
      // Use fetch for external URLs
      const headers: Record<string, string> = {};
      if (url.startsWith(apiDomain)) {
        headers["Authorization"] = `Bearer ${settings.apiKey}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      buffer = await response.arrayBuffer();
    }
    await app.vault.adapter.writeBinary(filePath, buffer);

    return filePath;
  } catch (error) {
    console.error("Error downloading image:", url, error);
    return null;
  }
}

function escapeMarkdownPath(path: string): string {
  // If path contains spaces or other special characters, wrap in angle brackets
  if (path.includes(" ") || /[<>[\](){}]/.test(path)) {
    return `<${path}>`;
  }
  return path;
}

export async function processBookmarkAssets(
  app: App,
  bookmark: HoarderBookmark,
  title: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): Promise<string> {
  let content = "";

  // Handle images for asset type bookmarks
  if (bookmark.content.type === "asset" && bookmark.content.assetType === "image") {
    if (bookmark.content.assetId) {
      const assetUrl = getAssetUrl(bookmark.content.assetId, client, settings);
      if (settings.downloadAssets) {
        const imagePath = await downloadImage(
          app,
          assetUrl,
          bookmark.content.assetId,
          title,
          client,
          settings
        );
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
    // For link types, handle all available assets
    const assetIds = [];
    const assetLabels = [];

    // Collect all asset IDs and their labels
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

    // Handle each asset
    for (let i = 0; i < assetIds.length; i++) {
      const assetId = assetIds[i];
      const label = assetLabels[i];
      const assetUrl = getAssetUrl(assetId, client, settings);

      // Handle videos differently - just embed as links, don't download
      if (label === "Video") {
        content += `\n[${title} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
      } else {
        // Handle images normally
        if (settings.downloadAssets) {
          const imagePath = await downloadImage(
            app,
            assetUrl,
            assetId,
            `${title}-${label}`,
            client,
            settings
          );
          if (imagePath) {
            content += `\n![${title} - ${label}](${escapeMarkdownPath(imagePath)})\n`;
          }
        } else {
          content += `\n![${title} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
        }
      }
    }

    // Handle external image URL if no asset IDs but imageUrl exists
    if (assetIds.length === 0 && bookmark.content.imageUrl) {
      content += `\n![${title}](${escapeMarkdownPath(bookmark.content.imageUrl)})\n`;
    }
  }

  // Handle any additional assets from the bookmark.assets array
  if (bookmark.assets && bookmark.assets.length > 0) {
    const processedAssetIds = new Set();

    // Track which assets we've already processed from content fields
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

    // Process any remaining assets
    for (const asset of bookmark.assets) {
      if (!processedAssetIds.has(asset.id)) {
        const assetUrl = getAssetUrl(asset.id, client, settings);
        const label = asset.assetType === "image" ? "Additional Image" : asset.assetType;

        // Handle videos differently - just embed as links, don't download
        if (asset.assetType === "video") {
          content += `\n[${title} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
        } else {
          // Handle images and other assets normally
          if (settings.downloadAssets) {
            const imagePath = await downloadImage(
              app,
              assetUrl,
              asset.id,
              `${title}-${label}`,
              client,
              settings
            );
            if (imagePath) {
              content += `\n![${title} - ${label}](${escapeMarkdownPath(imagePath)})\n`;
            }
          } else {
            content += `\n![${title} - ${label}](${escapeMarkdownPath(assetUrl)})\n`;
          }
        }
      }
    }
  }

  return content;
}
