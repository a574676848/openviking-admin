import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindDocumentCollabStatus,
  buildDocumentCollabServerUrl,
  cleanupDocumentCollabSession,
  createDocumentCollabSession,
  DOCUMENT_YJS_FRAGMENT_NAME,
  selectDocumentCollabCursorColor,
} from "./document-collaboration";

const {
  docInstances,
  providerInstances,
  readSessionTokenMock,
  readSessionUserMock,
  hocuspocusProviderMock,
  yDocMock,
} = vi.hoisted(() => {
  type ProviderHandler = (...args: unknown[]) => void;

  class MockYDoc {
    destroy = vi.fn();
    getXmlFragment = vi.fn((name: string) => ({ name }));
  }

  interface MockHocuspocusProviderConfig {
    url: string;
    name: string;
    document: MockYDoc;
    token: string;
  }

  class MockHocuspocusProvider {
    handlers = new Map<string, ProviderHandler>();
    disconnect = vi.fn();
    destroy = vi.fn();
    off = vi.fn((event: string, handler: ProviderHandler) => {
      if (this.handlers.get(event) === handler) {
        this.handlers.delete(event);
      }
    });
    on = vi.fn((event: string, handler: ProviderHandler) => {
      this.handlers.set(event, handler);
      return handler;
    });

    constructor(public config: MockHocuspocusProviderConfig) {}

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
    }
  }

  const docInstances: MockYDoc[] = [];
  const providerInstances: MockHocuspocusProvider[] = [];

  return {
    docInstances,
    providerInstances,
    readSessionTokenMock: vi.fn(),
    readSessionUserMock: vi.fn(),
    hocuspocusProviderMock: vi.fn(
      function mockHocuspocusProvider(config: MockHocuspocusProviderConfig) {
        const provider = new MockHocuspocusProvider(config);
        providerInstances.push(provider);
        return provider;
      },
    ),
    yDocMock: vi.fn(function mockYDoc() {
      const doc = new MockYDoc();
      docInstances.push(doc);
      return doc;
    }),
  };
});

vi.mock("yjs", () => ({
  Doc: yDocMock,
}));

vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: hocuspocusProviderMock,
}));

vi.mock("@/lib/session", () => ({
  readSessionToken: () => readSessionTokenMock(),
  readSessionUser: () => readSessionUserMock(),
}));

describe("document-collaboration", () => {
  beforeEach(() => {
    docInstances.length = 0;
    providerInstances.length = 0;
    readSessionTokenMock.mockReset();
    readSessionUserMock.mockReset();
    hocuspocusProviderMock.mockClear();
    yDocMock.mockClear();
  });

  it("从当前 origin 和协作路径构造 WebSocket serverUrl", () => {
    expect(buildDocumentCollabServerUrl("/collab", "http://localhost:6002")).toBe(
      "ws://localhost:6002/collab",
    );
    expect(
      buildDocumentCollabServerUrl("collab", "https://knowledge.example.com"),
    ).toBe("wss://knowledge.example.com/collab");
  });

  it("创建 Provider 时传入 room、token 与 document-store fragment", () => {
    readSessionTokenMock.mockReturnValue("jwt-token");
    readSessionUserMock.mockReturnValue({
      id: "user-1",
      username: "张三",
    });

    const session = createDocumentCollabSession({
      collab: {
        path: "/collab",
        documentName: "document:tenant-a:node-doc",
        serverUrl: "wss://knowledge.example.com/collab",
      },
    });

    expect(hocuspocusProviderMock).toHaveBeenCalledWith({
      url: "wss://knowledge.example.com/collab",
      name: "document:tenant-a:node-doc",
      document: docInstances[0],
      token: "jwt-token",
    });
    expect(docInstances[0].getXmlFragment).toHaveBeenCalledWith(
      DOCUMENT_YJS_FRAGMENT_NAME,
    );
    expect(session.user.name).toBe("张三");
    expect(session.fragment).toEqual({ name: DOCUMENT_YJS_FRAGMENT_NAME });
  });

  it("缺少 token 时拒绝创建空鉴权连接", () => {
    readSessionTokenMock.mockReturnValue(null);

    expect(() =>
      createDocumentCollabSession({
        collab: {
          path: "/collab",
          documentName: "document:tenant-a:node-doc",
          serverUrl: "ws://localhost:6001/collab",
        },
      }),
    ).toThrow("登录状态已失效，请重新登录后继续编辑。");
    expect(hocuspocusProviderMock).not.toHaveBeenCalled();
  });

  it("缺少 serverUrl 时拒绝退回浏览器 origin 猜测协作地址", () => {
    readSessionTokenMock.mockReturnValue("jwt-token");

    expect(() =>
      createDocumentCollabSession({
        collab: {
          path: "/collab",
          documentName: "document:tenant-a:node-doc",
        },
      }),
    ).toThrow("协作服务地址缺失，请刷新页面后重试。");
    expect(hocuspocusProviderMock).not.toHaveBeenCalled();
  });

  it("绑定 Provider 状态事件并在 cleanup 时释放连接", () => {
    readSessionTokenMock.mockReturnValue("jwt-token");
    const session = createDocumentCollabSession({
      collab: {
        path: "/collab",
        documentName: "document:tenant-a:node-doc",
        serverUrl: "ws://localhost:6001/collab",
      },
    });
    const statuses: string[] = [];
    const unbind = bindDocumentCollabStatus(session.provider, (status) => {
      statuses.push(status);
    });

    providerInstances[0].emit("status", { status: "connecting" });
    providerInstances[0].emit("status", { status: "connected" });
    providerInstances[0].emit("synced", { state: false });
    providerInstances[0].emit("synced", { state: true });
    providerInstances[0].emit("disconnect");
    providerInstances[0].emit("close");
    providerInstances[0].emit("authenticationFailed");

    expect(statuses).toEqual([
      "collabConnecting",
      "collabConnected",
      "collabSyncing",
      "collabSynced",
      "collabDisconnected",
      "collabDisconnected",
      "error",
    ]);

    unbind();
    cleanupDocumentCollabSession(session);

    expect(providerInstances[0].off).toHaveBeenCalledTimes(5);
    expect(providerInstances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(providerInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(docInstances[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("协作者颜色按用户标识稳定分配", () => {
    expect(selectDocumentCollabCursorColor("same-user")).toBe(
      selectDocumentCollabCursorColor("same-user"),
    );
    expect(selectDocumentCollabCursorColor("same-user")).toMatch(
      /^var\(--collab-cursor-[1-6]\)$/,
    );
  });
});
