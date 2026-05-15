import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE,
  openKnowledgeSiteInNewTab,
} from "./knowledge-site-launch";

const {
  popupFocusMock,
  popupReplaceMock,
  readSessionTokenMock,
  readSessionUserMock,
  windowOpenMock,
  writeSessionTokenToWindowMock,
  writeSessionUserToWindowMock,
} = vi.hoisted(() => ({
  popupFocusMock: vi.fn(),
  popupReplaceMock: vi.fn(),
  readSessionTokenMock: vi.fn(),
  readSessionUserMock: vi.fn(),
  windowOpenMock: vi.fn(),
  writeSessionTokenToWindowMock: vi.fn(),
  writeSessionUserToWindowMock: vi.fn(),
}));

vi.mock("./session", () => ({
  readSessionToken: () => readSessionTokenMock(),
  readSessionUser: () => readSessionUserMock(),
  writeSessionTokenToWindow: (...args: unknown[]) =>
    writeSessionTokenToWindowMock(...args),
  writeSessionUserToWindow: (...args: unknown[]) =>
    writeSessionUserToWindowMock(...args),
}));

describe("openKnowledgeSiteInNewTab", () => {
  beforeEach(() => {
    popupFocusMock.mockReset();
    popupReplaceMock.mockReset();
    readSessionTokenMock.mockReset();
    readSessionUserMock.mockReset();
    windowOpenMock.mockReset();
    writeSessionTokenToWindowMock.mockReset();
    writeSessionUserToWindowMock.mockReset();

    vi.stubGlobal("window", {
      open: windowOpenMock,
    });
  });

  it("新标签页打开知识空间前会写入当前会话", () => {
    const popupWindow = {
      location: { replace: popupReplaceMock },
      focus: popupFocusMock,
      sessionStorage: window.sessionStorage,
    } as unknown as Window;
    windowOpenMock.mockReturnValue(popupWindow);
    readSessionTokenMock.mockReturnValue("access-token");
    readSessionUserMock.mockReturnValue({
      id: "user-1",
      username: "alice",
      role: "tenant_admin",
      tenantId: "tenant-a",
    });

    const opened = openKnowledgeSiteInNewTab("/site/kb-1");

    expect(opened).toBe(true);
    expect(writeSessionTokenToWindowMock).toHaveBeenCalledWith(
      popupWindow,
      "access-token",
    );
    expect(writeSessionUserToWindowMock).toHaveBeenCalledWith(
      popupWindow,
      expect.objectContaining({
        username: "alice",
      }),
    );
    expect(popupReplaceMock).toHaveBeenCalledWith("/site/kb-1");
    expect(popupFocusMock).toHaveBeenCalledTimes(1);
  });

  it("浏览器拦截新标签页时返回 false", () => {
    windowOpenMock.mockReturnValue(null);

    const opened = openKnowledgeSiteInNewTab("/site");

    expect(opened).toBe(false);
    expect(KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE).toContain("新标签页");
  });
});
