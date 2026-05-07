import { NextRequest, NextResponse } from "next/server";

const WEBDAV_PROXY_TIMEOUT_MS = 8000;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: "连接自检失败：请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const tenantId =
    typeof (payload as { tenantId?: unknown }).tenantId === "string"
      ? (payload as { tenantId: string }).tenantId.trim()
      : "";
  const apiKey =
    typeof (payload as { apiKey?: unknown }).apiKey === "string"
      ? (payload as { apiKey: string }).apiKey.trim()
      : "";

  if (!tenantId || !apiKey) {
    return NextResponse.json(
      { message: "连接自检失败：缺少租户标识或 API key。" },
      { status: 400 },
    );
  }

  const backendBaseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendBaseUrl) {
    return NextResponse.json(
      { message: "连接自检失败：服务端未配置 BACKEND_URL。" },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, WEBDAV_PROXY_TIMEOUT_MS);

  try {
    const webdavUrl = buildWebdavUrl(backendBaseUrl, tenantId);
    const response = await fetch(webdavUrl, {
      method: "PROPFIND",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${tenantId}:${apiKey}`).toString("base64")}`,
        Depth: "0",
      },
    });

    return NextResponse.json({ status: response.status });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { message: "连接自检失败：代理请求超时，请检查后端或网络连通性。" },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `连接自检失败：${error.message}`
            : "连接自检失败：代理请求未完成。",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildWebdavUrl(baseUrl: string, tenantId: string) {
  const origin = resolveBackendOrigin(baseUrl);
  const normalizedTenantId = encodeURIComponent(tenantId);
  return `${origin}/webdav/${normalizedTenantId}/`;
}

function resolveBackendOrigin(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return baseUrl.replace(/\/+$/, "");
  }
}