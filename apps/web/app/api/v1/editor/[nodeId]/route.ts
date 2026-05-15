import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL_MISSING_MESSAGE =
  "服务端未配置 BACKEND_URL，无法生成协作文档元数据。";
const COLLAB_PROTOCOL_HTTP = "http:";
const COLLAB_PROTOCOL_HTTPS = "https:";
const COLLAB_PROTOCOL_WS = "ws:";
const COLLAB_PROTOCOL_WSS = "wss:";
function normalizeBackendOrigin(baseUrl: string) {
  const parsed = new URL(baseUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

function resolveCollabProtocol(protocol: string): string {
  if (protocol === COLLAB_PROTOCOL_HTTPS) {
    return COLLAB_PROTOCOL_WSS;
  }
  if (protocol === COLLAB_PROTOCOL_HTTP) {
    return COLLAB_PROTOCOL_WS;
  }
  return COLLAB_PROTOCOL_WS;
}

function buildCollabServerUrl(baseUrl: string, collabPath: string): string {
  const url = new URL(normalizeBackendOrigin(baseUrl));
  url.protocol = resolveCollabProtocol(url.protocol);
  url.pathname = collabPath.startsWith("/") ? collabPath : `/${collabPath}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const backendBaseUrl = process.env.BACKEND_URL;
  if (!backendBaseUrl) {
    return NextResponse.json(
      { message: BACKEND_URL_MISSING_MESSAGE },
      { status: 500 },
    );
  }

  const { nodeId } = await context.params;
  const targetUrl = new URL(
    `/api/v1/editor/${encodeURIComponent(nodeId)}${request.nextUrl.search}`,
    normalizeBackendOrigin(backendBaseUrl),
  );
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
    redirect: "manual",
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  const payload = await response.json();
  if (payload?.data?.collab?.path) {
    payload.data.collab.serverUrl = buildCollabServerUrl(
      backendBaseUrl,
      payload.data.collab.path,
    );
  }

  return NextResponse.json(payload, { status: response.status });
}
