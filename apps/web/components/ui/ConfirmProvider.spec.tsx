import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm } from "./ConfirmProvider";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
          React.createElement(tag, props, children),
    },
  ),
}));

function ConfirmHarness() {
  const confirm = useConfirm();
  const [result, setResult] = useState<string>("idle");

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const approved = await confirm({
            title: "确认吊销",
            description: "此操作会立即中断当前凭证。",
            confirmText: "继续吊销",
            cancelText: "暂不处理",
            tone: "danger",
          });
          setResult(approved ? "confirmed" : "cancelled");
        }}
      >
        打开确认框
      </button>
      <span data-testid="confirm-result">{result}</span>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

async function renderHarness() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ConfirmProvider>
        <ConfirmHarness />
      </ConfirmProvider>,
    );
  });
}

describe("ConfirmProvider", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("点击确认后会 resolve true 并关闭弹窗", async () => {
    await renderHarness();

    const openButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("打开确认框"),
    );
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain('确认吊销');
    expect(container.textContent).toContain('继续吊销');

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("继续吊销"),
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe("confirmed");
  });

  it("点击取消后会 resolve false", async () => {
    await renderHarness();

    const openButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("打开确认框"),
    );

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const cancelButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("暂不处理"),
    );
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe("cancelled");
  });

  it("按 Esc 后会 resolve false", async () => {
    await renderHarness();

    const openButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("打开确认框"),
    );

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="confirm-result"]')?.textContent).toBe("cancelled");
  });
});
