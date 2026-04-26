import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TenantsPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const pushMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const writeSessionTokenMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("@/lib/session", () => ({
  writeSessionToken: (...args: unknown[]) => writeSessionTokenMock(...args),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<TenantsPage />);
    await Promise.resolve();
  });
}

describe("Platform TenantsPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    pushMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    writeSessionTokenMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("加载失败时展示租户目录失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("租户中心暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("租户目录加载失败：租户中心暂不可用");
  });

  it("切到 LARGE 隔离等级后展示独立数据库配置", async () => {
    getMock.mockResolvedValueOnce([]);

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("指派新租户"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("独立数据库连接配置");

    const largeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "LARGE",
    );
    expect(largeButton).toBeTruthy();

    await act(async () => {
      largeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("独立数据库连接配置");
    expect(container.querySelector('input[placeholder="主机地址"]')).toBeTruthy();
  });
});
