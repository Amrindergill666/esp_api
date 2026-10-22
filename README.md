# ESP API

A [Next.js](https://nextjs.org) project with a **Daily Anime Image API** powered by [AniList GraphQL](https://anilist.gitbook.io/anilist-apiv2-docs).

## Daily Anime API

Returns one anime image per calendar day, selected from popular anime on AniList. The selection is persisted so every request on the same day returns the exact same image.

### Endpoints

#### `GET /api/daily-anime`

Returns today's selected anime as JSON.

**Example response:**

```json
{
  "success": true,
  "date": "2026-10-22",
  "image": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20665-TLgkL8T8IRFd.png",
  "title": "Your lie in April",
  "animeId": 20665,
  "imageType": "coverImage",
  "format": "TV",
  "source": "AniList",
  "cached": true,
  "nextRotationAt": "2026-10-23T00:00:00.000Z"
}
```

| Field            | Type    | Description                                          |
| ---------------- | ------- | ---------------------------------------------------- |
| `success`        | boolean | Whether the request succeeded                        |
| `date`           | string  | The date key (YYYY-MM-DD) for this selection         |
| `image`          | string  | Direct URL to the anime image (hosted by AniList)    |
| `title`          | string  | Anime title (English preferred, romaji fallback)     |
| `animeId`        | number  | AniList anime ID                                     |
| `imageType`      | string  | Image source field (`coverImage` or `bannerImage`)   |
| `format`         | string  | Anime format (TV, MOVIE, OVA, etc.)                  |
| `source`         | string  | Always `"AniList"`                                   |
| `cached`         | boolean | `true` if returned from storage, `false` if freshly selected |
| `nextRotationAt` | string  | ISO timestamp of next image rotation (next midnight) |

#### `GET /anime.jpg` (or `GET /api/daily-anime/image`)

A **self-hosted, ESP32-optimized direct image URL** designed specifically for microcontrollers (ESP32 / ESP8266), e-ink displays, digital photo frames, and direct browser embeds.

- **ESP32 Compressed (~10–25 KB):** The server automatically resizes and compresses the image into a **baseline JPEG** (e.g. 224x320, ~17 KB instead of 566 KB).
- **RAM-Safe for Microcontrollers:** Standard ESP32 JPEG decoders (such as `TJpgDec` or `JPEGDEC`) can decode this baseline JPEG MCU-block-by-block with **< 4 KB of RAM** without causing out-of-memory crashes.
- **Downloaded Locally:** The server downloads and compresses today's image once and stores it on disk (`public/anime.jpg` and `data/images/`).
- **Our Own Direct URL:** Served directly from your server without proxy latency or upstream CDN redirects.
- **Stable URL:** The URL remains strictly `http://<your-host>/anime.jpg` forever.
- **Daily Rotation:** The local file automatically refreshes with the new anime image at midnight.
- **Custom Resizing On-the-Fly:** Supports optional query parameters on `/api/daily-anime/image` like `?w=240&h=240&q=70` for specific screen resolutions.
- Rotation-aligned `Cache-Control` header ensures caches invalidate right at midnight.

### How Daily Selection Works

1. On the first request of each calendar day, the API queries AniList for popular anime.
2. One candidate is selected using a deterministic hash of the date.
3. The selection is persisted in SQLite with an `INSERT OR IGNORE` to guarantee concurrency safety.
4. All subsequent requests on the same day read from the database — no additional AniList calls.
5. When the calendar date changes (determined server-side using the configured timezone), a new selection is automatically created.

### Timezone

The timezone used to determine "today" is configured via `DAILY_ANIME_TIMEZONE`. **Default: UTC.**

The server clock determines the date — the client's timezone is never used.

### Persistent Storage

**SQLite** (via `better-sqlite3`) is used as the persistent store.

- **Database file:** `./data/daily-anime.db` (configurable)
- **Concurrency safety:** `INSERT OR IGNORE` ensures only the first insert wins; subsequent concurrent inserts are no-ops
- **WAL mode** is enabled for better concurrent read performance
- The database survives server restarts

> **Note:** SQLite is ideal for single-instance deployments. For multi-instance production (e.g., multiple serverless containers), replace with a shared database (PostgreSQL, Redis, etc.).

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable                         | Default                  | Description                              |
| -------------------------------- | ------------------------ | ---------------------------------------- |
| `DAILY_ANIME_TIMEZONE`          | `UTC`                    | IANA timezone for determining "today"    |
| `DAILY_ANIME_IMAGE_TYPE`        | `coverImage`             | `coverImage` or `bannerImage`            |
| `DAILY_ANIME_POOL_SIZE`         | `50`                     | Number of AniList candidates per query   |
| `DAILY_ANIME_MIN_POPULARITY`    | `0`                      | Minimum popularity filter                |
| `DAILY_ANIME_ENABLE_HISTORY`    | `false`                  | Avoid recently selected anime            |
| `DAILY_ANIME_HISTORY_LOOKBACK`  | `7`                      | Days of history to exclude               |
| `DAILY_ANIME_DB_PATH`           | `./data/daily-anime.db`  | SQLite database file path                |
| `DAILY_ANIME_ANILIST_TIMEOUT`   | `10000`                  | AniList request timeout (ms)             |

No API keys or credentials are required — AniList's public GraphQL API is used.

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment config (optional — defaults work out of the box)
cp .env.example .env.local

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

Test the Daily Anime API:

```bash
curl -i http://localhost:3000/api/daily-anime
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Testing Daily Rotation

The `getDailyAnime` function accepts an injectable `now` parameter for testing. In the test suite, date changes are simulated by passing different `Date` objects:

```js
const day1 = await getDailyAnime({ now: new Date("2026-10-22T12:00:00Z") });
const day2 = await getDailyAnime({ now: new Date("2026-10-23T12:00:00Z") });
```

To manually test rotation, delete today's database record:

```bash
sqlite3 ./data/daily-anime.db "DELETE FROM daily_selections WHERE date_key = '2026-10-22';"
curl http://localhost:3000/api/daily-anime
```

## Deployment

### Vercel

The easiest way to deploy is to use [Vercel](https://vercel.com). However, note:

- **SQLite requires a persistent filesystem.** Vercel's serverless functions have an ephemeral filesystem.
- For Vercel, replace the SQLite layer with [Vercel KV](https://vercel.com/storage/kv), [Vercel Postgres](https://vercel.com/storage/postgres), or an external database.

### Self-hosted / VPS

SQLite works perfectly for single-instance deployments:

```bash
npm run build
npm start
```

The `./data/` directory must be persistent and writable.

## Architecture

```
src/app/
├── api/
│   └── daily-anime/
│       ├── route.js          # GET /api/daily-anime (JSON)
│       └── image/
│           └── route.js      # GET /api/daily-anime/image (proxy)
├── lib/
│   ├── config.js             # Configuration & environment variables
│   ├── db.js                 # SQLite persistence layer
│   ├── anilist.js            # AniList GraphQL client
│   └── daily-anime.js        # Core daily selection logic
└── __tests__/
    └── daily-anime.test.js   # Comprehensive test suite
```

## Limitations

- **Image availability:** Images are hosted by AniList. If AniList removes or changes an image URL, the cached URL may break for the remainder of the day.
- **Repeat selections:** Without history enabled (`DAILY_ANIME_ENABLE_HISTORY=true`), the same anime may be selected on different days. With history enabled, repeats are avoided for the configured lookback period.
- **SQLite single-instance:** The default SQLite storage is not shared across multiple server instances. For multi-instance deployments, switch to a shared database.

