type JsonBody = BodyInit | Record<string, unknown> | unknown[] | null | undefined;
import { destroySession, readSessionToken } from "./session";

type ApiErrorPayload = {
  message?: string;
  error?: {
    code?: string;
    message?: string;
    statusCode?: number;
  };
  [key: string]: unknown;
};

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
  traceId?: string;
  error: null | {
    code?: string;
    message?: string;
    statusCode?: number;
  };
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function normalizeBody(body: JsonBody) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams) return body;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const payload = await response.json();
    return typeof payload === "object" && payload !== null ? payload as ApiErrorPayload : { message: response.statusText };
  } catch {
    return { message: response.statusText };
  }
}

function normalizeEndpoint(endpoint: string) {
  if (endpoint.startsWith("/api/v1")) return endpoint;
  return `/api/v1${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function isEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "data" in payload &&
      "error" in payload &&
      "meta" in payload &&
      "traceId" in payload,
  );
}

export const apiClient = {
  async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = readSessionToken();
    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    const url = normalizeEndpoint(endpoint);
    const response = await fetch(url, config);

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        destroySession();
        return {} as T;
      }
      const errorData = await readErrorPayload(response);
      const message = errorData.error?.message || errorData.message || "请求失败";
      throw new ApiError(response.status, message, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const payload = (await response.json()) as T | ApiEnvelope<T>;
    if (isEnvelope<T>(payload)) {
      return payload.data;
    }

    return payload as T;
  },

  get<T = unknown>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  },

  post<T = unknown>(endpoint: string, body: JsonBody, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: normalizeBody(body),
    });
  },

  patch<T = unknown>(endpoint: string, body: JsonBody, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: normalizeBody(body),
    });
  },

  delete<T = unknown>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
};
