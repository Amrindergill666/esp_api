/**
 * GET /api/daily-anime/image
 *
 * Serves the locally downloaded image bytes for today's selected anime.
 * The image is downloaded once per day, cached to disk, and served
 * directly from our own server with zero AniList latency on subsequent requests.
 */

import { NextResponse } from "next/server";
import { getDailyAnime, getTodayDateKey, getNextRotationAt, getSecondsUntilRotation } from "@/app/lib/daily-anime.js";
import { ensureDailyImage, compressForEsp32 } from "@/app/lib/image-store.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const selection = await getDailyAnime();
    const dateKey = selection.dateKey || getTodayDateKey();

    // Check for optional custom dimension query params (e.g. ?w=240&h=240&q=70)
    let customWidth = null;
    let customHeight = null;
    let customQuality = null;

    if (request?.url) {
      const { searchParams } = new URL(request.url);
      customWidth = parseInt(searchParams.get("w") || searchParams.get("width") || "", 10) || null;
      customHeight = parseInt(searchParams.get("h") || searchParams.get("height") || "", 10) || null;
      customQuality = parseInt(searchParams.get("q") || searchParams.get("quality") || "", 10) || null;
    }

    // Ensure image is downloaded and cached locally on disk
    let { buffer, contentType, length } = await ensureDailyImage({
      imageUrl: selection.imageUrl,
      dateKey,
    });

    // If custom dimensions were requested, resize on the fly
    if (customWidth || customHeight || customQuality) {
      const resized = await compressForEsp32(buffer, {
        maxWidth: customWidth || undefined,
        maxHeight: customHeight || undefined,
        quality: customQuality || undefined,
      });
      buffer = resized.buffer;
      length = buffer.length;
    }

    // Calculate cache headers aligned with daily rotation
    const nextRotationAt = getNextRotationAt(dateKey);
    const secondsUntilRotation = getSecondsUntilRotation(nextRotationAt);
    const maxAge = Math.max(0, Math.min(secondsUntilRotation - 60, 86400));

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(length),
        "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
        "X-Anime-Id": String(selection.animeId),
        "X-Anime-Title": encodeURIComponent(selection.title),
        "X-Image-Source": "Local-Disk-Cache",
        "X-Direct-Url": "/anime.jpg",
      },
    });
  } catch (err) {
    console.error("[daily-anime/image] Error:", err.message);

    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve local daily anime image" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
