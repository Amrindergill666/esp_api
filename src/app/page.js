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

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function CountdownTimer({ targetIso }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetIso) return;

    function update() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ h: 0, m: 0, s: 0 });
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ h, m, s });
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!timeLeft) return <span className="text-zinc-500">--:--:--</span>;

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <span className="font-mono text-lg tracking-wider">
      <span className="text-violet-400">{pad(timeLeft.h)}</span>
      <span className="timer-colon text-zinc-500">:</span>
      <span className="text-violet-400">{pad(timeLeft.m)}</span>
      <span className="timer-colon text-zinc-500">:</span>
      <span className="text-violet-400">{pad(timeLeft.s)}</span>
    </span>
  );
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
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [httpStatus, setHttpStatus] = useState(null);
  const [headers, setHeaders] = useState(null);
  const [requestCount, setRequestCount] = useState(0);
  const [imageProxyStatus, setImageProxyStatus] = useState("idle");
  const [imageProxyHeaders, setImageProxyHeaders] = useState(null);
  const [showImageProxy, setShowImageProxy] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const imageRef = useRef(null);

  const fetchDailyAnime = useCallback(async () => {
    setStatus("loading");
    setError(null);
    const start = performance.now();

    try {
      const res = await fetch("/api/daily-anime", { cache: "no-store" });
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setHttpStatus(res.status);

      // Capture response headers
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
    setImageProxyHeaders(null);

    try {
      const res = await fetch("/api/daily-anime/image?proxy=true", {
        method: "HEAD",
        cache: "no-store",
      });

      const hdrs = {};
      res.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      setImageProxyHeaders(hdrs);

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

  // Auto-fetch on mount
  useEffect(() => {
    fetchDailyAnime();
  }, [fetchDailyAnime]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 grid-bg">
      {/* Header */}
      <header className="border-b border-zinc-800/60 backdrop-blur-md bg-zinc-950/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-linear-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Daily Anime <span className="gradient-text">API</span>
              </h1>
              <p className="text-xs text-zinc-500">AniList-powered daily image selector</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            {responseTime !== null && (
              <span className="text-xs text-zinc-500 font-mono">{responseTime}ms</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="HTTP Status" value={httpStatus || "—"} color={httpStatus === 200 ? "text-emerald-400" : httpStatus ? "text-red-400" : "text-zinc-500"} />
          <StatCard label="Response Time" value={responseTime !== null ? `${responseTime}ms` : "—"} color={responseTime && responseTime < 200 ? "text-emerald-400" : responseTime && responseTime < 1000 ? "text-amber-400" : "text-zinc-500"} />
          <StatCard label="Requests Made" value={requestCount} color="text-violet-400" />
          <StatCard label="Cached" value={data?.cached != null ? (data.cached ? "Yes" : "No") : "—"} color={data?.cached ? "text-emerald-400" : data?.cached === false ? "text-amber-400" : "text-zinc-500"} />
        </div>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          {/* Left Column: Image + Details */}
          <div className="flex flex-col gap-6">
            {/* Anime Image Card */}
            <div className="glass-card gradient-border p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Today&apos;s Selection</h2>
                {data?.date && (
                  <span className="text-xs font-medium text-violet-300 bg-violet-950/60 border border-violet-800/50 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
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
                    title="Click to open direct AniList CDN image in new tab"
                    className="relative group shrink-0 cursor-pointer block"
                  >
                    <div className="overflow-hidden rounded-lg shadow-2xl shadow-black/50 w-full sm:w-64">
                      <img
                        src={data.image}
                        alt={data.title}
                        className="w-full object-cover animate-image-reveal transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    {/* Image overlay on hover */}
                    <div className="absolute inset-0 rounded-lg bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-medium">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span>Open Direct Image</span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">{data.imageType}</span>
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

                      {/* Direct Link Banner */}
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 mb-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Our Own Direct Image URL
                          </span>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/anime.jpg`;
                              navigator.clipboard.writeText(url);
                            }}
                            className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy Direct URL
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 rounded text-[10px] font-mono font-medium shrink-0">
                            LOCAL DISK
                          </span>
                          <p className="font-mono text-xs text-zinc-300 break-all select-all">
                            /anime.jpg
                          </p>
                        </div>
                        {data.upstreamImageUrl && (
                          <div className="pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="truncate">Source: AniList CDN</span>
                            <a
                              href={data.upstreamImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-400 hover:text-zinc-200 underline ml-2 shrink-0"
                            >
                              View upstream
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Countdown */}
                    <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                      <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider">Next rotation in</p>
                      <CountdownTimer targetIso={data.nextRotationAt} />
                      <p className="text-xs text-zinc-600 mt-1.5 font-mono">
                        {data.nextRotationAt}
                      </p>
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-48 rounded-lg border border-red-900/30 bg-red-950/20">
                  <div className="text-center">
                    <svg className="w-10 h-10 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {data?.image && (
                <a
                  href={data.image}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glow-btn px-5 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition-all duration-200"
                >
                  <span className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Direct Image Link
                  </span>
                </a>
              )}

              <a
                href="/anime.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-lineear-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Open /anime.jpg
                </span>
              </a>

              <button
                onClick={testImageProxy}
                disabled={imageProxyStatus === "loading"}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-lg text-sm font-medium text-zinc-300 transition-all duration-200 disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Stream Bytes (?proxy=true)
                </span>
              </button>

              <button
                onClick={fetchDailyAnime}
                disabled={status === "loading"}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-lg text-sm font-medium text-zinc-300 disabled:opacity-50 transition-all duration-200"
              >
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Refresh JSON
                  </span>
                )}
              </button>

              <a
                href="/api/daily-anime"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open Raw JSON
                </span>
              </a>
            </div>

            {/* Image Proxy Test Card */}
            {showImageProxy && (
              <div className="glass-card gradient-border p-6 animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Image Proxy Response</h2>
                  <StatusBadge status={imageProxyStatus} />
                </div>

                <div className="rounded-lg overflow-hidden shadow-2xl shadow-black/50 mb-4">
                  <img
                    key={imageKey}
                    ref={imageRef}
                    src={`/api/daily-anime/image?proxy=true&t=${imageKey}`}
                    alt="Proxied anime image"
                    className="w-full max-h-96 object-contain bg-zinc-900 animate-image-reveal"
                  />
                </div>

                {imageProxyHeaders && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Response Headers</p>
                    {Object.entries(imageProxyHeaders).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs font-mono">
                        <span className="text-violet-400 shrink-0">{k}:</span>
                        <span className="text-zinc-400 truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Response Inspector */}
          <div className="flex flex-col gap-6">
            {/* Response Body */}
            <div className="glass-card gradient-border p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Response Body</h2>
                {data && (
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy
                  </button>
                )}
              </div>

              {status === "loading" && !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="h-4 shimmer rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                  ))}
                </div>
              ) : data ? (
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

            {/* Response Headers */}
            {headers && (
              <div className="glass-card gradient-border p-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Response Headers</h2>
                <div className="space-y-2 custom-scrollbar max-h-64 overflow-y-auto">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs font-mono group">
                      <span className="text-violet-400 shrink-0 min-w-0">{key}<span className="text-zinc-600">:</span></span>
                      <span className="text-zinc-400 truncate group-hover:text-zinc-200 transition-colors cursor-default" title={value}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Endpoint Reference */}
            <div className="glass-card gradient-border p-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Endpoint Reference</h2>
              <div className="space-y-4">
                <EndpointItem
                  method="GET"
                  path="/anime.jpg"
                  description="ESP32-compressed baseline JPEG (~17 KB, max 320px) — decodable in < 4 KB RAM on microcontrollers"
                  badge="ESP32 Optimized"
                />
                <EndpointItem
                  method="GET"
                  path="/api/daily-anime/image?w=240&h=240"
                  description="On-the-fly custom dimensions & quality for specific display resolutions (e.g. 240x240, 128x160)"
                  badge="Custom Resizing"
                />
                <EndpointItem
                  method="GET"
                  path="/api/daily-anime"
                  description="Returns today's selected anime metadata + directUrl as JSON"
                />
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-800/50 space-y-2">
                <p className="text-xs text-zinc-500">Quick Test (copy to terminal)</p>
                <div className="bg-zinc-900/50 rounded-lg p-2.5 font-mono text-xs text-zinc-400 overflow-x-auto custom-scrollbar">
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-zinc-300">curl -I http://localhost:3000/anime.jpg</span>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-2.5 font-mono text-xs text-zinc-400 overflow-x-auto custom-scrollbar">
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-zinc-300">curl -i http://localhost:3000/api/daily-anime</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-zinc-600">
            Powered by{" "}
            <a href="https://anilist.gitbook.io/anilist-apiv2-docs" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              AniList GraphQL API
            </a>
          </p>
          <p className="text-xs text-zinc-700">
            Built with Next.js · SQLite persistence · Zero config required
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
