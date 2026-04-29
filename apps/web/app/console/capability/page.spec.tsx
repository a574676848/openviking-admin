import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapabilityPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const clipboardWriteMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
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
    root.render(<CapabilityPage />);
    await Promise.resolve();
  });
}

describe("CapabilityPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    clipboardWriteMock.mockReset();
    fetchMock.mockReset();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteMock,
      },
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("列表为空时展示空状态", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "user-1", username: "alice", role: "tenant_admin", active: true },
      ])
      .mockResolvedValueOnce({ capabilities: [] });

    await renderPage();

    expect(container.textContent).toContain("暂无凭证");
  });

  it("列表加载失败时展示失败信息", async () => {
    getMock.mockRejectedValueOnce(new Error("凭证中心暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("Capability Key 列表加载失败");
    expect(container.textContent).toContain("凭证中心暂不可用");
    expect(container.textContent).toContain("凭证中心暂不可用");
  });

  it("创建新凭证后可以执行连接测试并复制客户端配置", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "user-1", username: "alice", role: "tenant_admin", active: true },
        { id: "user-2", username: "bob", role: "tenant_operator", active: true },
      ])
      .mockResolvedValueOnce({
        capabilities: [
          {
            channel: "cli",
            credentialType: "api_key",
            issueEndpoint: "/api/v1/auth/client-credentials",
            ttlSeconds: 2592000,
            ttlOptions: [
              { label: "7 天", value: 604800 },
              { label: "30 天", value: 2592000, default: true },
              { label: "长期有效", value: null },
            ],
            recommendedFor: ["cli", "automation"],
          },
        ],
      })
      .mockResolvedValueOnce([
        {
          id: "created-key",
          name: "Desktop IDE",
          apiKey: "cap_live_12345678",
          userId: "user-2",
          lastUsedAt: null,
          expiresAt: "2026-05-28T00:00:00.000Z",
          createdAt: "2026-04-28T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        { id: "user-1", username: "alice", role: "tenant_admin", active: true },
        { id: "user-2", username: "bob", role: "tenant_operator", active: true },
      ])
      .mockResolvedValueOnce({
        capabilities: [
          {
            channel: "cli",
            credentialType: "api_key",
            issueEndpoint: "/api/v1/auth/client-credentials",
            ttlSeconds: 2592000,
            ttlOptions: [
              { label: "7 天", value: 604800 },
              { label: "30 天", value: 2592000, default: true },
              { label: "长期有效", value: null },
            ],
            recommendedFor: ["cli", "automation"],
          },
        ],
      });
    postMock.mockResolvedValueOnce({
      apiKey: "cap_live_12345678",
      expiresAt: "2026-05-28T00:00:00.000Z",
    });
    fetchMock.mockResolvedValueOnce({ ok: true });

    await renderPage();

    const openModalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("新增凭证"),
    );
    expect(openModalButton).toBeTruthy();

    await act(async () => {
      openModalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = container.querySelector('input[placeholder="例如：Cursor-Office / Claude-Local"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    await act(async () => {
      if (input) {
        input.value = "Desktop IDE";
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const modalText = container.textContent ?? "";
    expect(modalText).toContain("绑定用户 *");
    expect(modalText).toContain("alice");

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("确认创建"),
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith(
      "/capability/keys",
      expect.objectContaining({
        userId: "user-1",
        ttlSeconds: 2592000,
      }),
    );

    const testButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("测试连接"),
    );
    expect(testButton).toBeTruthy();

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/mcp/sse?key=cap_live_12345678",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
    );

    const copyConfigButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("title")?.includes("复制配置"),
    );
    expect(copyConfigButton).toBeTruthy();

    await act(async () => {
      copyConfigButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(clipboardWriteMock).toHaveBeenCalledWith(
      expect.stringContaining('"url": "http://localhost:3000/api/v1/mcp/sse?key=<YOUR_API_KEY>"'),
    );
  });

  it("可以切换已有凭证进行连接测试", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "key-1",
        name: "Office IDE",
        apiKey: "ov-sk-office12345678",
        userId: "user-1",
        lastUsedAt: null,
        expiresAt: null,
        createdAt: "2026-04-28T00:00:00.000Z",
      },
      {
        id: "key-2",
        name: "CI Runner",
        apiKey: "ov-sk-runner87654321",
        userId: "user-2",
        lastUsedAt: null,
        expiresAt: null,
        createdAt: "2026-04-28T01:00:00.000Z",
      },
    ]).mockResolvedValueOnce([
      { id: "user-1", username: "alice", role: "tenant_admin", active: true },
      { id: "user-2", username: "bob", role: "tenant_operator", active: true },
    ]).mockResolvedValueOnce({
      capabilities: [
        {
          channel: "cli",
          credentialType: "api_key",
          issueEndpoint: "/api/v1/auth/client-credentials",
          ttlSeconds: 2592000,
          ttlOptions: [{ label: "30 天", value: 2592000, default: true }],
          recommendedFor: ["cli", "automation"],
        },
      ],
    });
    fetchMock.mockResolvedValueOnce({ ok: true });

    await renderPage();

    const testButtons = Array.from(container.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("测试连接"),
    );
    expect(testButtons.length).toBeGreaterThan(1);

    await act(async () => {
      testButtons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/mcp/sse?key=ov-sk-runner87654321",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(container.textContent).toContain("CI Runner");
  });
});
