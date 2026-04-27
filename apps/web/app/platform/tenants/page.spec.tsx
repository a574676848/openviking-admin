import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TenantsPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const writeSessionTokenToWindowMock = vi.fn();
const popupFocusMock = vi.fn();
const popupCloseMock = vi.fn();
const popupReplaceMock = vi.fn();
const windowOpenMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
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
  writeSessionTokenToWindow: (...args: unknown[]) => writeSessionTokenToWindowMock(...args),
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

function createPopupWindow() {
  return {
    document: {
      title: "",
      body: {
        innerHTML: "",
      },
    },
    focus: popupFocusMock,
    close: popupCloseMock,
    location: {
      replace: popupReplaceMock,
    },
  } as unknown as Window;
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<TenantsPage />);
    await Promise.resolve();
  });
}

async function setControlledInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Platform TenantsPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    writeSessionTokenToWindowMock.mockReset();
    popupFocusMock.mockReset();
    popupCloseMock.mockReset();
    popupReplaceMock.mockReset();
    windowOpenMock.mockReset();
    windowOpenMock.mockReturnValue(createPopupWindow());
    vi.spyOn(window, "open").mockImplementation(windowOpenMock);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    vi.restoreAllMocks();
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
      button.textContent?.includes("创建新租户"),
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
    expect(container.textContent).toContain("数据库主机 / Host");
    expect(container.querySelector('input[placeholder="例如 127.0.0.1"]')).toBeTruthy();
  });

  it("打开表单后展示字段标签与更清晰的配额说明", async () => {
    getMock.mockResolvedValueOnce([]);

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("创建新租户"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("命名空间 ID / Namespace ID");
    expect(container.textContent).toContain("租户显示名称 / Display Name");
    expect(container.textContent).toContain("最大知识库数 / Max KB Count");
    expect(container.textContent).toContain("最大向量数 / Max Vector Count");
    expect(container.textContent).toContain("租户级 OV / Rerank 配置");
    expect(container.textContent).toContain("默认继承平台全局配置，需要覆盖时再展开填写");
    expect(container.textContent).not.toContain("OV 账号 ID");
  });

  it("列表内展示编辑按钮并可进入编辑态", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "tenant-1",
        tenantId: "hermes",
        displayName: "hermes",
        status: "ACTIVE",
        isolationLevel: "small",
        quota: { maxDocs: 88, maxVectors: 6666 },
        dbConfig: null,
        vikingAccount: "tenant-hermes",
        ovConfig: {
          baseUrl: "http://ov.hermes.local",
          rerankEndpoint: "http://rerank.hermes.local/v1/rerank",
          rerankModel: "bge-reranker-v2-m3",
        },
        createdAt: "2026-04-27T00:00:00.000Z",
      },
    ]);

    await renderPage();

    const actionButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "更多操作",
    );
    expect(actionButton).toBeTruthy();

    await act(async () => {
      actionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("编辑配置"),
    );
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const toggleConfigButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-expanded") === "false",
    );
    expect(toggleConfigButton).toBeTruthy();

    await act(async () => {
      toggleConfigButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("OV 配置");
    expect(container.textContent).toContain("Rerank 配置");

    expect(container.textContent).toContain("编辑租户 · hermes");
    expect(container.querySelector('input[value="hermes"]')).toBeTruthy();
    expect(container.querySelector('input[value="tenant-hermes"]')).toBeTruthy();
    expect(container.querySelector('input[value="http://ov.hermes.local"]')).toBeTruthy();
    expect(container.querySelector('input[value="http://rerank.hermes.local/v1/rerank"]')).toBeTruthy();
    expect(container.querySelector('input[value="bge-reranker-v2-m3"]')).toBeTruthy();
    expect(container.textContent).toContain("保存租户配置");
    expect(container.querySelector('input[value="hermes"]')?.hasAttribute("disabled")).toBe(true);
    const largeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "LARGE",
    );
    expect(largeButton?.hasAttribute("disabled")).toBe(true);
  });

  it("创建租户时提交租户级 OV 与 Rerank 配置", async () => {
    getMock.mockResolvedValueOnce([]);
    postMock.mockResolvedValueOnce({});

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("创建新租户"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const toggleConfigButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-expanded") === "false",
    );
    expect(toggleConfigButton).toBeTruthy();

    await act(async () => {
      toggleConfigButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const setInputValue = async (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement | null;
      expect(input).toBeTruthy();
      await setControlledInputValue(input!, value);
    };

    await setInputValue('input[placeholder="例如 tenant-alpha"]', "tenant-alpha");
    await setInputValue('input[placeholder="用于列表与导航展示"]', "租户 Alpha");
    await setInputValue('input[placeholder="1000"]', "123");
    await setInputValue('input[placeholder="100000"]', "456");
    await setInputValue('input[placeholder="例如 http://ov.local:8000"]', "http://ov.tenant.local");
    await setInputValue('input[placeholder="例如 http://rerank.local/v1/rerank"]', "http://rerank.tenant.local/v1/rerank");
    await setInputValue('input[placeholder="例如 bge-reranker-v2-m3"]', "tenant-reranker");

    const accountInput = Array.from(container.querySelectorAll("input")).find((input) =>
      input.getAttribute("placeholder") === "例如 tenant-alpha" && (input as HTMLInputElement).value !== "tenant-alpha",
    ) as HTMLInputElement | undefined;
    expect(accountInput).toBeTruthy();
    await setControlledInputValue(accountInput!, "ov-tenant-alpha");

    const passwordInputs = Array.from(container.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
    expect(passwordInputs).toHaveLength(2);
    await setControlledInputValue(passwordInputs[0], "ov-secret");
    await setControlledInputValue(passwordInputs[1], "rerank-secret");

    const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("确认创建租户"),
    );
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/tenants", {
      tenantId: "tenant-alpha",
      isolationLevel: "small",
      displayName: "租户 Alpha",
      quota: { maxDocs: 123, maxVectors: 456 },
      vikingAccount: "ov-tenant-alpha",
      ovConfig: {
        account: "ov-tenant-alpha",
        baseUrl: "http://ov.tenant.local",
        apiKey: "ov-secret",
        rerankEndpoint: "http://rerank.tenant.local/v1/rerank",
        rerankApiKey: "rerank-secret",
        rerankModel: "tenant-reranker",
      },
      dbConfig: undefined,
    });
  });

  it("列表内展示启用禁用按钮，并可触发状态切换", async () => {
    getMock
      .mockResolvedValueOnce([
        {
          id: "tenant-1",
          tenantId: "hermes",
          displayName: "Hermes",
          status: "active",
          isolationLevel: "small",
          quota: null,
          dbConfig: null,
          ovConfig: null,
          createdAt: "2026-04-27T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "tenant-1",
          tenantId: "hermes",
          displayName: "Hermes",
          status: "disabled",
          isolationLevel: "small",
          quota: null,
          dbConfig: null,
          ovConfig: null,
          createdAt: "2026-04-27T00:00:00.000Z",
        },
      ]);
    confirmMock.mockResolvedValueOnce(true);
    patchMock.mockResolvedValueOnce({});

    await renderPage();

    expect(container.textContent).toContain("已启用");

    const actionButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "更多操作",
    );
    expect(actionButton).toBeTruthy();

    await act(async () => {
      actionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const statusButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("禁用状态"),
    );
    expect(statusButton).toBeTruthy();

    await act(async () => {
      statusButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(patchMock).toHaveBeenCalledWith("/api/v1/tenants/tenant-1/status", {
      status: "disabled",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("租户「Hermes」已禁用");
  });

  it("进入空间时应在弹窗中写入租户会话并导航到控制台", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "tenant-1",
        tenantId: "mem",
        displayName: "openviking记忆",
        status: "active",
        isolationLevel: "large",
        quota: null,
        dbConfig: null,
        ovConfig: null,
        createdAt: "2026-04-27T00:00:00.000Z",
      },
    ]);
    postMock.mockResolvedValueOnce({
      accessToken: "tenant-access-token",
      tenantName: "openviking记忆",
    });

    await renderPage();

    const entryButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("进入空间"),
    );
    expect(entryButton).toBeTruthy();

    await act(async () => {
      entryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(windowOpenMock).toHaveBeenCalledOnce();
    expect(postMock).toHaveBeenCalledWith("/api/v1/auth/switch-role", {
      tenantId: "tenant-1",
    });
    const popupWindow = windowOpenMock.mock.results[0]?.value as Window;
    expect(writeSessionTokenToWindowMock).toHaveBeenCalledWith(
      popupWindow,
      "tenant-access-token",
    );
    expect(popupReplaceMock).toHaveBeenCalledWith("/console/dashboard");
    expect(popupFocusMock).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenCalledWith("已在新窗口打开: openviking记忆");
  });

  it("浏览器拦截弹窗时不应发起视角切换请求", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "tenant-2",
        tenantId: "test3",
        displayName: "职行力test3",
        status: "active",
        isolationLevel: "medium",
        quota: null,
        dbConfig: null,
        ovConfig: null,
        createdAt: "2026-04-27T00:00:00.000Z",
      },
    ]);
    windowOpenMock.mockReturnValueOnce(null);

    await renderPage();

    const entryButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("进入空间"),
    );
    expect(entryButton).toBeTruthy();

    await act(async () => {
      entryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("浏览器拦截了租户弹窗，请允许弹窗后重试");
  });
});
