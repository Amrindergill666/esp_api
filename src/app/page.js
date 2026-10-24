"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── JSON Syntax Highlighter ──────────────────────────────────────────────────

function highlightJson(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  if (obj === null) return `<span class="json-null">null</span>`;
  if (typeof obj === "boolean")
    return `<span class="json-bool">${obj}</span>`;
  if (typeof obj === "number")
    return `<span class="json-number">${obj}</span>`;
  if (typeof obj === "string")
    return `<span class="json-string">"${escapeHtml(obj)}"</span>`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `<span class="json-bracket">[]</span>`;
    const items = obj
      .map((v) => `${pad}  ${highlightJson(v, indent + 1)}`)
      .join(",\n");
    return `<span class="json-bracket">[</span>\n${items}\n${pad}<span class="json-bracket">]</span>`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return `<span class="json-bracket">{}</span>`;
  const entries = keys
    .map(
      (k) =>
        `${pad}  <span class="json-key">"${escapeHtml(k)}"</span>: ${highlightJson(obj[k], indent + 1)}`
    )
    .join(",\n");
  return `<span class="json-bracket">{</span>\n${entries}\n${pad}<span class="json-bracket">}</span>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    idle: { color: "bg-zinc-800 text-zinc-400", dot: "bg-zinc-500", label: "Idle" },
    loading: { color: "bg-indigo-950 text-indigo-300", dot: "bg-indigo-400", label: "Fetching…" },
    success: { color: "bg-emerald-950 text-emerald-300", dot: "bg-emerald-400", label: "Success" },
    error: { color: "bg-red-950 text-red-300", dot: "bg-red-400", label: "Error" },
  };
  const { color, dot, label } = config[status] || config.idle;

  return (
    <span className={`status-badge ${color}`}>
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dot} ${status === "loading" ? "pulse-dot" : ""}`}
      />
      {label}
    </span>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState("music"); // "music" or "anime"

  // ─── Song / iTunes State ───
  const [songQuery, setSongQuery] = useState("Blinding Lights");
  const [albumQuery, setAlbumQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("The Weeknd");
  const [thumbSize, setThumbSize] = useState("130");
  const [songData, setSongData] = useState(null);
  const [songStatus, setSongStatus] = useState("idle");
  const [songError, setSongError] = useState(null);
  const [songResponseTime, setSongResponseTime] = useState(null);
  const [songHttpStatus, setSongHttpStatus] = useState(null);
  const [songHeaders, setSongHeaders] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // ─── Daily Anime State ───
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [httpStatus, setHttpStatus] = useState(null);
  const [headers, setHeaders] = useState(null);
  const [requestCount, setRequestCount] = useState(0);
  const [imageProxyStatus, setImageProxyStatus] = useState("idle");
  const [showImageProxy, setShowImageProxy] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const imageRef = useRef(null);

  // ─── Search Song Track ───
  const searchSong = useCallback(async (songOverride, artistOverride, sizeOverride, albumOverride) => {
    setSongStatus("loading");
    setSongError(null);
    const start = performance.now();

    const s = songOverride !== undefined ? songOverride : songQuery;
    const alb = albumOverride !== undefined ? albumOverride : albumQuery;
    const a = artistOverride !== undefined ? artistOverride : artistQuery;
    const sz = sizeOverride !== undefined ? sizeOverride : thumbSize;

    try {
      const params = new URLSearchParams();
      if (s) params.set("song", s);
      if (alb) params.set("album", alb);
      if (a) params.set("artist", a);
      if (sz) params.set("size", sz);
      params.set("format", "json");

      const res = await fetch(`/api/song?${params.toString()}`);
      const elapsed = Math.round(performance.now() - start);
      setSongResponseTime(elapsed);
      setSongHttpStatus(res.status);

      const hdrs = {};
      res.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      setSongHeaders(hdrs);

      const json = await res.json();
      if (!res.ok) {
        setSongError(json.error || `HTTP ${res.status}`);
        setSongStatus("error");
        return;
      }

      setSongData(json);
      setSongStatus("success");
    } catch (err) {
      setSongError(err.message);
      setSongStatus("error");
      setSongResponseTime(Math.round(performance.now() - start));
    }
  }, [songQuery, albumQuery, artistQuery, thumbSize]);

  // ─── Fetch Daily Anime ───
  const fetchDailyAnime = useCallback(async () => {
    setStatus("loading");
    setError(null);
    const start = performance.now();

    try {
      const res = await fetch("/api/daily-anime", { cache: "no-store" });
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setHttpStatus(res.status);

      const hdrs = {};
      res.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      setHeaders(hdrs);

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setStatus("error");
        return;
      }

      setData(json);
      setStatus("success");
      setRequestCount((c) => c + 1);
    } catch (err) {
      setError(err.message);
      setStatus("error");
      setResponseTime(Math.round(performance.now() - start));
    }
  }, []);

  const testImageProxy = useCallback(async () => {
    setImageProxyStatus("loading");
    try {
      const res = await fetch("/api/daily-anime/image?proxy=true", {
        method: "HEAD",
        cache: "no-store",
      });
      if (res.ok) {
        setImageProxyStatus("success");
        setShowImageProxy(true);
        setImageKey((k) => k + 1);
      } else {
        setImageProxyStatus("error");
      }
    } catch {
      setImageProxyStatus("error");
    }
  }, []);

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      searchSong("Blinding Lights", "The Weeknd", "100");
      fetchDailyAnime();
    }, 0);
    return () => clearTimeout(timer);
  }, [searchSong, fetchDailyAnime]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 grid-bg">
      {/* Header */}
      <header className="border-b border-zinc-800/60 backdrop-blur-md bg-zinc-950/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-linear-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                ESP <span className="gradient-text">API</span> Suite
              </h1>
              <p className="text-xs text-zinc-500">Fast endpoints for microcontrollers & Bluetooth displays</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80">
            <button
              onClick={() => setActiveTab("music")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "music"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🎵 Song Artwork API
            </button>
            <button
              onClick={() => setActiveTab("anime")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "anime"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ✨ Daily Anime API
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "music" ? (
          /* ─── SONG ARTWORK TAB ─── */
          <div>
            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="HTTP Status"
                value={songHttpStatus || "—"}
                color={songHttpStatus === 200 ? "text-emerald-400" : songHttpStatus ? "text-red-400" : "text-zinc-500"}
              />
              <StatCard
                label="Response Time"
                value={songResponseTime !== null ? `${songResponseTime}ms` : "—"}
                color={songResponseTime && songResponseTime < 200 ? "text-emerald-400" : songResponseTime && songResponseTime < 1000 ? "text-amber-400" : "text-zinc-500"}
              />
              <StatCard
                label="Thumbnail Size"
                value={`${thumbSize}x${thumbSize}`}
                color="text-violet-400"
              />
              <StatCard
                label="Cache State"
                value={songData?.cached ? "Cached" : songData ? "Live iTunes" : "—"}
                color={songData?.cached ? "text-emerald-400" : "text-amber-400"}
              />
            </div>

            <div className="dashboard-grid">
              {/* Left Column: Form & Thumbnail Result */}
              <div className="flex flex-col gap-6">
                {/* Search Form Card */}
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                      Search Song Artwork
                    </h2>
                    <StatusBadge status={songStatus} />
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      searchSong();
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Song Title (optional if Album given)
                        </label>
                        <input
                          type="text"
                          value={songQuery}
                          onChange={(e) => setSongQuery(e.target.value)}
                          placeholder="e.g. Blinding Lights"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Album Name (optional)
                        </label>
                        <input
                          type="text"
                          value={albumQuery}
                          onChange={(e) => setAlbumQuery(e.target.value)}
                          placeholder="e.g. After Hours"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Artist Name (optional)
                        </label>
                        <input
                          type="text"
                          value={artistQuery}
                          onChange={(e) => setArtistQuery(e.target.value)}
                          placeholder="e.g. The Weeknd"
                          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">Thumbnail Size:</span>
                        {["60", "100", "130", "240", "500"].map((sz) => (
                          <button
                            type="button"
                            key={sz}
                            onClick={() => {
                              setThumbSize(sz);
                              searchSong(undefined, undefined, sz);
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                              thumbSize === sz
                                ? "bg-violet-600 text-white font-semibold"
                                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {sz}x{sz}
                          </button>
                        ))}
                      </div>

                      <button
                        type="submit"
                        disabled={songStatus === "loading"}
                        className="px-5 py-2 bg-linear-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg text-sm font-medium text-white shadow-lg shadow-violet-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {songStatus === "loading" ? "Searching…" : "Fetch Artwork"}
                      </button>
                    </div>

                    {/* Quick Presets */}
                    <div className="pt-3 border-t border-zinc-800/60 flex items-center gap-2 flex-wrap text-xs text-zinc-500">
                      <span>Quick presets:</span>
                      {[
                        { title: "Blinding Lights", artist: "The Weeknd", album: "" },
                        { title: "", album: "After Hours", artist: "The Weeknd" },
                        { title: "", album: "Divide", artist: "Ed Sheeran" },
                        { title: "Levitating", artist: "Dua Lipa", album: "" },
                      ].map((item) => (
                        <button
                          type="button"
                          key={item.album || item.title}
                          onClick={() => {
                            setSongQuery(item.title);
                            setAlbumQuery(item.album);
                            setArtistQuery(item.artist);
                            searchSong(item.title, item.artist, undefined, item.album);
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {item.album ? `Album: ${item.album}` : item.title}
                        </button>
                      ))}
                    </div>
                  </form>
                </div>

                {/* Song Artwork Result Card */}
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                      Artwork & Thumbnail Result
                    </h2>
                    {songData?.trackName && (
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-full">
                        Track ID: {songData.trackId}
                      </span>
                    )}
                  </div>

                  {songStatus === "loading" && !songData ? (
                    <div className="flex gap-4 items-center animate-pulse">
                      <div className="w-28 h-28 bg-zinc-800 rounded-lg shrink-0" />
                      <div className="space-y-2 flex-1">
                        <div className="h-5 bg-zinc-800 rounded w-1/2" />
                        <div className="h-4 bg-zinc-800/70 rounded w-1/3" />
                        <div className="h-4 bg-zinc-800/50 rounded w-2/3" />
                      </div>
                    </div>
                  ) : songData ? (
                    <div className="space-y-5">
                      <div className="flex flex-col sm:flex-row gap-5 items-start">
                        {/* Thumbnail Image */}
                        <div className="relative group shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={songData.thumbnail}
                            alt={songData.trackName || "Album Artwork"}
                            className="w-28 h-28 object-cover rounded-lg shadow-xl shadow-black/60 border border-zinc-700/50"
                          />
                          <a
                            href={songData.thumbnail}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-[11px] font-medium text-zinc-200"
                          >
                            Open ↗
                          </a>
                        </div>

                        {/* Song Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-bold tracking-tight text-white truncate">
                            {songData.trackName}
                          </h3>
                          <p className="text-sm text-violet-300 font-medium truncate mb-2">
                            {songData.artistName}
                          </p>
                          <p className="text-xs text-zinc-400 truncate mb-3">
                            Album: <span className="text-zinc-300">{songData.albumName || "—"}</span>
                          </p>

                          <div className="flex flex-wrap gap-2 text-xs">
                            {songData.primaryGenreName && (
                              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/40">
                                {songData.primaryGenreName}
                              </span>
                            )}
                            {songData.releaseDate && (
                              <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/40 font-mono">
                                {songData.releaseDate.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Small Thumbnail Link Banner */}
                      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Small Thumbnail Link
                          </span>
                          <button
                            onClick={() => handleCopy(songData.thumbnail)}
                            className="text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded transition-colors flex items-center gap-1.5"
                          >
                            {copiedLink ? (
                              <span className="text-emerald-400">✓ Copied!</span>
                            ) : (
                              <span>Copy Thumbnail Link</span>
                            )}
                          </button>
                        </div>
                        <p className="font-mono text-xs text-zinc-300 break-all select-all bg-black/40 p-2 rounded border border-zinc-800/50">
                          {songData.thumbnail}
                        </p>
                      </div>

                      {/* Microcontroller Quick Links */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <a
                          href={`/api/song?term=${encodeURIComponent(songData.trackName + " " + songData.artistName)}&raw=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 rounded border border-zinc-700/50 flex items-center gap-1.5 transition-colors"
                        >
                          Raw URL Text (?raw=true) ↗
                        </a>
                        <a
                          href={`/api/song/image?term=${encodeURIComponent(songData.trackName + " " + songData.artistName)}&w=240&h=240`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-violet-300 rounded border border-zinc-700/50 flex items-center gap-1.5 transition-colors"
                        >
                          Baseline JPEG Stream (/image) ↗
                        </a>
                      </div>
                    </div>
                  ) : songError ? (
                    <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-sm font-mono">
                      {songError}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">Enter a song title to search</p>
                  )}
                </div>
              </div>

              {/* Right Column: JSON Inspector & ESP32 Code */}
              <div className="flex flex-col gap-6">
                {/* Response JSON */}
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                      JSON Response
                    </h2>
                    {songData && (
                      <button
                        onClick={() => handleCopy(JSON.stringify(songData, null, 2))}
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Copy JSON
                      </button>
                    )}
                  </div>

                  {songStatus === "loading" && !songData ? (
                    <div className="space-y-2">
                      {[75, 60, 85, 50, 65].map((width, i) => (
                        <div
                          key={i}
                          className="h-4 shimmer rounded"
                          style={{ width: `${width}%` }}
                        />
                      ))}
                    </div>
                  ) : songData ? (
                    <pre className="text-xs font-mono leading-relaxed overflow-x-auto custom-scrollbar whitespace-pre max-h-72">
                      <code dangerouslySetInnerHTML={{ __html: highlightJson(songData) }} />
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-600 italic">No response yet</p>
                  )}
                </div>

                {/* Response Headers */}
                {songHeaders && (
                  <div className="glass-card gradient-border p-6 animate-fade-in">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                      Response Headers
                    </h2>
                    <div className="space-y-1.5 custom-scrollbar max-h-40 overflow-y-auto">
                      {Object.entries(songHeaders).map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-xs font-mono">
                          <span className="text-violet-400 shrink-0">{key}:</span>
                          <span className="text-zinc-400 truncate">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Microcontroller & ESP32 Integration Guide */}
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                    ESP32 Bluetooth Player Integration
                  </h2>
                  <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                    Fetch thumbnail directly in Arduino C++ when a new track starts:
                  </p>
                  <pre className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg text-[11px] font-mono text-zinc-300 overflow-x-auto custom-scrollbar leading-relaxed">
{`HTTPClient http;
String url = "http://YOUR_SERVER_IP:3000/api/song?term=" + 
             urlEncode(songName + " " + artistName) + 
             "&size=100&raw=true";

http.begin(url);
if (http.GET() == HTTP_CODE_OK) {
  String thumbUrl = http.getString();
  // thumbUrl now has the direct Apple thumbnail link!
}
http.end();`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── DAILY ANIME TAB ─── */
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard label="HTTP Status" value={httpStatus || "—"} color={httpStatus === 200 ? "text-emerald-400" : httpStatus ? "text-red-400" : "text-zinc-500"} />
              <StatCard label="Response Time" value={responseTime !== null ? `${responseTime}ms` : "—"} color={responseTime && responseTime < 200 ? "text-emerald-400" : responseTime && responseTime < 1000 ? "text-amber-400" : "text-zinc-500"} />
              <StatCard label="Requests Made" value={requestCount} color="text-violet-400" />
              <StatCard label="Cached" value={data?.cached != null ? (data.cached ? "Yes" : "No") : "—"} color={data?.cached ? "text-emerald-400" : data?.cached === false ? "text-amber-400" : "text-zinc-500"} />
            </div>

            <div className="dashboard-grid">
              <div className="flex flex-col gap-6">
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Today&apos;s Selection</h2>
                    {data?.date && (
                      <span className="text-xs font-medium text-violet-300 bg-violet-950/60 border border-violet-800/50 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                        {formatDisplayDate(data.date)}
                      </span>
                    )}
                  </div>

                  {status === "loading" && !data ? (
                    <div className="aspect-3/4 max-h-120 rounded-lg shimmer" />
                  ) : data ? (
                    <div className="flex flex-col sm:flex-row gap-6">
                      <a
                        href={data.image}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group shrink-0 cursor-pointer block"
                      >
                        <div className="overflow-hidden rounded-lg shadow-2xl shadow-black/50 w-full sm:w-64">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={data.image}
                            alt={data.title}
                            className="w-full object-cover animate-image-reveal transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                      </a>

                      <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
                        <div>
                          <h3 className="text-2xl font-bold tracking-tight mb-2 leading-tight">
                            {data.title}
                          </h3>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {data.format && (
                              <span className="px-2.5 py-0.5 bg-violet-950/60 text-violet-300 rounded-full text-xs font-medium border border-violet-800/30">
                                {data.format}
                              </span>
                            )}
                            <span className="px-2.5 py-0.5 bg-indigo-950/60 text-indigo-300 rounded-full text-xs font-medium border border-indigo-800/30">
                              ID: {data.animeId}
                            </span>
                            <span className="px-2.5 py-0.5 bg-zinc-800/60 text-zinc-400 rounded-full text-xs font-medium border border-zinc-700/30">
                              {data.source}
                            </span>
                          </div>

                          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 mb-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                Direct Image URL
                              </span>
                              <button
                                onClick={() => handleCopy(`${window.location.origin}/anime.jpg`)}
                                className="text-[11px] text-zinc-400 hover:text-white bg-zinc-800 px-2 py-0.5 rounded"
                              >
                                Copy Direct URL
                              </button>
                            </div>
                            <p className="font-mono text-xs text-zinc-300">/anime.jpg</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={fetchDailyAnime}
                    disabled={status === "loading"}
                    className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300"
                  >
                    Refresh JSON
                  </button>
                  <button
                    onClick={testImageProxy}
                    disabled={imageProxyStatus === "loading"}
                    className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300"
                  >
                    Test Image Stream
                  </button>
                </div>

                {showImageProxy && (
                  <div className="glass-card gradient-border p-6 animate-fade-in">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Image Proxy Response</h2>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={imageKey}
                      ref={imageRef}
                      src={`/api/daily-anime/image?proxy=true&t=${imageKey}`}
                      alt="Proxy stream"
                      className="rounded-lg shadow-xl"
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Response Inspector */}
              <div className="flex flex-col gap-6">
                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Response Body</h2>
                  {data ? (
                    <pre className="text-sm font-mono leading-relaxed overflow-x-auto custom-scrollbar whitespace-pre">
                      <code dangerouslySetInnerHTML={{ __html: highlightJson(data) }} />
                    </pre>
                  ) : error ? (
                    <pre className="text-sm font-mono text-red-400 leading-relaxed overflow-x-auto custom-scrollbar">
                      <code dangerouslySetInnerHTML={{ __html: highlightJson({ success: false, error }) }} />
                    </pre>
                  ) : (
                    <p className="text-sm text-zinc-600 italic">No response yet</p>
                  )}
                </div>

                {headers && (
                  <div className="glass-card gradient-border p-6 animate-fade-in">
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Response Headers</h2>
                    <div className="space-y-2 custom-scrollbar max-h-64 overflow-y-auto">
                      {Object.entries(headers).map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-xs font-mono">
                          <span className="text-violet-400 shrink-0">{key}:</span>
                          <span className="text-zinc-400 truncate">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass-card gradient-border p-6 animate-fade-in">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Endpoint Reference</h2>
                  <div className="space-y-3">
                    <EndpointItem method="GET" path="/api/song?term=..." description="Searches iTunes and returns small thumbnail link" badge="Song / Music" />
                    <EndpointItem method="GET" path="/anime.jpg" description="ESP32-compressed baseline JPEG (~17 KB, max 320px)" badge="ESP32 Optimized" />
                    <EndpointItem method="GET" path="/api/daily-anime" description="Returns today's selected anime metadata" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-zinc-600">
            Powered by iTunes Search API & AniList GraphQL
          </p>
          <p className="text-xs text-zinc-700">
            Built with Next.js · ESP32 microcontrollers ready
          </p>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-card px-4 py-3">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-lg font-semibold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function EndpointItem({ method, path, description, badge }) {
  return (
    <div className="flex items-start gap-3">
      <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded text-xs font-bold font-mono shrink-0 mt-0.5">
        {method}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-mono text-zinc-200 truncate">{path}</p>
          {badge && (
            <span className="px-1.5 py-0.5 bg-violet-950/60 text-violet-300 border border-violet-800/40 rounded text-[10px] font-mono font-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
