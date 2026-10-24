import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatArtworkUrl, searchTrack, searchAlbum, clearTrackCache } from "../lib/itunes.js";
import { GET as songGet, POST as songPost } from "../api/song/route.js";

describe("iTunes Artwork Helper", () => {
  beforeEach(() => {
    clearTrackCache();
    vi.restoreAllMocks();
  });

  describe("formatArtworkUrl", () => {
    it("replaces default 100x100bb.jpg with desired dimension", () => {
      const original = "https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/100x100bb.jpg";
      expect(formatArtworkUrl(original, 60)).toBe(
        "https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/60x60bb.jpg"
      );
      expect(formatArtworkUrl(original, 240)).toBe(
        "https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/240x240bb.jpg"
      );
    });

    it("handles dimension string like '150x150'", () => {
      const original = "https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/100x100bb.jpg";
      expect(formatArtworkUrl(original, "150x150")).toBe(
        "https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/150x150bb.jpg"
      );
    });

    it("returns original URL if pattern does not match", () => {
      expect(formatArtworkUrl("https://example.com/cover.png", 60)).toBe("https://example.com/cover.png");
      expect(formatArtworkUrl(null, 60)).toBe(null);
    });
  });

  describe("searchTrack", () => {
    it("throws error if no query is provided", async () => {
      await expect(searchTrack({})).rejects.toThrow("Missing search term");
    });

    it("fetches track and returns small thumbnail link", async () => {
      const mockResponse = {
        resultCount: 1,
        results: [
          {
            trackName: "Blinding Lights",
            artistName: "The Weeknd",
            collectionName: "After Hours",
            trackId: 1499378607,
            artworkUrl30: "https://is1-ssl.mzstatic.com/image/thumb/.../30x30bb.jpg",
            artworkUrl60: "https://is1-ssl.mzstatic.com/image/thumb/.../60x60bb.jpg",
            artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
          },
        ],
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchTrack({ term: "Blinding Lights The Weeknd" });
      expect(result).not.toBeNull();
      expect(result.trackName).toBe("Blinding Lights");
      expect(result.artistName).toBe("The Weeknd");
      expect(result.thumbnail).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg");
      expect(result.artworkUrl60).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../60x60bb.jpg");
      expect(result.cached).toBe(false);
    });

    it("caches result on repeated searches", async () => {
      const mockResponse = {
        resultCount: 1,
        results: [
          {
            trackName: "Starboy",
            artistName: "The Weeknd",
            artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
          },
        ],
      };

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const first = await searchTrack({ term: "Starboy" });
      expect(first.cached).toBe(false);

      const second = await searchTrack({ term: "Starboy" });
      expect(second.cached).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns null if no track found", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      });

      const result = await searchTrack({ term: "NonexistentSong123456789XYZ" });
      expect(result).toBeNull();
    });

    it("searches by album when only album parameter is provided", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              collectionName: "After Hours",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const result = await searchTrack({ album: "After Hours", artist: "The Weeknd" });
      expect(result).not.toBeNull();
      expect(result.albumName).toBe("After Hours");
      expect(result.type).toBe("album");
    });
  });

  describe("searchAlbum", () => {
    it("searches album and formats custom dimension", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              collectionName: "After Hours",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const result = await searchAlbum({ album: "After Hours", size: 130 });
      expect(result).not.toBeNull();
      expect(result.thumbnail).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../130x130bb.jpg");
    });
  });

  describe("API Route: /api/song", () => {
    it("returns 400 when missing query parameter", async () => {
      const req = new Request("http://localhost:3000/api/song");
      const res = await songGet(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("redirects 302 directly to thumbnail JPG by default", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackName: "Blinding Lights",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const req = new Request("http://localhost:3000/api/song?term=Blinding+Lights+The+Weeknd");
      const res = await songGet(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg");
    });

    it("returns JSON with thumbnail link when format=json", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackName: "Blinding Lights",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const req = new Request("http://localhost:3000/api/song?term=Blinding+Lights+The+Weeknd&format=json");
      const res = await songGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.thumbnail).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg");
      expect(json.trackName).toBe("Blinding Lights");
    });

    it("returns raw text thumbnail link when raw=true", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackName: "Blinding Lights",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const req = new Request("http://localhost:3000/api/song?term=Blinding+Lights&raw=true");
      const res = await songGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toBe("https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg");
    });

    it("supports POST with JSON body", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackName: "Save Your Tears",
              artistName: "The Weeknd",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/.../100x100bb.jpg",
            },
          ],
        }),
      });

      const req = new Request("http://localhost:3000/api/song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song: "Save Your Tears", artist: "The Weeknd" }),
      });

      const res = await songPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.trackName).toBe("Save Your Tears");
    });
  });
});
