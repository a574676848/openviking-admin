import { NextRequest, NextResponse } from "next/server";

const WEBDAV_CONFIG_MISSING_MESSAGE =
  "服务端未配置 BACKEND_URL，无法生成 WebDAV 地址。";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim() || "";

  if (!tenantId) {
    return NextResponse.json(
      { message: "缺少租户标识，无法生成 WebDAV 地址。" },
      { status: 400 },
    );
  }

  const webdavBaseUrl = process.env.BACKEND_URL;

  if (!webdavBaseUrl) {
    return NextResponse.json(
      { message: WEBDAV_CONFIG_MISSING_MESSAGE },
      { status: 500 },
    );
  }

  return NextResponse.json({
    webdavUrl: buildWebdavUrl(webdavBaseUrl, tenantId),
  });
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
