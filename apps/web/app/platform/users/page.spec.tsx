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

vi.mock("@/components/app-provider", () => ({
  useApp: () => ({ user: { id: "self-id", username: "admin", role: "super_admin" } }),
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

  it("切换为超级管理员角色后租户绑定选择进入禁用态", async () => {
    getMock.mockResolvedValueOnce([]);

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("创建新账号"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const selects = Array.from(container.querySelectorAll("select"));
    const roleSelect = selects.find((s) => {
      const options = Array.from(s.querySelectorAll("option"));
      return options.some((o) => o.value === "super_admin");
    });
    expect(roleSelect).toBeTruthy();

    await act(async () => {
      if (roleSelect) {
        roleSelect.value = "super_admin";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const tenantSelect = selects.find((s) => {
      const options = Array.from(s.querySelectorAll("option"));
      return options.some((o) => o.textContent?.includes("选择租户") || o.textContent?.includes("平台全局"));
    });
    expect(tenantSelect).toBeTruthy();
    expect(tenantSelect?.getAttribute("disabled")).not.toBeNull();
    expect((tenantSelect as HTMLSelectElement).value).toBe("");
  });

  it("自身账号的停用按钮处于禁用态", async () => {
    getMock.mockResolvedValueOnce([{ id: "self-id", username: "admin", role: "super_admin", tenantId: null, active: true, createdAt: "2024-01-01" }]);

    await renderPage();

    const disableBtn = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("停用账号"),
    );
    expect(disableBtn).toBeTruthy();
    expect(disableBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("更多菜单包含编辑和重置密码按钮", async () => {
    getMock.mockResolvedValueOnce([{ id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" }]);

    await renderPage();

    expect(container.textContent).toContain("编辑");
    expect(container.textContent).toContain("重置密码");
    expect(container.textContent).toContain("删除用户");
  });

  it("编辑弹窗中角色范围可选，租户绑定为禁用态", async () => {
    getMock.mockResolvedValueOnce([
      { id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" },
    ]);

    await renderPage();

    const editBtn = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("编辑"),
    );
    expect(editBtn).toBeTruthy();

    await act(async () => {
      editBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("编辑用户");
    expect(container.textContent).toContain("保存修改");

    // ConsoleSelect 渲染为 button，角色范围按钮不应有 disabled 属性
    const buttons = Array.from(container.querySelectorAll("button"));
    const roleSelectBtn = buttons.find((b) =>
      b.textContent?.includes("租户只读成员") || b.textContent?.includes("租户管理员") || b.textContent?.includes("平台超级管理员"),
    );
    expect(roleSelectBtn).toBeTruthy();
    expect(roleSelectBtn?.getAttribute("disabled")).toBeNull();

    // 租户绑定按钮应有 disabled 属性
    const tenantSelectBtn = buttons.find((b) =>
      b.textContent?.includes("平台全局") || b.textContent?.includes("demo"),
    );
    expect(tenantSelectBtn).toBeTruthy();
    expect(tenantSelectBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("重置密码弹窗需输入两遍新密码且一致才能提交", async () => {
    getMock.mockResolvedValueOnce([{ id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" }]);

    await renderPage();

    const resetBtn = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重置密码"),
    );
    expect(resetBtn).toBeTruthy();

    await act(async () => {
      resetBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("重置");
    expect(container.textContent).toContain("确认重置");

    const passwordInputs = Array.from(container.querySelectorAll("input[type='password']"));
    expect(passwordInputs.length).toBe(2);
  });
});
