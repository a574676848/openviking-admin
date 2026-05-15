import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDocumentAssetReadEndpoint,
  buildDocumentAssetsEndpoint,
  compressDocumentAssetFile,
  createDocumentAssetObjectUrlStore,
  resolveDocumentAssetFileName,
  uploadDocumentAsset,
  validateDocumentAssetFile,
} from "./document-assets";

const requestMock = vi.fn();
const { readSessionTokenMock } = vi.hoisted(() => ({
  readSessionTokenMock: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

vi.mock("@/lib/session", () => ({
  readSessionToken: () => readSessionTokenMock(),
}));

function createFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createFetchResponse(status = 200): Response {
  return {
    blob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1])])),
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

function createImageMock(width: number, height: number): HTMLImageElement {
  let onload: (() => void) | null = null;
  const image = {
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    onload: null,
    onerror: null,
    set src(_value: string) {
      queueMicrotask(() => onload?.());
    },
    get src() {
      return "";
    },
  } as unknown as HTMLImageElement;

  Object.defineProperty(image, "onload", {
    get: () => onload,
    set: (value) => {
      onload = value;
    },
  });

  return image;
}

describe("document-assets", () => {
  beforeEach(() => {
    requestMock.mockReset();
    readSessionTokenMock.mockReset();
  });

  it("构造资产上传端点时编码 nodeId", () => {
    expect(buildDocumentAssetsEndpoint("node/doc")).toBe(
      "/editor/node%2Fdoc/assets",
    );
  });

  it("构造资产读取端点时只接受 assets 下的扁平文件名", () => {
    expect(resolveDocumentAssetFileName("assets/截图 1.png")).toBe("截图 1.png");
    expect(
      buildDocumentAssetReadEndpoint("node/doc", "assets/截图 1.png"),
    ).toBe("/editor/node%2Fdoc/assets/%E6%88%AA%E5%9B%BE%201.png");
    expect(() => resolveDocumentAssetFileName("https://example.com/a.png")).toThrow(
      "仅支持预览当前文档 assets 目录下的图片。",
    );
    expect(() => resolveDocumentAssetFileName("assets/folder/a.png")).toThrow(
      "仅支持预览当前文档 assets 目录下的图片。",
    );
    expect(() => resolveDocumentAssetFileName("assets/../a.png")).toThrow(
      "仅支持预览当前文档 assets 目录下的图片。",
    );
  });

  it("校验可内联图片格式和大小", () => {
    expect(validateDocumentAssetFile(createFile("a.png", "image/png", 10))).toBeNull();
    expect(
      validateDocumentAssetFile(createFile("a.svg", "image/svg+xml", 10)),
    ).toContain("SVG 暂不支持内联渲染");
    expect(
      validateDocumentAssetFile(
        createFile("big.png", "image/png", 11 * 1024 * 1024),
      ),
    ).toBe("图片大小不能超过 10MB。");
  });

  it("大图片上传前会先压缩为更小的 WebP", async () => {
    const sourceFile = createFile("截图.png", "image/png", 3 * 1024 * 1024);
    const toBlobMock = vi
      .fn()
      .mockImplementation((callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(1024)], { type: "image/webp" })),
      );
    const drawImageMock = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: drawImageMock,
      }),
      toBlob: toBlobMock,
    } as unknown as HTMLCanvasElement;

    const compressedFile = await compressDocumentAssetFile(sourceFile, {
      createCanvas: () => canvas,
      createImage: () => createImageMock(4000, 2000),
      createObjectUrl: () => "blob:compress-source",
      revokeObjectUrl: vi.fn(),
    });

    expect(compressedFile).not.toBe(sourceFile);
    expect(compressedFile.type).toBe("image/webp");
    expect(compressedFile.name).toBe("截图.webp");
    expect(compressedFile.size).toBe(1024);
    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1200);
    expect(drawImageMock).toHaveBeenCalled();
    expect(toBlobMock).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.82,
    );
  });

  it("压缩失败或压缩后不更小应回退原文件", async () => {
    const sourceFile = createFile("截图.jpg", "image/jpeg", 2 * 1024 * 1024);
    const sameSizeBlob = new Blob([new Uint8Array(sourceFile.size)], {
      type: "image/webp",
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      toBlob: vi
        .fn()
        .mockImplementation((callback: BlobCallback) => callback(sameSizeBlob)),
    } as unknown as HTMLCanvasElement;

    await expect(
      compressDocumentAssetFile(sourceFile, {
        createCanvas: () => canvas,
        createImage: () => createImageMock(2000, 1000),
        createObjectUrl: () => "blob:compress-source",
        revokeObjectUrl: vi.fn(),
      }),
    ).resolves.toBe(sourceFile);
  });

  it("上传图片时使用 files 字段并返回相对路径", async () => {
    const file = createFile("截图.png", "image/png", 10);
    requestMock.mockResolvedValueOnce({
      assets: [{ path: "assets/asset-1-截图.png", uri: "viking://asset" }],
    });

    await expect(uploadDocumentAsset("node-doc", file)).resolves.toBe(
      "assets/asset-1-截图.png",
    );

    expect(requestMock).toHaveBeenCalledWith("/editor/node-doc/assets", {
      method: "POST",
      body: expect.any(FormData),
    });
    const body = requestMock.mock.calls[0][1].body as FormData;
    expect(body.get("files")).toBe(file);
  });

  it("上传大图时应提交压缩后的文件对象", async () => {
    const file = createFile("截图.png", "image/png", 3 * 1024 * 1024);
    requestMock.mockResolvedValueOnce({
      assets: [{ path: "assets/asset-1-截图.webp", uri: "viking://asset" }],
    });

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      toBlob: vi
        .fn()
        .mockImplementation((callback: BlobCallback) =>
          callback(new Blob([new Uint8Array(512)], { type: "image/webp" })),
        ),
    } as unknown as HTMLCanvasElement;

    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(canvas),
    } as unknown as Document);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:compress-source");
    URL.revokeObjectURL = vi.fn();

    const originalImage = globalThis.Image;
    vi.stubGlobal("Image", class {
      width = 4000;
      height = 2000;
      naturalWidth = 4000;
      naturalHeight = 2000;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });

    try {
      await uploadDocumentAsset("node-doc", file);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.stubGlobal("window", originalWindow);
      vi.stubGlobal("document", originalDocument);
      vi.stubGlobal("Image", originalImage);
    }

    const body = requestMock.mock.calls[0][1].body as FormData;
    const uploadedFile = body.get("files");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).type).toBe("image/webp");
    expect((uploadedFile as File).name).toBe("截图.webp");
    expect((uploadedFile as File).size).toBe(512);
  });

  it("后端未返回资源路径时给出中文错误", async () => {
    requestMock.mockResolvedValueOnce({ assets: [] });

    await expect(
      uploadDocumentAsset("node-doc", createFile("a.png", "image/png", 10)),
    ).rejects.toThrow("图片上传成功，但后端未返回资源路径。");
  });

  it("使用带 token 的 fetch 加载资产并缓存 Object URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse());
    const createObjectUrlMock = vi.fn().mockReturnValue("blob:asset-1");
    const revokeObjectUrlMock = vi.fn();
    readSessionTokenMock.mockReturnValue("jwt-token");
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      createObjectUrl: createObjectUrlMock,
      fetchAsset: fetchMock,
      revokeObjectUrl: revokeObjectUrlMock,
    });

    await expect(store.resolveFileUrl("assets/asset-1.png")).resolves.toBe(
      "blob:asset-1",
    );
    await expect(store.resolveFileUrl("assets/asset-1.png")).resolves.toBe(
      "blob:asset-1",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/editor/node-doc/assets/asset-1.png",
      {
        headers: {
          Authorization: "Bearer jwt-token",
        },
      },
    );

    store.revokeAll();

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:asset-1");
  });

  it("新上传图片应先缓存本地 Object URL 供即时预览", () => {
    const createObjectUrlMock = vi.fn().mockReturnValue("blob:local-preview");
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      createObjectUrl: createObjectUrlMock,
    });
    const file = createFile("截图.png", "image/png", 10);

    const objectUrl = store.rememberUploadedAsset(
      "assets/asset-1-截图.png",
      file,
    );

    expect(objectUrl).toBe("blob:local-preview");
    expect(createObjectUrlMock).toHaveBeenCalledWith(file);
  });

  it("新上传图片缓存后再次解析相对路径时应直接命中本地预览 URL", async () => {
    const fetchMock = vi.fn();
    const createObjectUrlMock = vi.fn().mockReturnValue("blob:local-preview");
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      createObjectUrl: createObjectUrlMock,
      fetchAsset: fetchMock,
    });
    const file = createFile("截图.png", "image/png", 10);

    store.rememberUploadedAsset("assets/asset-1-截图.png", file);

    await expect(
      store.resolveFileUrl("assets/asset-1-截图.png"),
    ).resolves.toBe("blob:local-preview");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("缺少 token 或资产响应失败时给出中文错误", async () => {
    readSessionTokenMock.mockReturnValue(null);
    const fetchMock = vi.fn();
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      fetchAsset: fetchMock,
    });

    await expect(store.resolveFileUrl("assets/asset-1.png")).rejects.toThrow(
      "登录状态已失效，请重新登录后查看图片。",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    readSessionTokenMock.mockReturnValue("jwt-token");
    fetchMock
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(404));

    await expect(store.resolveFileUrl("assets/missing.png")).rejects.toThrow(
      "图片加载失败。 (404)",
    );
  });

  it("资源短暂 404 时应重试后再加载图片", async () => {
    readSessionTokenMock.mockReturnValue("jwt-token");
    const waitMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(404))
      .mockResolvedValueOnce(createFetchResponse(200));
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      createObjectUrl: vi.fn().mockReturnValue("blob:retry-asset"),
      fetchAsset: fetchMock,
      wait: waitMock,
    });

    await expect(store.resolveFileUrl("assets/retry.png")).resolves.toBe(
      "blob:retry-asset",
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waitMock).toHaveBeenCalledTimes(2);
  });

  it("编辑器临时图片路径应直接透传，不触发受控资产校验", async () => {
    const fetchMock = vi.fn();
    const store = createDocumentAssetObjectUrlStore("node-doc", {
      fetchAsset: fetchMock,
    });

    await expect(store.resolveFileUrl("")).resolves.toBe("");
    await expect(store.resolveFileUrl("blob:preview-1")).resolves.toBe(
      "blob:preview-1",
    );
    await expect(
      store.resolveFileUrl("https://example.com/image.png"),
    ).resolves.toBe("https://example.com/image.png");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
