const TOKEN_STORAGE_KEY = "ov_token";
const TOKEN_ISSUED_AT_KEY = "ov_token_iat";
/** token 最大有效期 (小时)，超期后需重新登录 */
const TOKEN_MAX_AGE_HOURS = 24;

export { TOKEN_STORAGE_KEY };

function isBrowser() {
  return typeof window !== "undefined";
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
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  sessionStorage.setItem(TOKEN_ISSUED_AT_KEY, String(Date.now()));
}

export function clearSessionToken(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_ISSUED_AT_KEY);
}

/** 登出时清理所有会话相关状态 */
export function destroySession(): void {
  clearSessionToken();
  if (isBrowser()) {
    window.location.assign("/login");
  }
}
