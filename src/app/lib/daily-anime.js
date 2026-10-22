/**
 * Daily Anime API — Core Selection Logic
 *
 * Coordinates database lookups and AniList fetching to produce the
 * one-image-per-day guarantee.
 */

import { TIMEZONE, ENABLE_HISTORY, HISTORY_LOOKBACK_DAYS } from "./config.js";
import { getSelection, saveSelection, getRecentAnimeIds, isValidRecord } from "./db.js";
import { fetchCandidates } from "./anilist.js";

/**
 * Returns today's date key in YYYY-MM-DD format using the configured timezone.
 *
 * @param {Date} [now] — injectable clock for testing
 * @returns {string}
 */
export function getTodayDateKey(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // "en-CA" locale produces YYYY-MM-DD format
  return formatter.format(now);
}

/**
 * Returns the next rotation timestamp (midnight of the next day) in ISO format.
 *
 * @param {string} dateKey — e.g. "2026-10-22"
 * @returns {string} ISO 8601 timestamp
 */
export function getNextRotationAt(dateKey) {
  // Parse the date key and add one day
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

  // If using a non-UTC timezone, approximate by interpreting the date in that timezone
  if (TIMEZONE !== "UTC") {
    // Create a date string for the next day and resolve it in the target timezone
    const nextDateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(nextDay);

    // Return midnight of the next day in the configured timezone (approximate as UTC for simplicity)
    const [ny, nm, nd] = nextDateKey.split("-").map(Number);
    return new Date(Date.UTC(ny, nm - 1, nd)).toISOString();
  }

  return nextDay.toISOString();
}

/**
 * Returns the number of seconds until the next rotation.
 *
 * @param {string} nextRotationAt — ISO 8601 timestamp
 * @returns {number}
 */
export function getSecondsUntilRotation(nextRotationAt) {
  const diff = new Date(nextRotationAt).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}

/**
 * Main entry point: get or create today's daily anime selection.
 *
 * @param {object} [options]
 * @param {Date}   [options.now] — injectable clock for testing
 * @returns {Promise<object>} The daily selection result
 */
export async function getDailyAnime({ now } = {}) {
  const dateKey = getTodayDateKey(now);

  // 1. Check persistent storage first
  const existing = getSelection(dateKey);

  if (isValidRecord(existing)) {
    return {
      ...existing,
      cached: true,
    };
  }

  // 2. Record is missing or invalid — fetch candidates from AniList
  const candidates = await fetchCandidates();

  if (!candidates || candidates.length === 0) {
    throw new Error("No valid anime candidates returned from AniList");
  }

  // 3. Filter out recently selected anime if history is enabled
  let eligible = candidates;
  if (ENABLE_HISTORY) {
    const recentIds = getRecentAnimeIds(HISTORY_LOOKBACK_DAYS);
    const recentSet = new Set(recentIds);
    eligible = candidates.filter((c) => !recentSet.has(c.animeId));

    // Fall back to full candidate list if all are excluded
    if (eligible.length === 0) {
      eligible = candidates;
    }
  }

  // 4. Select a pseudo-random candidate using the date as seed
  //    This ensures the same date always picks the same index if the
  //    candidate list is identical, but is still effectively random day-to-day.
  const seed = dateKeyToSeed(dateKey);
  const index = seed % eligible.length;
  const selected = eligible[index];

  // 5. Persist the selection (INSERT OR IGNORE ensures concurrency safety)
  const record = saveSelection({
    dateKey,
    animeId: selected.animeId,
    title: selected.title,
    imageUrl: selected.imageUrl,
    imageType: selected.imageType,
    format: selected.format,
    source: "AniList",
    createdAt: new Date().toISOString(),
  });

  if (!isValidRecord(record)) {
    throw new Error("Failed to save daily anime selection");
  }

  return {
    ...record,
    cached: false,
  };
}

/**
 * Converts a date key string to a numeric seed for deterministic selection.
 *
 * @param {string} dateKey — "YYYY-MM-DD"
 * @returns {number}
 */
function dateKeyToSeed(dateKey) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    const char = dateKey.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
