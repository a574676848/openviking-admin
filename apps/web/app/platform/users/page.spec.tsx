import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./page";
import { API_ENDPOINTS } from "@/lib/constants";

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
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

async function openMoreMenu() {
  const moreButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("更多"),
  );
  expect(moreButton).toBeTruthy();

  await act(async () => {
    moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  return moreButton;
}

function mockPageData({
  users = [],
  tenants = [],
  usersError = null,
}: {
  users?: Array<{ id: string; username: string; role: string; tenantId: string | null; active: boolean; createdAt: string }>;
  tenants?: Array<{ id: string; tenantId: string; displayName: string }>;
  usersError?: Error | null;
}) {
  getMock.mockImplementation((endpoint: string) => {
    if (endpoint === "/users") {
      return usersError ? Promise.reject(usersError) : Promise.resolve(users);
    }

    if (endpoint === API_ENDPOINTS.TENANTS) {
      return Promise.resolve(tenants);
    }

    return Promise.resolve([]);
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
    mockPageData({ usersError: new Error("用户目录暂不可用") });

    await renderPage();

    expect(container.textContent).toContain("用户列表加载失败：用户目录暂不可用");
  });

  it("切换为超级管理员角色后租户绑定选择进入禁用态", async () => {
    mockPageData({ tenants: [] });

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("创建新账号"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const roleSelect = buttons.find((button) =>
      button.textContent?.includes("租户只读成员"),
    );
    expect(roleSelect).toBeTruthy();

    await act(async () => {
      if (roleSelect) {
        roleSelect.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });

    const superAdminOption = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("平台超级管理员"),
    );
    expect(superAdminOption).toBeTruthy();

    await act(async () => {
      superAdminOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const tenantSelect = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("平台全局"),
    );
    expect(tenantSelect).toBeTruthy();
    expect(tenantSelect?.getAttribute("disabled")).not.toBeNull();
    expect(tenantSelect?.textContent).toContain("平台全局");
  });

  it("自身账号的停用按钮处于禁用态", async () => {
    mockPageData({
      users: [{ id: "self-id", username: "admin", role: "super_admin", tenantId: null, active: true, createdAt: "2024-01-01" }],
    });

    await renderPage();

    const disableBtn = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("停用账号"),
    );
    expect(disableBtn).toBeTruthy();
    expect(disableBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("更多菜单包含编辑和重置密码按钮", async () => {
    mockPageData({
      users: [{ id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" }],
      tenants: [{ id: "demo", tenantId: "demo", displayName: "演示租户" }],
    });

    await renderPage();

    await openMoreMenu();

    expect(document.body.textContent).toContain("编辑");
    expect(document.body.textContent).toContain("重置密码");
    expect(document.body.textContent).toContain("删除用户");
  });

  it("编辑弹窗中角色范围可选，租户绑定为禁用态", async () => {
    mockPageData({
      users: [{ id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" }],
      tenants: [{ id: "tenant-1", tenantId: "demo", displayName: "演示租户" }],
    });

    await renderPage();

    await openMoreMenu();

    const editBtn = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("编辑"),
    );
    expect(editBtn).toBeTruthy();

    await act(async () => {
      editBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("编辑用户");
    expect(document.body.textContent).toContain("保存修改");

    // ConsoleSelect 渲染为 button，角色范围按钮不应有 disabled 属性
    const buttons = Array.from(document.body.querySelectorAll("button"));
    const roleSelectBtn = buttons.find((b) =>
      b.textContent?.includes("租户只读成员") || b.textContent?.includes("租户管理员") || b.textContent?.includes("平台超级管理员"),
    );
    expect(roleSelectBtn).toBeTruthy();
    expect(roleSelectBtn?.getAttribute("disabled")).toBeNull();

    // 租户绑定按钮应有 disabled 属性
    const tenantSelectBtn = buttons.find((b) =>
      b.textContent?.includes("演示租户") ||
      b.textContent?.includes("平台全局") ||
      b.textContent?.includes("请选择..."),
    );
    expect(tenantSelectBtn).toBeTruthy();
    expect(tenantSelectBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("重置密码弹窗需输入两遍新密码且一致才能提交", async () => {
    mockPageData({
      users: [{ id: "other-id", username: "testuser", role: "tenant_viewer", tenantId: "demo", active: true, createdAt: "2024-01-01" }],
      tenants: [{ id: "tenant-1", tenantId: "demo", displayName: "演示租户" }],
    });

    await renderPage();

    await openMoreMenu();

    const resetBtn = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重置密码"),
    );
    expect(resetBtn).toBeTruthy();

    await act(async () => {
      resetBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("重置");
    expect(document.body.textContent).toContain("确认重置");

    const passwordInputs = Array.from(document.body.querySelectorAll("input[type='password']"));
    expect(passwordInputs.length).toBe(2);
  });
});
