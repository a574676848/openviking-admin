import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL;
const PUBLIC_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || BACKEND_URL;
const isDevLike = process.env.NODE_ENV !== "production";

if (!BACKEND_URL) {
  throw new Error(
    "BACKEND_URL 环境变量未设置。生产环境必须显式配置，例如 BACKEND_URL=https://api.example.com",
  );
}

const cspHeader = [
  "default-src 'self'",
  isDevLike
    ? `connect-src 'self' ${BACKEND_URL} ws: wss: http://127.0.0.1:* http://localhost:*`
    : `connect-src 'self' ${BACKEND_URL}`,
  isDevLike ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BACKEND_URL: PUBLIC_BACKEND_URL,
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
