type JsonBody = BodyInit | Record<string, unknown> | unknown[] | null | undefined;
import { destroySession, readSessionToken } from "./session";

type ApiErrorPayload = {
  message?: string;
  [key: string]: unknown;
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

    const url = endpoint.startsWith("/api") ? endpoint : `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const response = await fetch(url, config);

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        destroySession();
        return {} as T;
      }
      const errorData = await readErrorPayload(response);
      throw new ApiError(response.status, errorData.message || "请求失败", errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
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
