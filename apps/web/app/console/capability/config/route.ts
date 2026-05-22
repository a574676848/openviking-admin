import { NextResponse } from "next/server";

const CAPABILITY_CONFIG_MISSING_MESSAGE =
  "服务端未配置 BACKEND_URL，无法生成凭证中心地址。";

export const runtime = "nodejs";

export async function GET() {
  const backendBaseUrl = process.env.BACKEND_URL;

  if (!backendBaseUrl) {
    return NextResponse.json(
      { message: CAPABILITY_CONFIG_MISSING_MESSAGE },
      { status: 500 },
    );
  }

  const backendOrigin = resolveBackendOrigin(backendBaseUrl);
  const apiBaseUrl = `${backendOrigin}/api/v1`;

  return NextResponse.json({
    apiBaseUrl,
    sseUrl: `${apiBaseUrl}/mcp/sse`,
  });
}

function resolveBackendOrigin(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return baseUrl.replace(/\/+$/, "");
  }
}
