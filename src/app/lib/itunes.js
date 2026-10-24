/**
 * iTunes Search API Helper
 *
 * Provides song and album search and album artwork extraction with support for
 * custom thumbnail sizing, in-memory caching, and ESP32-friendly formatting.
 */

// In-memory cache for fast repeated lookups
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 500;

/**
 * Replaces the dimensions in an Apple mzstatic image URL.
 *
 * e.g. ".../100x100bb.jpg" -> ".../60x60bb.jpg" or ".../130x130bb.jpg" or ".../240x240bb.jpg"
 *
 * @param {string} url - Original artwork URL
 * @param {number|string} [size=100] - Desired dimension (width/height or "WxH")
 * @returns {string} Resized artwork URL
 */
export function formatArtworkUrl(url, size = 100) {
  if (!url || typeof url !== "string") return url;

  const dimStr = typeof size === "number" || /^\d+$/.test(size)
    ? `${size}x${size}`
    : String(size);

  // Match pattern like /100x100bb.jpg or /100x100bb.png
  return url.replace(/\/\d+x\d+bb(\.[a-zA-Z0-9]+)$/, `/${dimStr}bb$1`);
}

/**
 * Searches iTunes for an album by album name and optional artist.
 *
 * @param {object} params
 * @param {string} [params.album] - Album name (e.g. "After Hours")
 * @param {string} [params.artist] - Artist name (e.g. "The Weeknd")
 * @param {string} [params.term] - General search term
 * @param {number|string} [params.size=100] - Thumbnail dimension in pixels
 * @param {number} [params.timeout=8000] - Timeout in milliseconds
 * @param {boolean} [params.skipCache=false] - Bypass cache
 * @returns {Promise<object|null>} Album info and thumbnail link, or null if not found
 */
export async function searchAlbum(params = {}) {
  const {
    album,
    name,
    title,
    artist,
    term,
    size = 100,
    timeout = 8000,
    skipCache = false,
  } = params;

  let query = "";
  if (term && term.trim()) {
    query = term.trim();
  } else {
    const albumName = (album || name || title || "").trim();
    const artistName = (artist || "").trim();
    query = [albumName, artistName].filter(Boolean).join(" ");
  }

  if (!query) {
    throw new Error("Missing search term: please provide 'album' or 'term'");
  }

  const cacheKey = `album::${query.toLowerCase()}::${size}`;

  // Check cache
  if (!skipCache && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }
    cache.delete(cacheKey);
  }

  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(itunesUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ESP-API/1.0",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`iTunes album request timed out after ${timeout}ms`);
    }
    throw new Error(`Failed to reach iTunes API: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`iTunes API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    return null;
  }

  const item = data.results[0];
  const artworkUrl60 = item.artworkUrl60 || null;
  const artworkUrl100 = item.artworkUrl100 || null;
  const baseArtwork = artworkUrl100 || artworkUrl60;
  const thumbnail = formatArtworkUrl(baseArtwork, size);

  const result = {
    thumbnail,
    artworkUrl60,
    artworkUrl100,
    artworkUrl: thumbnail,
    albumName: item.collectionName || null,
    artistName: item.artistName || null,
    collectionId: item.collectionId || null,
    trackCount: item.trackCount || null,
    releaseDate: item.releaseDate || null,
    primaryGenreName: item.primaryGenreName || null,
    searchTerm: query,
    type: "album",
    cached: false,
  };

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Searches iTunes for a track by name/artist, album, or general search term.
 *
 * @param {object} params
 * @param {string} [params.term] - General search term (e.g. "Blinding Lights The Weeknd")
 * @param {string} [params.song] - Song title
 * @param {string} [params.title] - Song title alias
 * @param {string} [params.name] - Song name alias
 * @param {string} [params.album] - Album name (fallback if song not specified)
 * @param {string} [params.artist] - Artist name
 * @param {number|string} [params.size=100] - Thumbnail dimension in pixels (e.g. 60, 100, 130, 240)
 * @param {number} [params.timeout=8000] - Timeout in milliseconds
 * @param {boolean} [params.skipCache=false] - Bypass cache
 * @returns {Promise<object|null>} Track info and thumbnail links, or null if not found
 */
export async function searchTrack(params = {}) {
  const {
    term,
    song,
    title,
    name,
    album,
    artist,
    size = 100,
    timeout = 8000,
    skipCache = false,
  } = params;

  // If album is provided and NO song title is provided, route directly to album search
  const trackTitle = (song || title || name || "").trim();
  if (!trackTitle && !term && album) {
    return searchAlbum({ album, artist, size, timeout, skipCache });
  }

  // Build query string
  let query = "";
  if (term && term.trim()) {
    query = term.trim();
  } else {
    const artistName = (artist || "").trim();
    query = [trackTitle, artistName].filter(Boolean).join(" ");
  }

  if (!query) {
    if (album) {
      return searchAlbum({ album, artist, size, timeout, skipCache });
    }
    throw new Error("Missing search term: please provide 'term', 'song', or 'album'");
  }

  const cacheKey = `track::${query.toLowerCase()}::${size}`;

  // Check cache
  if (!skipCache && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }
    cache.delete(cacheKey);
  }

  // Fetch from iTunes Search API
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(itunesUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ESP-API/1.0",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`iTunes request timed out after ${timeout}ms`);
    }
    throw new Error(`Failed to reach iTunes API: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`iTunes API returned HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    // If no song match was found and an album was provided, fallback to album search
    if (album) {
      return searchAlbum({ album, artist, size, timeout, skipCache });
    }
    return null;
  }

  const track = data.results[0];

  const artworkUrl30 = track.artworkUrl30 || null;
  const artworkUrl60 = track.artworkUrl60 || null;
  const artworkUrl100 = track.artworkUrl100 || null;

  const baseArtwork = artworkUrl100 || artworkUrl60 || artworkUrl30;
  const thumbnail = formatArtworkUrl(baseArtwork, size);

  const result = {
    thumbnail,
    artworkUrl30,
    artworkUrl60,
    artworkUrl100,
    artworkUrl: thumbnail,
    trackName: track.trackName || null,
    artistName: track.artistName || null,
    albumName: track.collectionName || null,
    trackId: track.trackId || null,
    trackViewUrl: track.trackViewUrl || null,
    previewUrl: track.previewUrl || null,
    releaseDate: track.releaseDate || null,
    primaryGenreName: track.primaryGenreName || null,
    searchTerm: query,
    type: "song",
    cached: false,
  };

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Clears the in-memory iTunes cache.
 */
export function clearTrackCache() {
  cache.clear();
}
