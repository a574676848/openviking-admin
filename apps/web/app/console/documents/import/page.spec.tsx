import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IngestionPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const pushMock = vi.fn();
const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => successMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<IngestionPage />);
    await Promise.resolve();
  });
}

function changeValue(element: Element | null, value: string) {
  const target = element as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
  if (!target) {
    throw new Error("未找到目标表单元素");
  }
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : target instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

async function chooseConsoleSelect(index: number, optionText: string) {
  const trigger = container.querySelectorAll('form button[type="button"]')[
    index
  ] as HTMLElement | undefined;
  if (!trigger) {
    throw new Error("未找到下拉触发器");
  }
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const options = Array.from(document.body.querySelectorAll("button"));
  const option = options.find((item) => item.textContent?.includes(optionText));
  if (!option) {
    throw new Error(`未找到选项: ${optionText}`);
  }

  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickButtonByText(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

async function chooseLocalFile(file: File) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement | null;
  if (!input) {
    throw new Error("未找到文件上传框");
  }
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

async function submitForm() {
  const form = container.querySelector("form");
  await act(async () => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

describe("IngestionPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    pushMock.mockReset();
    successMock.mockReset();
    errorMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("Git 导入缺少知识库时应直接阻止提交", async () => {
    getMock
      .mockResolvedValueOnce([
        { id: "integration-1", name: "exeGitLab", type: "gitlab" },
      ])
      .mockResolvedValueOnce([{ id: "kb-1", name: "ov记忆系统" }]);

    await renderPage();

    const urlsTextarea = container.querySelector("textarea");

    await act(async () => {
      changeValue(urlsTextarea, "https://git.exexm.com/repo.git");
      await Promise.resolve();
    });
    await submitForm();

    expect(postMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledWith("请完善配置信息");
  });

  it("Git 导入提交时不再要求 targetUri", async () => {
    getMock
      .mockResolvedValueOnce([
        { id: "integration-1", name: "exeGitLab", type: "gitlab" },
      ])
      .mockResolvedValueOnce([{ id: "kb-1", name: "ov记忆系统" }])
      .mockResolvedValueOnce([]);
    postMock.mockResolvedValueOnce({ id: "task-1" });

    await renderPage();

    const urlsTextarea = container.querySelector("textarea");

    await act(async () => {
      changeValue(urlsTextarea, "https://git.exexm.com/repo.git");
      await Promise.resolve();
    });
    await chooseConsoleSelect(0, "ov记忆系统");
    await submitForm();

    expect(postMock).toHaveBeenCalledWith("/import-tasks", {
      kbId: "kb-1",
      sourceUrl: "https://git.exexm.com/repo.git",
      sourceUrls: ["https://git.exexm.com/repo.git"],
      integrationId: undefined,
      targetUri: undefined,
      sourceType: "git",
    });
    expect(successMock).toHaveBeenCalledWith(
      "任务创建成功：已启动 1 个处理进程",
    );
    expect(pushMock).toHaveBeenCalledWith("/console/documents");
  });

  it("导入中心不再展示 WebDAV 同步选项", async () => {
    getMock
      .mockResolvedValueOnce([
        { id: "integration-2", name: "obsidian", type: "webdav" },
      ])
      .mockResolvedValueOnce([{ id: "kb-1", name: "ov记忆系统" }]);

    await renderPage();

    expect(container.textContent).not.toContain("WebDAV 同步");
  });

  it("知识库已有节点时应允许选择目标节点并提交节点 vikingUri", async () => {
    getMock
      .mockResolvedValueOnce([
        { id: "integration-1", name: "exeGitLab", type: "gitlab" },
      ])
      .mockResolvedValueOnce([{ id: "kb-1", name: "ov记忆系统" }])
      .mockResolvedValueOnce([
        {
          id: "node-1",
          name: "产品文档",
          vikingUri: "viking://resources/tenant-a/kb-1/node-1/",
        },
      ]);
    postMock.mockResolvedValueOnce({ id: "task-2" });

    await renderPage();

    const urlsTextarea = container.querySelector("textarea");

    await act(async () => {
      changeValue(urlsTextarea, "https://git.exexm.com/repo.git");
      await Promise.resolve();
    });
    await chooseConsoleSelect(0, "ov记忆系统");
    expect(container.textContent).toContain("导入目标节点");
    await chooseConsoleSelect(1, "产品文档");
    await submitForm();

    expect(postMock).toHaveBeenCalledWith("/import-tasks", {
      kbId: "kb-1",
      sourceUrl: "https://git.exexm.com/repo.git",
      sourceUrls: ["https://git.exexm.com/repo.git"],
      integrationId: undefined,
      targetUri: "viking://resources/tenant-a/kb-1/node-1/",
      sourceType: "git",
    });
  });

  it("网页提取应提交 sourceType=url 的导入任务", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "kb-1", name: "产品文档" }])
      .mockResolvedValueOnce([]);
    postMock.mockResolvedValueOnce({ id: "task-url" });

    await renderPage();

    await clickButtonByText("网页提取");
    const urlsTextarea = container.querySelector("textarea");
    await act(async () => {
      changeValue(urlsTextarea, "https://docs.example.com/page");
      await Promise.resolve();
    });
    await chooseConsoleSelect(0, "产品文档");
    await submitForm();

    expect(postMock).toHaveBeenCalledWith("/import-tasks", {
      kbId: "kb-1",
      sourceUrl: "https://docs.example.com/page",
      sourceUrls: ["https://docs.example.com/page"],
      integrationId: undefined,
      targetUri: undefined,
      sourceType: "url",
    });
  });

  it("本地上传应通过 multipart 创建导入任务", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "kb-1", name: "产品文档" }])
      .mockResolvedValueOnce([]);
    postMock.mockResolvedValueOnce({ id: "task-local" });

    await renderPage();

    await clickButtonByText("本地上传");
    await chooseConsoleSelect(0, "产品文档");
    await chooseLocalFile(
      new File(["# 手册"], "产品手册.md", { type: "text/markdown" }),
    );
    await submitForm();

    expect(postMock).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe("/import-tasks/local-upload");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("kbId")).toBe("kb-1");
    expect((body as FormData).getAll("files")).toHaveLength(1);
    expect(successMock).toHaveBeenCalledWith(
      "任务创建成功：已启动 1 个处理进程",
    );
    expect(pushMock).toHaveBeenCalledWith("/console/documents");
  });

  it("本地上传缺少文件时应阻止提交", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "kb-1", name: "产品文档" }])
      .mockResolvedValueOnce([]);

    await renderPage();

    await clickButtonByText("本地上传");
    await chooseConsoleSelect(0, "产品文档");
    await submitForm();

    expect(postMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledWith("请先上传文件");
  });
});
