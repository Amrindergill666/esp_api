/**
 * Daily Anime API — AniList GraphQL Client
 *
 * Fetches anime candidates from the AniList public GraphQL API.
 * Handles timeouts, rate limits (429 + Retry-After), and validation
 * of image URLs before returning candidates.
 */

import {
  ANILIST_URL,
  ANILIST_TIMEOUT,
  CANDIDATE_POOL_SIZE,
  IMAGE_TYPE,
  MIN_POPULARITY,
} from "./config.js";

const QUERY = `
  query DailyAnimeCandidates($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        id
        title {
          english
          romaji
        }
        coverImage {
          extraLarge
          large
        }
        bannerImage
        format
        season
        popularity
      }
    }
  }
`;

/**
 * Fetches anime candidates from AniList.
 *
 * @param {object} [options]
 * @param {number} [options.page]        — AniList page number (default 1)
 * @param {number} [options.perPage]     — results per page (default from config)
 * @returns {Promise<object[]>}  Array of validated candidate objects
 * @throws {Error} On network failure, timeout, rate limit, or GraphQL error
 */
export async function fetchCandidates({ page = 1, perPage } = {}) {
  const effectivePerPage = perPage || CANDIDATE_POOL_SIZE;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANILIST_TIMEOUT);

  let response;
  try {
    response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { page, perPage: effectivePerPage },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("AniList request timed out");
    }
    throw new Error(`AniList network error: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const msg = retryAfter
      ? `AniList rate limited. Retry after ${retryAfter}s`
      : "AniList rate limited";
    throw new Error(msg);
  }

  if (!response.ok) {
    throw new Error(`AniList HTTP error: ${response.status} ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error("AniList returned malformed JSON");
  }

  // Check for GraphQL-level errors
  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`AniList GraphQL error: ${messages}`);
  }

  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    throw new Error("AniList returned no anime candidates");
  }

  // Validate and transform candidates
  return mediaList
    .map((media) => {
      const imageUrl = resolveImageUrl(media, IMAGE_TYPE);
      if (!imageUrl) return null;

      const title =
        media.title?.english || media.title?.romaji || "Unknown Anime";

      return {
        animeId: media.id,
        title,
        imageUrl,
        imageType: IMAGE_TYPE,
        format: media.format || null,
        season: media.season || null,
        popularity: media.popularity || 0,
      };
    })
    .filter((c) => c !== null)
    .filter((c) => c.popularity >= MIN_POPULARITY);
}

/**
 * Resolves the best available image URL from a media object.
 *
 * @param {object} media — AniList media object
 * @param {string} preferredType — "coverImage" or "bannerImage"
 * @returns {string|null}
 */
function resolveImageUrl(media, preferredType) {
  if (preferredType === "bannerImage") {
    if (isValidUrl(media.bannerImage)) return media.bannerImage;
    // Fall back to cover image
    return (
      validOrNull(media.coverImage?.extraLarge) ||
      validOrNull(media.coverImage?.large)
    );
  }

  // Default: coverImage
  return (
    validOrNull(media.coverImage?.extraLarge) ||
    validOrNull(media.coverImage?.large) ||
    validOrNull(media.bannerImage)
  );
}

function isValidUrl(url) {
  return typeof url === "string" && url.startsWith("https://");
}

function validOrNull(url) {
  return isValidUrl(url) ? url : null;
}
