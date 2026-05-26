import type { NextConfig } from "next";

const isDevLike = process.env.NODE_ENV !== "production";

const CONNECT_SRC_ENV_SEPARATOR = /[\s,]+/;

function splitConnectSrc(value: string | undefined): string[] {
  return (value ?? "")
    .trim()
    .split(CONNECT_SRC_ENV_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveConnectSrcFromUrl(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  try {
    const url = new URL(value.trim());
    const httpSource = `${url.protocol}//${url.host}`;
    const websocketProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return [httpSource, `${websocketProtocol}//${url.host}`];
  } catch {
    return [];
  }
}

function readConnectSrcAllowList(): string {
  const sources = new Set([
    ...splitConnectSrc(process.env.CSP_CONNECT_SRC),
    ...resolveConnectSrcFromUrl(process.env.BACKEND_URL),
    ...resolveConnectSrcFromUrl(process.env.NEXT_PUBLIC_BACKEND_URL),
  ]);

  return [...sources].join(" ");
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
