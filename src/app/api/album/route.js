/**
 * GET & POST /api/album
 *
 * Dedicated endpoint to search album artwork on iTunes by album name and optional artist.
 *
 * Query / Body Parameters:
 *  - album / name / title: Album name (e.g. "After Hours")
 *  - artist: Artist name (e.g. "The Weeknd")
 *  - size: Thumbnail dimension (default: 100, e.g. 130, 240, 500)
 *  - raw / format=text / format=link: Returns only the JPG link as plain text
 *  - image=true / format=image: Streams the JPEG directly
 *  - format=json: Returns JSON
 *  - redirect: Defaults to true (HTTP 302 directly to the JPG image)
 */

export const dynamic = "force-dynamic";

export { GET, POST } from "../song/route.js";
