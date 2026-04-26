import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
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
    root.render(<UsersPage />);
    await Promise.resolve();
  });
}

describe("Platform UsersPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("加载失败时展示平台用户失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("用户目录暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("用户列表加载失败：用户目录暂不可用");
  });

  it("切换为超级管理员角色后租户绑定输入进入禁用态", async () => {
    getMock.mockResolvedValueOnce([]);

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("指派新账号"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const select = container.querySelector("select");
    expect(select).toBeTruthy();

    await act(async () => {
      if (select) {
        select.value = "super_admin";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const inputs = Array.from(container.querySelectorAll("input"));
    const tenantBindingInput = inputs.find((input) => input.placeholder === "e.g. demo-space");
    expect(tenantBindingInput).toBeTruthy();
    expect(tenantBindingInput?.getAttribute("disabled")).not.toBeNull();
    expect((tenantBindingInput as HTMLInputElement).value).toBe("平台全局");
  });
});
