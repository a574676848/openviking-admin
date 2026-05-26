import type { NextConfig } from "next";

const isDevLike = process.env.NODE_ENV !== "production";

function readConnectSrcAllowList(): string {
  const rawValue = process.env.CSP_CONNECT_SRC?.trim();
  if (!rawValue) {
    return "";
  }

  return rawValue
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

const cspHeader = [
  "default-src 'self'",
  isDevLike
    ? "connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*"
    : `connect-src 'self' ${readConnectSrcAllowList()}`.trim(),
  isDevLike
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
