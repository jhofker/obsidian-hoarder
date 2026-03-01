global.fetch = jest.fn();

import { HoarderApiClient, HoarderHighlight } from "./hoarder-client";

const mockFetch = global.fetch as jest.Mock;

describe("HoarderApiClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    it("should remove trailing slash from baseUrl", () => {
      const client = new HoarderApiClient("https://example.com/api/v1/", "key");
      expect(client.getAssetUrl("abc")).toBe("https://example.com/assets/abc");
    });

    it("should not modify baseUrl without trailing slash", () => {
      const client = new HoarderApiClient("https://example.com/api/v1", "key");
      expect(client.getAssetUrl("abc")).toBe("https://example.com/assets/abc");
    });
  });

  describe("getAssetUrl", () => {
    it("should strip /api/v1 from base URL", () => {
      const client = new HoarderApiClient("https://example.com/api/v1", "key");
      expect(client.getAssetUrl("abc123")).toBe("https://example.com/assets/abc123");
    });

    it("should handle /api/v1/ with trailing slash (stripped by constructor)", () => {
      const client = new HoarderApiClient("https://example.com/api/v1/", "key");
      expect(client.getAssetUrl("abc123")).toBe("https://example.com/assets/abc123");
    });

    it("should work with base URL that has no /api/v1 path", () => {
      const client = new HoarderApiClient("https://myserver.com", "key");
      expect(client.getAssetUrl("abc123")).toBe("https://myserver.com/assets/abc123");
    });

    it("should include the asset ID in the returned URL", () => {
      const client = new HoarderApiClient("https://app.example.com/api/v1", "mykey");
      expect(client.getAssetUrl("test-asset-id")).toBe(
        "https://app.example.com/assets/test-asset-id"
      );
    });

    it("should work with subdomain-based deployments", () => {
      const client = new HoarderApiClient("https://hoarder.myhost.io/api/v1", "key");
      expect(client.getAssetUrl("img42")).toBe("https://hoarder.myhost.io/assets/img42");
    });
  });

  describe("getAllHighlights", () => {
    let client: HoarderApiClient;

    beforeEach(() => {
      client = new HoarderApiClient("https://example.com/api/v1", "key");
    });

    it("should return empty array when no highlights exist", async () => {
      jest.spyOn(client, "getHighlights").mockResolvedValueOnce({
        highlights: [],
        nextCursor: null,
      });

      const result = await client.getAllHighlights();
      expect(result).toEqual([]);
    });

    it("should return all highlights from a single page", async () => {
      const highlights = [
        { id: "h1", bookmarkId: "b1" },
        { id: "h2", bookmarkId: "b2" },
      ] as HoarderHighlight[];

      jest.spyOn(client, "getHighlights").mockResolvedValueOnce({
        highlights,
        nextCursor: null,
      });

      const result = await client.getAllHighlights();
      expect(result).toHaveLength(2);
      expect(result).toEqual(highlights);
    });

    it("should follow cursors across multiple pages and concatenate results", async () => {
      const spy = jest
        .spyOn(client, "getHighlights")
        .mockResolvedValueOnce({
          highlights: [{ id: "h1" } as HoarderHighlight],
          nextCursor: "cursor1",
        })
        .mockResolvedValueOnce({
          highlights: [{ id: "h2" } as HoarderHighlight],
          nextCursor: "cursor2",
        })
        .mockResolvedValueOnce({
          highlights: [{ id: "h3" } as HoarderHighlight],
          nextCursor: null,
        });

      const result = await client.getAllHighlights();

      expect(result).toHaveLength(3);
      expect(result.map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenNthCalledWith(2, { limit: 100, cursor: "cursor1" });
      expect(spy).toHaveBeenNthCalledWith(3, { limit: 100, cursor: "cursor2" });
    });

    it("should handle missing highlights array in response gracefully", async () => {
      jest.spyOn(client, "getHighlights").mockResolvedValueOnce({
        highlights: undefined as any,
        nextCursor: null,
      });

      const result = await client.getAllHighlights();
      expect(result).toEqual([]);
    });

    it("should request with limit=100 on each page", async () => {
      const spy = jest.spyOn(client, "getHighlights").mockResolvedValueOnce({
        highlights: [],
        nextCursor: null,
      });

      await client.getAllHighlights();

      expect(spy).toHaveBeenCalledWith({ limit: 100, cursor: undefined });
    });
  });

  describe("makeRequest via public methods", () => {
    let client: HoarderApiClient;

    beforeEach(() => {
      client = new HoarderApiClient("https://example.com/api/v1", "test-key");
    });

    it("should set Authorization: Bearer header on requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookmarks: [], nextCursor: null }),
      });

      await client.getBookmarks();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBe("Bearer test-key");
    });

    it("should set Content-Type: application/json header on requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookmarks: [] }),
      });

      await client.getBookmarks();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("should omit undefined query params from URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookmarks: [] }),
      });

      await client.getBookmarks({ limit: 50, cursor: undefined });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("limit=50");
      expect(url).not.toContain("cursor");
    });

    it("should include defined query params in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookmarks: [] }),
      });

      await client.getBookmarks({ limit: 25, cursor: "abc", archived: false });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("limit=25");
      expect(url).toContain("cursor=abc");
      expect(url).toContain("archived=false");
    });

    it("should throw on HTTP 401 error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(client.getBookmarks()).rejects.toThrow("HTTP 401");
    });

    it("should throw on HTTP 500 error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(client.getBookmarks()).rejects.toThrow("HTTP 500");
    });

    it("should send PATCH request with JSON body for updateBookmark", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "b1" }),
      });

      await client.updateBookmark("b1", { note: "my note" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/bookmarks/b1");
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body)).toEqual({ note: "my note" });
    });

    it("should use GET with no body for getBookmarks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookmarks: [] }),
      });

      await client.getBookmarks();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });

    it("should rethrow network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      await expect(client.getBookmarks()).rejects.toThrow("Network failure");
    });
  });
});
