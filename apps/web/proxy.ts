import { NextResponse, type NextRequest } from "next/server";

const CONNECT_SRC_ENV_SEPARATOR = /[\s,]+/;
const CSP_HEADER_NAME = "Content-Security-Policy";

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

export function buildContentSecurityPolicy(): string {
  const backendBaseUrl =
    process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  const connectSources = new Set([
    "'self'",
    ...splitConnectSrc(process.env.CSP_CONNECT_SRC),
    ...resolveConnectSrcFromUrl(backendBaseUrl),
  ]);

  return [
    "default-src 'self'",
    `connect-src ${[...connectSources].join(" ")}`,
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set(CSP_HEADER_NAME, buildContentSecurityPolicy());
  return response;
}

export const config = {
  matcher: "/((?!api|_next/static|_next/image|favicon.ico).*)",
};
