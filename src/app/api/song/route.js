/**
 * GET & POST /api/song
 *
 * Searches iTunes for a track and either:
 *  - 302 Redirects directly to the thumbnail JPG (default)
 *  - Returns only the plain text JPG link (when raw=true, link=true, or format=text/link)
 *  - Streams the actual JPEG image bytes (when image=true or format=image)
 *  - Returns the full JSON metadata (when format=json)
 *
 * Query / Body Parameters:
 *  - term: General search string (e.g. "Blinding Lights The Weeknd")
 *  - song / title / name: Track name (e.g. "Blinding Lights")
 *  - artist: Artist name (e.g. "The Weeknd")
 *  - size: Thumbnail dimension in pixels (default: 100, e.g. 60, 100, 240, 500)
 *  - redirect: Explicitly control redirect (true/false, default: true unless format=text/json/image)
 *  - format: "redirect" (default) | "link" | "text" | "image" | "json"
 *  - raw: Alias for format=text (returns only the JPG link string)
 *  - link: Alias for format=text (returns only the JPG link string)
 *  - image: If true, streams the JPEG image bytes directly with Content-Type: image/jpeg
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
    const size = searchParams.get("size") || "100";

    const format = (searchParams.get("format") || "").toLowerCase();
    const isRaw = searchParams.get("raw") === "true" || searchParams.get("link") === "true" || format === "text" || format === "link" || format === "url";
    const isImage = searchParams.get("image") === "true" || format === "image" || format === "jpeg" || format === "jpg";
    const isJson = format === "json" || searchParams.get("json") === "true";

    // Redirect is the default unless explicitly asked for text, image, json, or redirect=false
    const redirectParam = searchParams.get("redirect");
    const shouldRedirect = redirectParam === "true" || (redirectParam !== "false" && !isRaw && !isImage && !isJson);

    if (!term.trim() && !song.trim() && !album.trim()) {
      if (isRaw) {
        return new NextResponse("Missing required search parameter: 'term', 'song', or 'album'", { status: 400 });
      }
      return NextResponse.json(
        {
          success: false,
          error: "Missing required search parameter: provide 'term', 'song'/'title', or 'album' (and optional 'artist')",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await searchTrack({
      term,
      song,
      album,
      artist,
      size,
    });

    if (!result || !result.thumbnail) {
      if (isRaw) {
        return new NextResponse("Not Found", { status: 404 });
      }
      return NextResponse.json(
        {
          success: false,
          error: `No song found for "${term || [song, artist].filter(Boolean).join(" ")}"`,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1. Direct 302 Redirect to the thumbnail JPG
    if (shouldRedirect) {
      return NextResponse.redirect(result.thumbnail, 302);
    }

    // 2. Return ONLY the plain text JPG link
    if (isRaw) {
      return new NextResponse(result.thumbnail, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    // 3. Stream direct JPEG bytes for microcontrollers
    if (isImage) {
      const imgRes = await fetch(result.thumbnail);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch thumbnail image from CDN (${imgRes.status})`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      // Baseline JPEG for ESP32
      const targetDim = parseInt(size, 10) || 320;
      const { buffer } = await compressForEsp32(inputBuffer, {
        maxWidth: targetDim,
        maxHeight: targetDim,
        quality: 75,
      });

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buffer.length),
          "Cache-Control": "public, max-age=604800, s-maxage=604800",
        },
      });
    }

    // 4. Return full JSON (when format=json)
    return NextResponse.json(
      {
        success: true,
        thumbnail: result.thumbnail,
        artworkUrl30: result.artworkUrl30,
        artworkUrl60: result.artworkUrl60,
        artworkUrl100: result.artworkUrl100,
        artworkUrl: result.artworkUrl,
        trackName: result.trackName,
        artistName: result.artistName,
        albumName: result.albumName,
        trackId: result.trackId,
        previewUrl: result.previewUrl,
        releaseDate: result.releaseDate,
        primaryGenreName: result.primaryGenreName,
        cached: result.cached,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    console.error("[api/song] Error:", err.message);

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to search iTunes for song",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request) {
  try {
    let body = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const term = body.term || "";
    const song = body.song || body.title || body.name || "";
    const album = body.album || body.collection || "";
    const artist = body.artist || "";
    const size = body.size || "100";

    const format = (body.format || "").toLowerCase();
    const isRaw = body.raw === true || body.raw === "true" || body.link === true || body.link === "true" || format === "text" || format === "link";
    const shouldRedirect = body.redirect === true || body.redirect === "true" || format === "redirect";

    if (!term.trim() && !song.trim() && !album.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: provide 'term', 'song'/'title', or 'album'",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await searchTrack({
      term,
      song,
      album,
      artist,
      size,
    });

    if (!result || !result.thumbnail) {
      if (isRaw) {
        return new NextResponse("Not Found", { status: 404 });
      }
      return NextResponse.json(
        {
          success: false,
          error: `No song found for "${term || [song, artist].filter(Boolean).join(" ")}"`,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (shouldRedirect) {
      return NextResponse.redirect(result.thumbnail, 302);
    }

    if (isRaw) {
      return new NextResponse(result.thumbnail, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        thumbnail: result.thumbnail,
        artworkUrl30: result.artworkUrl30,
        artworkUrl60: result.artworkUrl60,
        artworkUrl100: result.artworkUrl100,
        artworkUrl: result.artworkUrl,
        trackName: result.trackName,
        artistName: result.artistName,
        albumName: result.albumName,
        trackId: result.trackId,
        previewUrl: result.previewUrl,
        releaseDate: result.releaseDate,
        primaryGenreName: result.primaryGenreName,
        cached: result.cached,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    console.error("[api/song] POST Error:", err.message);

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to process song search request",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
