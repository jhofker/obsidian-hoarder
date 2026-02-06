/**
 * asset-handler.ts
 *
 * Downloads bookmark assets (screenshots, banner images, etc.) from Karakeep
 * and saves them locally in the vault so they render in Obsidian.
 *
 * Assets are fetched from Karakeep's internal asset route:
 *   GET {serverBase}/api/assets/{assetId}
 *
 * This uses Obsidian's requestUrl which bypasses CORS restrictions and
 * authenticates via Bearer token. Previously, the plugin referenced remote
 * asset URLs that required session cookie auth, resulting in broken images.
 */

import { App, TFile, TFolder, normalizePath, requestUrl } from "obsidian";
import { HoarderApiClient, HoarderBookmark } from "./hoarder-client";
import { HoarderSettings } from "./settings";

interface AssetFrontmatter {
  image?: string;
  banner?: string;
  screenshot?: string;
  full_page_archive?: string;
  video?: string;
  additional?: string[];
}

interface AssetResult {
  /** Markdown body content to append (image embeds, etc.) */
  content: string;
  /** Frontmatter entries for assets */
  frontmatter: AssetFrontmatter | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a folder and all parent folders if they don't exist. */
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (app.vault.getAbstractFileByPath(normalized) instanceof TFolder) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

/** Detect file type from the first bytes of a binary buffer. */
function detectExtension(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  if (b.length < 4) return ".bin";

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return ".gif";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return ".pdf";
  if (b[0] === 0x42 && b[1] === 0x4d) return ".bmp";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return ".webp";
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return ".avif";

  return ".bin";
}

/** Guess a file extension from the Karakeep asset type string. */
function extensionFromAssetType(assetType: string): string {
  const t = assetType.toLowerCase();
  if (t.includes("screenshot")) return ".png";
  if (t.includes("banner") || t.includes("image")) return ".jpg";
  if (t.includes("fullpage") || t.includes("archive")) return ".html";
  if (t.includes("video")) return ".mp4";
  if (t.includes("pdf") || t === "pdf") return ".pdf";
  return ".bin";
}

/**
 * Extract the server base URL from the configured API endpoint.
 * "https://example.com/api/v1" → "https://example.com"
 */
function getServerBase(apiEndpoint: string): string {
  return apiEndpoint.replace(/\/api\/v\d+\/?$/, "");
}

/**
 * Download a single asset from Karakeep and save it to the vault.
 *
 * The download URL is {serverBase}/api/assets/{assetId} — this is Karakeep's
 * internal Next.js asset route. Note: the REST API path /api/v1/assets/ is
 * for upload/attach operations only and does not serve binary downloads.
 *
 * Uses Obsidian's requestUrl to bypass CORS (it goes through Electron's
 * net module rather than the browser's fetch).
 *
 * @returns The vault-relative path to the saved file, or null on failure.
 */
async function downloadAsset(
  app: App,
  settings: HoarderSettings,
  assetId: string,
  assetTypeHint: string,
  nameHint: string
): Promise<string | null> {
  if (!assetId) return null;

  const attachFolder = normalizePath(
    settings.attachmentsFolder || `${settings.syncFolder}/attachments`
  );

  // Skip if already downloaded
  try {
    await ensureFolderExists(app, attachFolder);
    const folderNode = app.vault.getAbstractFileByPath(attachFolder);
    if (folderNode instanceof TFolder) {
      for (const child of folderNode.children) {
        if (child instanceof TFile && child.name.includes(assetId)) {
          return child.path;
        }
      }
    }
  } catch {
    // Folder doesn't exist yet — will be created below
  }

  const assetUrl = `${getServerBase(settings.apiEndpoint)}/api/assets/${assetId}`;

  try {
    const response = await requestUrl({
      url: assetUrl,
      method: "GET",
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });

    if (response.status !== 200) {
      console.error(`[Hoarder Sync] Asset ${assetId}: HTTP ${response.status}`);
      return null;
    }

    const buffer = response.arrayBuffer;
    if (!buffer || buffer.byteLength === 0) {
      console.error(`[Hoarder Sync] Asset ${assetId}: empty response`);
      return null;
    }

    let ext = detectExtension(buffer);
    if (ext === ".bin") {
      ext = extensionFromAssetType(assetTypeHint);
    }

    await ensureFolderExists(app, attachFolder);

    const filePath = normalizePath(`${attachFolder}/${nameHint}-${assetId}${ext}`);
    if (app.vault.getAbstractFileByPath(filePath) instanceof TFile) {
      return filePath;
    }

    await app.vault.createBinary(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error(`[Hoarder Sync] Failed to download asset ${assetId}:`, err);
    return null;
  }
}

/** Format a vault path as a YAML-safe wikilink value. */
function wikilink(filePath: string): string {
  const fileName = filePath.split("/").pop() || filePath;
  return `"[[${fileName}]]"`;
}

/** Extract the bare filename from a wikilink value. */
function wikilinkToFilename(wl: string): string {
  return wl.replace(/^"\[\[/, "").replace(/\]\]"$/, "");
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Process all assets for a bookmark: download them locally and return
 * markdown content (image embeds) and frontmatter entries (wikilinks).
 */
export async function processBookmarkAssets(
  app: App,
  bookmark: HoarderBookmark,
  title: string,
  client: HoarderApiClient | null,
  settings: HoarderSettings
): Promise<AssetResult> {
  let content = "";
  const frontmatter: AssetFrontmatter = {};
  const additional: string[] = [];

  const bContent = bookmark?.content;
  if (!bContent) {
    return { content, frontmatter: null };
  }

  // ── ASSET-type bookmarks (the bookmark IS an image/pdf) ─────────────────

  if (bContent.type === "asset" && bContent.assetId) {
    const hint = bContent.fileName
    ? bContent.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")
    : "asset";

    const localPath = await downloadAsset(
      app, settings, bContent.assetId, bContent.assetType || "image", hint
    );
    if (localPath) {
      frontmatter.image = wikilink(localPath);
      content += `\n![[${localPath.split("/").pop()}]]\n`;
    }
  }

  // ── Process the bookmark's `assets` array ───────────────────────────────
  //
  // Each entry: { id: string, assetType: string }
  // assetType values: "screenshot", "bannerImage", "fullPageArchive",
  //   "bookmarkAsset", "assetScreenshot", "videoAsset", etc.

  for (const asset of bookmark.assets ?? []) {
    if (!asset.id) continue;

    const assetType = (asset.assetType ?? "").toLowerCase();

    let hint = "attachment";
    if (assetType.includes("screenshot")) hint = "screenshot";
    else if (assetType.includes("banner") || assetType.includes("image")) hint = "banner";
    else if (assetType.includes("fullpage") || assetType.includes("archive")) hint = "archive";
    else if (assetType.includes("video")) hint = "video";
    else if (assetType.includes("bookmark") || assetType.includes("asset")) hint = "asset";

    const localPath = await downloadAsset(app, settings, asset.id, assetType, hint);
    if (!localPath) continue;

    const link = wikilink(localPath);

    if (assetType === "screenshot") {
      frontmatter.screenshot ??= link;
      if (frontmatter.screenshot !== link) additional.push(link);
    } else if (assetType === "bannerimage" || assetType === "banner_image") {
      frontmatter.banner ??= link;
      frontmatter.image ??= link;
      if (frontmatter.banner !== link) additional.push(link);
    } else if (assetType.includes("fullpage") || assetType.includes("archive")) {
      frontmatter.full_page_archive ??= link;
      if (frontmatter.full_page_archive !== link) additional.push(link);
    } else if (assetType.includes("video")) {
      frontmatter.video ??= link;
      if (frontmatter.video !== link) additional.push(link);
    } else {
      additional.push(link);
    }
  }

  // ── Fallback: content-level asset IDs ───────────────────────────────────
  // Older Karakeep versions store asset IDs directly on the content object
  // in addition to the assets array. Only fetch if not already covered.

  if (bContent.type === "link") {
    const assetIds = new Set((bookmark.assets ?? []).map((a) => a.id));

    if (!frontmatter.screenshot && bContent.screenshotAssetId && !assetIds.has(bContent.screenshotAssetId)) {
      const localPath = await downloadAsset(app, settings, bContent.screenshotAssetId, "screenshot", "screenshot");
      if (localPath) frontmatter.screenshot = wikilink(localPath);
    }

    if (!frontmatter.banner && !frontmatter.image && bContent.imageAssetId && !assetIds.has(bContent.imageAssetId)) {
      const localPath = await downloadAsset(app, settings, bContent.imageAssetId, "bannerimage", "banner");
      if (localPath) {
        frontmatter.banner = wikilink(localPath);
        frontmatter.image = wikilink(localPath);
      }
    }

    // External imageUrl fallback — only if no Karakeep-hosted image was found
    if (!frontmatter.image && !frontmatter.banner && bContent.imageUrl) {
      const imgUrl = bContent.imageUrl;
      if (!imgUrl.includes("/api/assets/") && !imgUrl.includes("/_next/image")) {
        frontmatter.image = `"${imgUrl}"`;
      }
    }
  }

  // ── Markdown body: embed the most relevant image ────────────────────────

  if (bContent.type === "link") {
    if (frontmatter.banner) {
      content += `\n![[${wikilinkToFilename(frontmatter.banner)}]]\n`;
    } else if (frontmatter.screenshot) {
      content += `\n![[${wikilinkToFilename(frontmatter.screenshot)}]]\n`;
    }
  }

  if (additional.length > 0) {
    frontmatter.additional = additional;
  }

  const hasFrontmatter =
  frontmatter.image || frontmatter.banner || frontmatter.screenshot ||
  frontmatter.full_page_archive || frontmatter.video ||
  (frontmatter.additional && frontmatter.additional.length > 0);

  return {
    content,
    frontmatter: hasFrontmatter ? frontmatter : null,
  };
}
