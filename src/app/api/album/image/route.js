/**
 * GET /api/album/image
 *
 * Dedicated image endpoint for album artwork.
 * Streams the album artwork as an ESP32-friendly baseline JPEG directly.
 */

export const dynamic = "force-dynamic";

export { GET } from "../../song/image/route.js";
