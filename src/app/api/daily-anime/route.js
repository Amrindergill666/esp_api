/**
 * GET /api/daily-anime
 *
 * Returns today's selected anime image and metadata as JSON.
 * Implements smart cache headers that expire at the next rotation boundary.
 */

import { NextResponse } from "next/server";
import { getDailyAnime, getTodayDateKey, getNextRotationAt, getSecondsUntilRotation } from "@/app/lib/daily-anime.js";
import { ensureDailyImage } from "@/app/lib/image-store.js";

export const dynamic = "force-dynamic"; // Ensure fresh execution on each request

export async function GET() {
  try {
    const selection = await getDailyAnime();
    const dateKey = selection.dateKey || getTodayDateKey();
    const nextRotationAt = getNextRotationAt(dateKey);
    const secondsUntilRotation = getSecondsUntilRotation(nextRotationAt);

    // Proactively ensure image is downloaded locally to disk
    ensureDailyImage({ imageUrl: selection.imageUrl, dateKey }).catch((err) =>
      console.warn("[daily-anime] Proactive download notice:", err.message)
    );

    // Cache-Control: allow public caching, but expire before the next rotation
    // Use s-maxage for CDN/shared caches, max-age for browser caches
    // Subtract a small buffer (60s) to prevent stale crossover
    const maxAge = Math.max(0, Math.min(secondsUntilRotation - 60, 3600));
    const sMaxAge = Math.max(0, secondsUntilRotation - 60);

    const response = NextResponse.json(
      {
        success: true,
        date: dateKey,
        image: "/anime.jpg",
        directUrl: "/anime.jpg",
        upstreamImageUrl: selection.imageUrl,
        title: selection.title,
        animeId: selection.animeId,
        imageType: selection.imageType,
        format: selection.format || null,
        source: selection.source,
        cached: selection.cached,
        nextRotationAt,
      },
      { status: 200 }
    );

    response.headers.set(
      "Cache-Control",
      `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=60`
    );

    return response;
  } catch (err) {
    console.error("[daily-anime] Error:", err.message);

    const status = err.message.includes("rate limited") ? 429 : 500;
    const retryAfter = err.message.includes("Retry after")
      ? parseInt(err.message.match(/Retry after (\d+)/)?.[1] || "60", 10)
      : undefined;

    const response = NextResponse.json(
      {
        success: false,
        error: sanitizeError(err.message),
      },
      { status }
    );

    if (retryAfter) {
      response.headers.set("Retry-After", String(retryAfter));
    }

    // Don't cache error responses
    response.headers.set("Cache-Control", "no-store");

    return response;
  }
}

/**
 * Sanitizes error messages to avoid leaking internal details.
 */
function sanitizeError(message) {
  // Allow known safe error types through
  const safePatterns = [
    "rate limited",
    "timed out",
    "No valid anime candidates",
    "AniList",
    "Failed to save",
    "unavailable",
  ];

  if (safePatterns.some((p) => message.includes(p))) {
    return message;
  }

  return "Internal server error";
}
