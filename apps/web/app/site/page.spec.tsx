import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeSiteIndexPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const confirmMock = vi.fn();
const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));
const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));
const TEST_UNAUTHORIZED_STATUS = 401;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/app-provider", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/components/theme-switcher", () => ({
  ThemeSwitcher: () => <button type="button">主题切换</button>,
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function flushRender() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<KnowledgeSiteIndexPage />);
    await flushRender();
  });
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("KnowledgeSiteIndexPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    confirmMock.mockReset();
    replaceMock.mockReset();
    useAppMock.mockReset();
    useAppMock.mockReturnValue({
      user: {
        id: "user-1",
        username: "alice",
        role: "tenant_admin",
        tenantId: "tenant-alpha",
      },
      isLoading: false,
      theme: "neo",
    });
    confirmMock.mockResolvedValue(true);
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === "/knowledge-bases") {
        return Promise.resolve([
          {
            id: "kb-1",
            name: "产品知识库",
            tenantId: "tenant-alpha",
            description: "产品团队规范与文档",
            createdAt: "2026-05-12T08:30:00",
            createdBy: { id: "user-creator", username: "创建者" },
            updatedBy: { id: "user-updater", username: "更新者" },
          },
        ]);
      }
      if (endpoint === "/system/dashboard") {
        return Promise.resolve({
          tenantIdentifier: "tenant-alpha",
        });
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
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

  it("展示知识空间首页、知识库列表和最近访问", async () => {
    window.localStorage.setItem(
      "ov_site_recent_documents",
      JSON.stringify([
        {
          kbId: "kb-1",
          nodeId: "node-1",
          name: "飞书对标方案",
          visitedAt: "2026-05-13T10:00:00.000Z",
        },
      ]),
    );

    await renderPage();

    expect(container.textContent).toContain("知识空间");
    expect(container.textContent).toContain("产品知识库");
    expect(container.textContent).toContain("最近访问");
    expect(container.textContent).toContain("飞书对标方案");
    expect(container.textContent).toContain("新建知识库");
    expect(container.textContent).toContain("创建人：创建者");
    expect(container.textContent).toContain("更新人：更新者");
    expect(container.textContent).toContain("最近更新时间：2026/5/12 08:30:00");
  });

  it("支持新建、重命名和归档知识库", async () => {
    postMock.mockResolvedValue({});
    patchMock.mockResolvedValue({});

    await renderPage();

    const createButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("新建知识库"),
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const createNameInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="例如：产品知识库"]',
    );
    expect(createNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(createNameInput!, "研发知识库");
      const form = createNameInput?.closest("form");
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushRender();
    });

    expect(postMock).toHaveBeenCalledWith("/knowledge-bases", {
      name: "研发知识库",
      description: "",
      tenantId: "tenant-alpha",
      vikingUri: "viking://resources/tenant-alpha/",
    });

    const moreButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="空间更多操作"]',
    );
    expect(moreButton).toBeTruthy();

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const renameButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("重命名"),
    );
    expect(renameButton).toBeTruthy();

    await act(async () => {
      renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const renameInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="输入新的知识库名称"]',
    );
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput!, "产品知识库-归档前");
      renameInput
        ?.closest("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await flushRender();
    });

    expect(patchMock).toHaveBeenCalledWith("/knowledge-bases/kb-1", {
      name: "产品知识库-归档前",
    });

    const archiveMoreButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="空间更多操作"]',
    );
    expect(archiveMoreButton).toBeTruthy();

    await act(async () => {
      archiveMoreButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await flushRender();
    });

    const archiveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("删除空间"),
    );
    expect(archiveButton).toBeTruthy();

    await act(async () => {
      archiveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除空间",
      }),
    );
    expect(patchMock).toHaveBeenCalledWith("/knowledge-bases/kb-1", {
      status: "archived",
    });
  });

  it("未登录时跳转知识空间登录模式", async () => {
    useAppMock.mockReturnValue({
      user: null,
      isLoading: false,
      theme: "neo",
    });

    await renderPage();

    expect(replaceMock).toHaveBeenCalledWith("/login?mode=site&next=%2Fsite");
  });

  it("加载知识空间时 token 过期会强制跳转登录页", async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === "/knowledge-bases") {
        return Promise.reject(
          Object.assign(new Error("登录已过期，请重新登录"), {
            status: TEST_UNAUTHORIZED_STATUS,
          }),
        );
      }
      if (endpoint === "/system/dashboard") {
        return Promise.resolve({
          tenantIdentifier: "tenant-alpha",
        });
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    });

    await renderPage();

    expect(replaceMock).toHaveBeenCalledWith("/login?mode=site&next=%2Fsite");
  });
});
