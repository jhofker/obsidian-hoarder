import { requestUrl } from "obsidian";

// Type definitions for the Hoarder API responses
export interface HoarderTag {
  id: string;
  name: string;
  attachedBy: "ai" | "human";
}

export interface HoarderHighlight {
  id: string;
  bookmarkId: string;
  startOffset: number;
  endOffset: number;
  color: "yellow" | "red" | "green" | "blue";
  text: string;
  note: string;
  userId: string;
  createdAt: string;
}

export interface HoarderBookmarkContent {
  type: "link" | "text" | "asset" | "unknown";
  url?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageAssetId?: string | null;
  screenshotAssetId?: string | null;
  fullPageArchiveAssetId?: string | null;
  videoAssetId?: string | null;
  favicon?: string | null;
  htmlContent?: string | null;
  crawledAt?: string | null;
  text?: string;
  sourceUrl?: string | null;
  assetType?: "image" | "pdf";
  assetId?: string;
  fileName?: string | null;
}

export interface HoarderBookmark {
  id: string;
  createdAt: string;
  modifiedAt: string | null;
  title?: string | null;
  archived: boolean;
  favourited: boolean;
  taggingStatus: "success" | "failure" | "pending" | null;
  note?: string | null;
  summary?: string | null;
  tags: HoarderTag[];
  content: HoarderBookmarkContent;
  assets: Array<{
    id: string;
    assetType: string;
  }>;
}

export interface PaginatedBookmarks {
  bookmarks: HoarderBookmark[];
  nextCursor: string | null;
}

export interface PaginatedHighlights {
  highlights: HoarderHighlight[];
  nextCursor: string | null;
}

export interface BookmarkQueryParams {
  limit?: number;
  cursor?: string;
  archived?: boolean;
  favourited?: boolean;
}

export class HoarderApiClient {
  private baseUrl: string;
  private apiKey: string;
  private useObsidianRequest: boolean;

  constructor(baseUrl: string, apiKey: string, useObsidianRequest: boolean = false) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
    this.useObsidianRequest = useObsidianRequest;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: any,
    params?: Record<string, any>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    try {
      if (this.useObsidianRequest) {
        // Use Obsidian's requestUrl to avoid CORS issues
        const response = await requestUrl({
          url: url.toString(),
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.text || "Unknown error"}`);
        }

        return response.json;
      } else {
        // Use standard fetch
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || "Unknown error"}`);
        }

        return await response.json();
      }
    } catch (error) {
      console.error("API request failed:", url.toString(), error);
      throw error;
    }
  }

  async getBookmarks(params?: BookmarkQueryParams): Promise<PaginatedBookmarks> {
    return this.makeRequest<PaginatedBookmarks>("/bookmarks", "GET", undefined, params);
  }

  async updateBookmark(
    bookmarkId: string,
    data: { note?: string; [key: string]: any }
  ): Promise<HoarderBookmark> {
    return this.makeRequest<HoarderBookmark>(`/bookmarks/${bookmarkId}`, "PATCH", data);
  }

  async getBookmarkHighlights(bookmarkId: string): Promise<{ highlights: HoarderHighlight[] }> {
    return this.makeRequest<{ highlights: HoarderHighlight[] }>(
      `/bookmarks/${bookmarkId}/highlights`,
      "GET"
    );
  }

  async getHighlights(params?: { limit?: number; cursor?: string }): Promise<PaginatedHighlights> {
    return this.makeRequest<PaginatedHighlights>("/highlights", "GET", undefined, params);
  }

  async getAllHighlights(): Promise<HoarderHighlight[]> {
    const allHighlights: HoarderHighlight[] = [];
    let cursor: string | undefined;

    do {
      const data = await this.getHighlights({
        limit: 100,
        cursor: cursor || undefined,
      });

      allHighlights.push(...(data.highlights || []));
      cursor = data.nextCursor || undefined;
    } while (cursor);

    return allHighlights;
  }

  async downloadAsset(assetId: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/assets/${assetId}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    try {
      if (this.useObsidianRequest) {
        const response = await requestUrl({
          url,
          method: "GET",
          headers,
        });

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.text || "Unknown error"}`);
        }

        return response.arrayBuffer;
      } else {
        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || "Unknown error"}`);
        }

        return await response.arrayBuffer();
      }
    } catch (error) {
      console.error("Asset download failed:", url, error);
      throw error;
    }
  }

  getAssetUrl(assetId: string): string {
    const baseUrl = this.baseUrl.replace(/\/api\/v1\/?$/, "");
    return `${baseUrl}/assets/${assetId}`;
  }
}
