/**
 * Daily Anime API — SQLite Persistence Layer
 *
 * Uses better-sqlite3 for synchronous, atomic operations.
 * INSERT OR IGNORE + SELECT pattern ensures concurrency safety:
 * two simultaneous first-of-day requests will never create conflicting records.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { DB_PATH } from "./config.js";

let _db = null;

/**
 * Returns the singleton database connection, creating the database and
 * table on first call.
 */
export function getDb() {
  if (_db) return _db;

  // Ensure the directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS daily_selections (
      date_key   TEXT PRIMARY KEY,
      anime_id   INTEGER NOT NULL,
      title      TEXT NOT NULL,
      image_url  TEXT NOT NULL,
      image_type TEXT NOT NULL DEFAULT 'coverImage',
      format     TEXT,
      source     TEXT NOT NULL DEFAULT 'AniList',
      created_at TEXT NOT NULL
    );
  `);

  return _db;
}

/**
 * Attempts to save a daily selection. Uses INSERT OR IGNORE so that if a
 * record for this date_key already exists, the insert is silently skipped.
 * Then SELECTs and returns the authoritative record for that date.
 *
 * This guarantees that concurrent first-of-day requests will converge
 * on the same stored selection.
 *
 * @param {object} selection
 * @returns {object} The stored record (may differ from input if another request won the race)
 */
export function saveSelection(selection) {
  const db = getDb();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO daily_selections
      (date_key, anime_id, title, image_url, image_type, format, source, created_at)
    VALUES
      (@dateKey, @animeId, @title, @imageUrl, @imageType, @format, @source, @createdAt)
  `);

  insert.run({
    dateKey: selection.dateKey,
    animeId: selection.animeId,
    title: selection.title,
    imageUrl: selection.imageUrl,
    imageType: selection.imageType || "coverImage",
    format: selection.format || null,
    source: selection.source || "AniList",
    createdAt: selection.createdAt || new Date().toISOString(),
  });

  // Always SELECT to return the authoritative row (handles race conditions)
  return getSelection(selection.dateKey);
}

/**
 * Retrieves the stored selection for a given date key.
 *
 * @param {string} dateKey — e.g. "2026-10-22"
 * @returns {object|null}
 */
export function getSelection(dateKey) {
  const db = getDb();

  const row = db
    .prepare("SELECT * FROM daily_selections WHERE date_key = ?")
    .get(dateKey);

  if (!row) return null;

  return {
    dateKey: row.date_key,
    animeId: row.anime_id,
    title: row.title,
    imageUrl: row.image_url,
    imageType: row.image_type,
    format: row.format,
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * Returns the anime IDs selected in the last N days (for history exclusion).
 *
 * @param {number} days
 * @returns {number[]}
 */
export function getRecentAnimeIds(days) {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT anime_id FROM daily_selections
       ORDER BY date_key DESC
       LIMIT ?`
    )
    .all(days);

  return rows.map((r) => r.anime_id);
}

/**
 * Validates that a stored record has all required fields.
 *
 * @param {object|null} record
 * @returns {boolean}
 */
export function isValidRecord(record) {
  if (!record) return false;
  return !!(
    record.dateKey &&
    record.animeId &&
    record.title &&
    record.imageUrl
  );
}
