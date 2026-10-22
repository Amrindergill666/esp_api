/**
 * Daily Anime API — Configuration
 *
 * All tuneable values live here. Override via environment variables or `.env.local`.
 */

/** Timezone used to determine "today". Must be an IANA timezone string. */
export const TIMEZONE = process.env.DAILY_ANIME_TIMEZONE || "UTC";

/** Preferred image field: "coverImage" or "bannerImage". */
export const IMAGE_TYPE = process.env.DAILY_ANIME_IMAGE_TYPE || "coverImage";

/** Number of AniList candidates to request per query. */
export const CANDIDATE_POOL_SIZE = parseInt(
  process.env.DAILY_ANIME_POOL_SIZE || "50",
  10
);

/** Minimum popularity score for candidate anime (0 = no filter). */
export const MIN_POPULARITY = parseInt(
  process.env.DAILY_ANIME_MIN_POPULARITY || "0",
  10
);

/** Whether to track selection history and avoid recent repeats. */
export const ENABLE_HISTORY =
  process.env.DAILY_ANIME_ENABLE_HISTORY === "true";

/** Number of recent days to exclude when history is enabled. */
export const HISTORY_LOOKBACK_DAYS = parseInt(
  process.env.DAILY_ANIME_HISTORY_LOOKBACK || "7",
  10
);

/** Path to the SQLite database file. */
export const DB_PATH =
  process.env.DAILY_ANIME_DB_PATH || "./data/daily-anime.db";

/** AniList GraphQL endpoint. */
export const ANILIST_URL = "https://graphql.anilist.co";

/** Timeout in ms for AniList HTTP requests. */
export const ANILIST_TIMEOUT = parseInt(
  process.env.DAILY_ANIME_ANILIST_TIMEOUT || "10000",
  10
);

/** Allowed AniList image CDN hostnames (for image proxy SSRF protection). */
export const ALLOWED_IMAGE_HOSTS = [
  "s4.anilist.co",
  "s3.anilist.co",
  "s2.anilist.co",
  "s1.anilist.co",
  "anilist.co",
];

/** Maximum image response size in bytes for the proxy (5 MB). */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Target max image width for ESP32 devices (default 320px). */
export const COMPRESS_MAX_WIDTH = parseInt(
  process.env.DAILY_ANIME_MAX_WIDTH || "320",
  10
);

/** Target max image height for ESP32 devices (default 320px). */
export const COMPRESS_MAX_HEIGHT = parseInt(
  process.env.DAILY_ANIME_MAX_HEIGHT || "320",
  10
);

/** JPEG compression quality 1-100 (default 75 for optimal ESP32 memory/quality). */
export const COMPRESS_JPEG_QUALITY = parseInt(
  process.env.DAILY_ANIME_JPEG_QUALITY || "75",
  10
);
