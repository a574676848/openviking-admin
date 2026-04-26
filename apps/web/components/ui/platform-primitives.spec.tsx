import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlatformSegmentedControl,
  PlatformStatusPanel,
  PlatformUtilityBar,
} from "./platform-primitives";

let container: HTMLDivElement;
let root: Root;

async function renderNode(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
}

describe("platform-primitives", () => {
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

  it("PlatformSegmentedControl 会展示当前选中项并触发切换", async () => {
    const onChange = vi.fn();
    await renderNode(
      <PlatformSegmentedControl
        value="uris"
        onChange={onChange}
        items={[
          { value: "uris", label: "URI" },
          { value: "queries", label: "Query 热点" },
        ]}
      />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("queries");
  });

  it("PlatformUtilityBar 正确渲染前后操作区", async () => {
    await renderNode(
      <PlatformUtilityBar
        leading={<span>记录总数</span>}
        trailing={<button type="button">下一页</button>}
      />,
    );

    expect(container.textContent).toContain("记录总数");
    expect(container.textContent).toContain("下一页");
  });

  it("PlatformStatusPanel 会渲染标题说明和操作区", async () => {
    await renderNode(
      <PlatformStatusPanel
        title="加载失败"
        description="请稍后重试"
        action={<button type="button">重试</button>}
      />,
    );

    expect(container.textContent).toContain("加载失败");
    expect(container.textContent).toContain("请稍后重试");
    expect(container.textContent).toContain("重试");
  });
});
