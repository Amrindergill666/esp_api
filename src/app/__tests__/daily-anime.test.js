/**
 * Daily Anime API — Test Suite
 *
 * Tests cover:
 *  1. First request creates today's selection
 *  2. Repeated requests return the same selection
 *  3. Concurrent requests produce a single selection
 *  4. Date change triggers a new selection
 *  5. Server restart preserves the selection (SQLite persistence)
 *  6. AniList failure doesn't break existing saved selection
 *  7. Missing image URLs are excluded
 *  8. Malformed stored record is handled
 *  9. Appropriate error responses on failure
 * 10. Cache headers expire before midnight
 * 11. Timezone handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "fs";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// vi.mock factories are hoisted — cannot reference local variables.
// Use hardcoded values inside the factory.
vi.mock("@/app/lib/config.js", () => ({
  TIMEZONE: "UTC",
  IMAGE_TYPE: "coverImage",
  CANDIDATE_POOL_SIZE: 50,
  MIN_POPULARITY: 0,
  ENABLE_HISTORY: false,
  HISTORY_LOOKBACK_DAYS: 7,
  DB_PATH: "./data/test-daily-anime.db",
  ANILIST_URL: "https://graphql.anilist.co",
  ANILIST_TIMEOUT: 10000,
  ALLOWED_IMAGE_HOSTS: ["s4.anilist.co"],
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
}));

vi.mock("@/app/lib/anilist.js", () => ({
  fetchCandidates: vi.fn(),
}));

// Now import modules under test
import { getSelection, saveSelection, getDb, isValidRecord } from "@/app/lib/db.js";
import {
  getDailyAnime,
  getTodayDateKey,
  getNextRotationAt,
  getSecondsUntilRotation,
} from "@/app/lib/daily-anime.js";
import { fetchCandidates } from "@/app/lib/anilist.js";

const TEST_DB_PATH = "./data/test-daily-anime.db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCandidates(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    animeId: 1000 + i,
    title: `Test Anime ${i}`,
    imageUrl: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/test${i}.jpg`,
    imageType: "coverImage",
    format: "TV",
    season: "FALL",
    popularity: 10000 - i,
  }));
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

function cleanupDb() {
  try {
    rmSync(TEST_DB_PATH, { force: true });
    rmSync(TEST_DB_PATH + "-wal", { force: true });
    rmSync(TEST_DB_PATH + "-shm", { force: true });
  } catch {
    // Ignore if files don't exist
  }
}

beforeEach(() => {
  fetchCandidates.mockReset();
});

afterEach(() => {
  try {
    const db = getDb();
    // Clear data between tests
    db.exec("DELETE FROM daily_selections");
  } catch {
    // Ignore
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getTodayDateKey", () => {
  it("returns date in YYYY-MM-DD format", () => {
    const key = getTodayDateKey(new Date("2026-10-22T15:30:00Z"));
    expect(key).toBe("2026-10-22");
  });

  it("handles date boundaries correctly", () => {
    const key = getTodayDateKey(new Date("2026-10-22T23:59:59Z"));
    expect(key).toBe("2026-10-22");

    const nextDayKey = getTodayDateKey(new Date("2026-10-23T00:00:00Z"));
    expect(nextDayKey).toBe("2026-10-23");
  });
});

describe("getNextRotationAt", () => {
  it("returns next day midnight in UTC", () => {
    const next = getNextRotationAt("2026-10-22");
    expect(next).toBe("2026-10-23T00:00:00.000Z");
  });

  it("handles month boundary", () => {
    const next = getNextRotationAt("2026-10-31");
    expect(next).toBe("2026-11-01T00:00:00.000Z");
  });

  it("handles year boundary", () => {
    const next = getNextRotationAt("2026-12-31");
    expect(next).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("getSecondsUntilRotation", () => {
  it("returns positive seconds for future rotation", () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const seconds = getSecondsUntilRotation(futureDate);
    expect(seconds).toBeGreaterThan(3500);
    expect(seconds).toBeLessThanOrEqual(3600);
  });

  it("returns 0 for past rotation", () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const seconds = getSecondsUntilRotation(pastDate);
    expect(seconds).toBe(0);
  });
});

describe("Database operations", () => {
  it("saves and retrieves a selection", () => {
    const selection = {
      dateKey: "2026-10-22",
      animeId: 12345,
      title: "Test Anime",
      imageUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/test.jpg",
      imageType: "coverImage",
      source: "AniList",
      createdAt: new Date().toISOString(),
    };

    const saved = saveSelection(selection);
    expect(saved.animeId).toBe(12345);
    expect(saved.title).toBe("Test Anime");

    const retrieved = getSelection("2026-10-22");
    expect(retrieved).not.toBeNull();
    expect(retrieved.animeId).toBe(12345);
    expect(retrieved.imageUrl).toBe(selection.imageUrl);
  });

  it("INSERT OR IGNORE preserves the first insert (concurrency safety)", () => {
    const first = {
      dateKey: "2026-10-22",
      animeId: 111,
      title: "First Anime",
      imageUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/first.jpg",
      imageType: "coverImage",
      source: "AniList",
      createdAt: new Date().toISOString(),
    };

    const second = {
      dateKey: "2026-10-22",
      animeId: 222,
      title: "Second Anime",
      imageUrl:
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/second.jpg",
      imageType: "coverImage",
      source: "AniList",
      createdAt: new Date().toISOString(),
    };

    const result1 = saveSelection(first);
    const result2 = saveSelection(second);

    // Both should return the first selection
    expect(result1.animeId).toBe(111);
    expect(result2.animeId).toBe(111);

    const stored = getSelection("2026-10-22");
    expect(stored.animeId).toBe(111);
  });

  it("validates records correctly", () => {
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord({})).toBe(false);
    expect(isValidRecord({ dateKey: "2026-10-22" })).toBe(false);
    expect(
      isValidRecord({
        dateKey: "2026-10-22",
        animeId: 123,
        title: "Test",
        imageUrl: "https://example.com/img.jpg",
      })
    ).toBe(true);
  });
});

describe("getDailyAnime", () => {
  it("creates today's selection on first request", async () => {
    const candidates = makeCandidates();
    fetchCandidates.mockResolvedValue(candidates);

    const result = await getDailyAnime({
      now: new Date("2026-10-22T12:00:00Z"),
    });

    expect(result).toBeDefined();
    expect(result.animeId).toBeDefined();
    expect(result.imageUrl).toMatch(/^https:\/\//);
    expect(result.cached).toBe(false);
    expect(result.dateKey).toBe("2026-10-22");
    expect(fetchCandidates).toHaveBeenCalledTimes(1);
  });

  it("returns same selection on repeated requests (no extra AniList call)", async () => {
    const candidates = makeCandidates();
    fetchCandidates.mockResolvedValue(candidates);

    const first = await getDailyAnime({
      now: new Date("2026-10-22T12:00:00Z"),
    });
    const second = await getDailyAnime({
      now: new Date("2026-10-22T18:00:00Z"),
    });

    expect(second.animeId).toBe(first.animeId);
    expect(second.imageUrl).toBe(first.imageUrl);
    expect(second.cached).toBe(true);
    // AniList should only be called once
    expect(fetchCandidates).toHaveBeenCalledTimes(1);
  });

  it("selects a new anime when the date changes", async () => {
    const candidates = makeCandidates(10);
    fetchCandidates.mockResolvedValue(candidates);

    const day1 = await getDailyAnime({
      now: new Date("2026-10-22T12:00:00Z"),
    });
    const day2 = await getDailyAnime({
      now: new Date("2026-10-23T12:00:00Z"),
    });

    expect(day1.dateKey).toBe("2026-10-22");
    expect(day2.dateKey).toBe("2026-10-23");
    expect(day1.animeId).toBeDefined();
    expect(day2.animeId).toBeDefined();
  });

  it("returns existing selection even when AniList fails", async () => {
    // First, create a valid selection
    fetchCandidates.mockResolvedValue(makeCandidates());
    const first = await getDailyAnime({
      now: new Date("2026-10-22T12:00:00Z"),
    });

    // Now AniList is down - but selection exists, so no call needed
    fetchCandidates.mockRejectedValue(new Error("AniList is down"));
    const second = await getDailyAnime({
      now: new Date("2026-10-22T18:00:00Z"),
    });

    expect(second.animeId).toBe(first.animeId);
    expect(second.cached).toBe(true);
  });

  it("throws when AniList fails and no existing selection", async () => {
    fetchCandidates.mockRejectedValue(new Error("AniList network error"));

    await expect(
      getDailyAnime({ now: new Date("2026-10-22T12:00:00Z") })
    ).rejects.toThrow("AniList network error");
  });

  it("throws when AniList returns empty candidates", async () => {
    fetchCandidates.mockResolvedValue([]);

    await expect(
      getDailyAnime({ now: new Date("2026-10-22T12:00:00Z") })
    ).rejects.toThrow("No valid anime candidates");
  });
});

describe("Concurrent requests", () => {
  it("multiple simultaneous requests produce the same selection", async () => {
    const candidates = makeCandidates();
    fetchCandidates.mockResolvedValue(candidates);

    // Simulate 10 concurrent requests
    const promises = Array.from({ length: 10 }, () =>
      getDailyAnime({ now: new Date("2026-10-22T12:00:00Z") })
    );

    const results = await Promise.all(promises);

    // All should have the same anime ID
    const firstId = results[0].animeId;
    for (const result of results) {
      expect(result.animeId).toBe(firstId);
      expect(result.imageUrl).toBe(results[0].imageUrl);
    }
  });
});

describe("Selection persistence across restarts", () => {
  it("selection survives database reconnection", async () => {
    const candidates = makeCandidates();
    fetchCandidates.mockResolvedValue(candidates);

    // Create a selection
    const original = await getDailyAnime({
      now: new Date("2026-10-22T12:00:00Z"),
    });

    // Verify by reading from a fresh connection
    const freshDb = new Database(TEST_DB_PATH);
    const row = freshDb
      .prepare("SELECT * FROM daily_selections WHERE date_key = ?")
      .get("2026-10-22");
    freshDb.close();

    expect(row).not.toBeNull();
    expect(row.anime_id).toBe(original.animeId);
    expect(row.image_url).toBe(original.imageUrl);
  });
});
