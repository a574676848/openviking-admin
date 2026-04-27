const TOKEN_STORAGE_KEY = "ov_token";
const TOKEN_ISSUED_AT_KEY = "ov_token_iat";
const USER_STORAGE_KEY = "ov_user";
/** token 最大有效期 (小时)，超期后需重新登录 */
const TOKEN_MAX_AGE_HOURS = 24;

export { TOKEN_STORAGE_KEY };

type SessionUser = {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function writeSessionTokenToStorage(targetStorage: Storage, token: string): void {
  targetStorage.setItem(TOKEN_STORAGE_KEY, token);
  targetStorage.setItem(TOKEN_ISSUED_AT_KEY, String(Date.now()));
}

export function readSessionToken(): string | null {
  if (!isBrowser()) return null;
  const issuedAt = sessionStorage.getItem(TOKEN_ISSUED_AT_KEY);
  if (issuedAt) {
    const elapsed = Date.now() - parseInt(issuedAt, 10);
    if (elapsed > TOKEN_MAX_AGE_HOURS * 3600_000) {
      clearSessionToken();
      return null;
    }
  }
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function writeSessionToken(token: string): void {
  if (!isBrowser()) return;
  writeSessionTokenToStorage(sessionStorage, token);
}

export function writeSessionTokenToWindow(targetWindow: Window, token: string): void {
  writeSessionTokenToStorage(targetWindow.sessionStorage, token);
}

export function readSessionUser(): SessionUser | null {
  if (!isBrowser()) return null;
  const raw = sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    sessionStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function writeSessionUser(user: SessionUser): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearSessionToken(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_ISSUED_AT_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

/** 登出时清理所有会话相关状态 */
export function destroySession(): void {
  clearSessionToken();
  if (isBrowser()) {
    window.location.assign("/login");
  }
}
