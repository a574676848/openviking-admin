import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FormModal } from "./FormModal";

let container: HTMLDivElement;
let root: Root;

async function renderModal(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
}

describe("FormModal", () => {
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

  it("关闭状态下不渲染任何内容", async () => {
    await renderModal(
      <FormModal
        isOpen={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="导入配置"
      >
        <div>表单内容</div>
      </FormModal>,
    );

    expect(container.textContent).toBe("");
  });

  it("打开后支持关闭和提交，并在保存态切换按钮文案", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    await renderModal(
      <FormModal
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        title="导入配置"
        saveText="保存配置"
        savingText="保存中"
      >
        <div>表单内容</div>
      </FormModal>,
    );

    expect(container.textContent).toContain("导入配置");
    expect(container.textContent).toContain("保存配置");

    const closeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "X",
    );
    const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("保存配置"),
    );
    const form = container.querySelector("form");

    expect(closeButton).toBeTruthy();
    expect(submitButton).toBeTruthy();
    expect(form).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <FormModal
          isOpen
          onClose={onClose}
          onSubmit={onSubmit}
          title="导入配置"
          saving
          saveText="保存配置"
          savingText="保存中"
        >
          <div>表单内容</div>
        </FormModal>,
      );
    });

    expect(container.textContent).toContain("保存中");
    const savingButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("保存中"),
    );
    expect(savingButton?.hasAttribute("disabled")).toBe(true);
  });

  it("打开后支持 Esc 关闭", async () => {
    const onClose = vi.fn();

    await renderModal(
      <FormModal
        isOpen
        onClose={onClose}
        onSubmit={vi.fn()}
        title="导入配置"
      >
        <div>表单内容</div>
      </FormModal>,
    );

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("输入表单时不会把焦点抢回关闭按钮", async () => {
    function InputDrivenModal() {
      const [value, setValue] = useState("");

      return (
        <FormModal
          isOpen
          onClose={() => undefined}
          onSubmit={vi.fn()}
          title="创建新租户"
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="租户名称"
          />
        </FormModal>
      );
    }

    await renderModal(<InputDrivenModal />);

    const input = container.querySelector('input[aria-label="租户名称"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    await act(async () => {
      input?.focus();
      input!.value = "e";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(document.activeElement).toBe(input);
  });
});
