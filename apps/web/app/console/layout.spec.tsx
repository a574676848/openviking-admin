import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

const { logoutMock, replaceMock, useAppMock, usePathnameMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  replaceMock: vi.fn(),
  useAppMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));
const { openKnowledgeSiteInNewTabMock } = vi.hoisted(() => ({
  openKnowledgeSiteInNewTabMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/components/app-provider", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/components/theme-switcher", () => ({
  ThemeSwitcher: () => <button type="button">主题切换</button>,
}));

vi.mock("@/lib/knowledge-site-launch", () => ({
  KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE: "blocked",
  openKnowledgeSiteInNewTab: (...args: unknown[]) =>
    openKnowledgeSiteInNewTabMock(...args),
}));

let container: HTMLDivElement;
let root: Root;

async function renderLayout(pathname: string) {
  usePathnameMock.mockReturnValue(pathname);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AdminLayout>
        <div>页面内容</div>
      </AdminLayout>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Console AdminLayout", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    logoutMock.mockReset();
    replaceMock.mockReset();
    useAppMock.mockReset();
    usePathnameMock.mockReset();
    openKnowledgeSiteInNewTabMock.mockReset();
    useAppMock.mockReturnValue({
      user: {
        id: "user-1",
        username: "admin",
        role: "tenant_admin",
        tenantId: "tenant-a",
        hasCustomOvConfig: true,
      },
      logout: logoutMock,
      isLoading: false,
      theme: "neo",
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("普通控制台页面保留侧栏导航和主内容间距", async () => {
    await renderLayout("/console/dashboard");

    expect(container.textContent).toContain("租户工作台");
    expect(container.textContent).toContain("页面内容");
    expect(container.textContent).toContain("进入知识空间");
    const siteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("进入知识空间"),
    );
    expect(siteButton).toBeTruthy();
    await act(async () => {
      siteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openKnowledgeSiteInNewTabMock).toHaveBeenCalledWith("/site");
    const main = container.querySelector("main");
    expect(main?.className).toContain("px-6 py-8");
  });
});
