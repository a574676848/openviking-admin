import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL_MISSING_MESSAGE =
  "服务端未配置 BACKEND_URL，无法代理 API 请求。";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function proxyRequest(request: NextRequest) {
  const backendBaseUrl =
    process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendBaseUrl) {
    return NextResponse.json(
      { message: BACKEND_URL_MISSING_MESSAGE },
      { status: 500 },
    );
  }

  const targetUrl = buildTargetUrl(backendBaseUrl, request);
  const headers = cloneProxyHeaders(request.headers);
  const body = shouldForwardBody(request.method)
    ? await request.arrayBuffer()
    : undefined;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: cloneProxyHeaders(response.headers),
  });
}

function buildTargetUrl(baseUrl: string, request: NextRequest) {
  const backendOrigin = normalizeBackendOrigin(baseUrl);
  return new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    backendOrigin,
  );
}

function normalizeBackendOrigin(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return baseUrl.replace(/\/+$/, "");
  }
}

function shouldForwardBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}

function cloneProxyHeaders(source: Headers) {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
