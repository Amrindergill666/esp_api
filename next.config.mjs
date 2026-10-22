/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  serverExternalPackages: ["better-sqlite3", "sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/anime.jpg",
        destination: "/api/daily-anime/image",
      },
      {
        source: "/anime.png",
        destination: "/api/daily-anime/image",
      },
    ];
  },
};

export default nextConfig;
