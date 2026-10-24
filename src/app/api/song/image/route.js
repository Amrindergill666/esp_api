/**
 * GET /api/song/image
 *
 * Direct image endpoint for song album artwork.
 * Fetches the artwork for a song and returns it as an ESP32-optimized baseline JPEG,
 * allowing microcontrollers (ESP32) with screens to fetch album artwork in a single HTTP request!
 *
 * Query Parameters:
 *  - term: Search term (e.g. "Blinding Lights The Weeknd")
 *  - song / title: Track title
 *  - artist: Artist name
 *  - w / width: Target width (default 320)
 *  - h / height: Target height (default 320)
 *  - q / quality: JPEG quality 1-100 (default 75)
 */

import { NextResponse } from "next/server";
import { searchTrack } from "@/app/lib/itunes.js";
import { compressForEsp32 } from "@/app/lib/image-store.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const term = searchParams.get("term") || "";
    const song = searchParams.get("song") || searchParams.get("title") || searchParams.get("name") || "";
    const album = searchParams.get("album") || searchParams.get("collection") || "";
    const artist = searchParams.get("artist") || "";

    const customWidth = parseInt(searchParams.get("w") || searchParams.get("width") || "", 10) || null;
    const customHeight = parseInt(searchParams.get("h") || searchParams.get("height") || "", 10) || null;
    const customQuality = parseInt(searchParams.get("q") || searchParams.get("quality") || "", 10) || null;

    if (!term.trim() && !song.trim() && !album.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: 'term', 'song'/'title', or 'album'" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const track = await searchTrack({
      term,
      song,
      album,
      artist,
      size: Math.max(customWidth || 320, customHeight || 320),
    });

    if (!track || !track.thumbnail) {
      return NextResponse.json(
        { success: false, error: "Song artwork not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Fetch the upstream image bytes
    const imgRes = await fetch(track.thumbnail);
    if (!imgRes.ok) {
      throw new Error(`Failed to download artwork from Apple CDN (${imgRes.status})`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Compress for ESP32 into baseline JPEG
    const { buffer } = await compressForEsp32(inputBuffer, {
      maxWidth: customWidth || 320,
      maxHeight: customHeight || 320,
      quality: customQuality || 75,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=604800, s-maxage=604800",
        "X-Track-Name": encodeURIComponent(track.trackName || ""),
        "X-Artist-Name": encodeURIComponent(track.artistName || ""),
      },
    });
  } catch (err) {
    console.error("[api/song/image] Error:", err.message);

    return NextResponse.json(
      { success: false, error: err.message || "Failed to process song image" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
