/**
 * Daily Anime API — Local Image Download, Compression & Storage
 *
 * Downloads today's selected anime image from AniList once per day,
 * compresses and resizes it specifically for ESP32 microcontrollers
 * (baseline JPEG, ~10-25 KB instead of ~500 KB, decodable with < 4 KB RAM),
 * and saves it to disk (`public/anime.jpg` and persistent storage).
 */

import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_SIZE,
  ANILIST_TIMEOUT,
  COMPRESS_MAX_WIDTH,
  COMPRESS_MAX_HEIGHT,
  COMPRESS_JPEG_QUALITY,
} from "./config.js";

const DATA_IMAGES_DIR = join(process.cwd(), "data", "images");
const PUBLIC_DIR = join(process.cwd(), "public");
const PUBLIC_IMAGE_PATH = join(PUBLIC_DIR, "anime.jpg");

/**
 * Compresses an image buffer into an ESP32-friendly baseline JPEG.
 *
 * Why baseline JPEG?
 * 1. ESP32 has limited internal RAM (~200 KB free heap). PNG decoding requires
 *    full uncompressed framebuffers in RAM (e.g. 1.2 MB for 460x658), causing Out of Memory.
 * 2. Baseline JPEG can be decoded line-by-line / MCU-block-by-block using TJpgDec
 *    or JPEGDEC on ESP32 with only ~3 KB of RAM!
 * 3. Progressive JPEGs cannot be decoded line-by-line, so `progressive: false` is strictly required.
 *
 * @param {Buffer} inputBuffer
 * @param {object} [options]
 * @returns {Promise<{ buffer: Buffer, info: object }>}
 */
export async function compressForEsp32(inputBuffer, options = {}) {
  const maxWidth = options.maxWidth || COMPRESS_MAX_WIDTH;
  const maxHeight = options.maxHeight || COMPRESS_MAX_HEIGHT;
  const quality = options.quality || COMPRESS_JPEG_QUALITY;

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const { data, info } = await image
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality,
      progressive: false, // Critical for ESP32 decoders
      chromaSubsampling: "4:2:0",
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    info: {
      ...info,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFormat: metadata.format,
    },
  };
}

/**
 * Returns the downloaded image for the given dateKey if present on disk.
 * If the stored image is not yet compressed for ESP32, compresses it automatically.
 *
 * @param {string} dateKey - e.g. "2026-10-22"
 * @returns {Promise<{ buffer: Buffer, contentType: string, length: number } | null>}
 */
export async function getDownloadedImage(dateKey) {
  try {
    const binPath = join(DATA_IMAGES_DIR, `${dateKey}.bin`);
    const metaPath = join(DATA_IMAGES_DIR, `${dateKey}.meta.json`);

    if (existsSync(binPath) && existsSync(metaPath)) {
      const rawBuffer = readFileSync(binPath);
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));

      // If already compressed for ESP32, return it
      if (meta.compressedForEsp32) {
        return {
          buffer: rawBuffer,
          contentType: "image/jpeg",
          length: rawBuffer.length,
          meta,
        };
      }

      // If existing image was stored uncompressed, compress it now
      console.log(`[image-store] Upgrading stored image ${dateKey} to ESP32-compressed JPEG...`);
      const { buffer: compressedBuffer, info } = await compressForEsp32(rawBuffer);

      writeFileSync(binPath, compressedBuffer);
      const updatedMeta = {
        ...meta,
        contentType: "image/jpeg",
        length: compressedBuffer.length,
        originalLength: rawBuffer.length,
        width: info.width,
        height: info.height,
        compressedForEsp32: true,
        compressedAt: new Date().toISOString(),
      };
      writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));

      try {
        writeFileSync(PUBLIC_IMAGE_PATH, compressedBuffer);
      } catch {
        // Ignore
      }

      return {
        buffer: compressedBuffer,
        contentType: "image/jpeg",
        length: compressedBuffer.length,
        meta: updatedMeta,
      };
    }
  } catch (err) {
    console.warn("[image-store] Error reading/upgrading local image:", err.message);
  }
  return null;
}

/**
 * Downloads the image from AniList, compresses it for ESP32, and saves to disk.
 *
 * @param {string} imageUrl
 * @param {string} dateKey
 * @param {object} [compressionOptions]
 * @returns {Promise<{ buffer: Buffer, contentType: string, length: number }>}
 */
export async function downloadAndSaveImage(imageUrl, dateKey, compressionOptions = {}) {
  // SSRF protection
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL in selection");
  }

  if (!ALLOWED_IMAGE_HOSTS.includes(parsedUrl.hostname)) {
    throw new Error(`Hostname ${parsedUrl.hostname} is not in allowed image hosts`);
  }

  // Fetch image with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANILIST_TIMEOUT);

  let response;
  try {
    response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Image download timed out");
    }
    throw new Error(`Failed to download image: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Upstream image source returned HTTP ${response.status}`);
  }

  const rawContentType = response.headers.get("Content-Type") || "";
  if (!rawContentType.startsWith("image/")) {
    throw new Error(`Upstream response is not an image (Content-Type: ${rawContentType})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds size limit of ${MAX_IMAGE_SIZE} bytes`);
  }

  const rawBuffer = Buffer.from(arrayBuffer);

  // Compress and resize for ESP32
  const { buffer: compressedBuffer, info } = await compressForEsp32(rawBuffer, compressionOptions);

  // Ensure directories exist
  mkdirSync(DATA_IMAGES_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Save compressed image and metadata
  const binPath = join(DATA_IMAGES_DIR, `${dateKey}.bin`);
  const metaPath = join(DATA_IMAGES_DIR, `${dateKey}.meta.json`);

  writeFileSync(binPath, compressedBuffer);
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        dateKey,
        imageUrl,
        contentType: "image/jpeg",
        length: compressedBuffer.length,
        originalLength: rawBuffer.length,
        width: info.width,
        height: info.height,
        compressedForEsp32: true,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // Also save to public/anime.jpg so Next.js serves it statically
  try {
    writeFileSync(PUBLIC_IMAGE_PATH, compressedBuffer);
  } catch (err) {
    console.warn("[image-store] Could not write to public/anime.jpg:", err.message);
  }

  return {
    buffer: compressedBuffer,
    contentType: "image/jpeg",
    length: compressedBuffer.length,
  };
}

/**
 * Ensures today's image is downloaded, compressed for ESP32, and available locally.
 *
 * @param {object} selection - { imageUrl, dateKey }
 * @param {object} [compressionOptions]
 * @returns {Promise<{ buffer: Buffer, contentType: string, length: number }>}
 */
export async function ensureDailyImage(selection, compressionOptions = {}) {
  const existing = await getDownloadedImage(selection.dateKey);
  if (existing) {
    // If public/anime.jpg is missing, restore it from disk cache
    if (!existsSync(PUBLIC_IMAGE_PATH)) {
      try {
        writeFileSync(PUBLIC_IMAGE_PATH, existing.buffer);
      } catch {
        // Ignore
      }
    }
    return existing;
  }

  return await downloadAndSaveImage(selection.imageUrl, selection.dateKey, compressionOptions);
}
