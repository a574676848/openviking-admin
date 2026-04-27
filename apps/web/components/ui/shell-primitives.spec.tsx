import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ShellButton,
  ShellInsetTile,
  ShellPanel,
  getShellButtonClass,
} from "./shell-primitives";

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

describe("shell-primitives", () => {
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

  it("neo danger button 输出相应的 Gemini 样式", () => {
    const className = getShellButtonClass("neo", "danger");
    expect(className).toContain("border");
    expect(className).toContain("text-[var(--danger)]");
    expect(className).toContain("rounded-[var(--radius-pill)]");
  });

  it("starry default button 使用细边框且带星空悬停阴影", () => {
    const className = getShellButtonClass("starry", "default");
    expect(className).toContain("border border-[var(--border)]");
    expect(className).toContain("hover:bg-[var(--bg-elevated)]");
    expect(className).toContain("hover:shadow-[0_0_10px_rgba(0,240,255,0.1)]");
  });

  it("ShellPanel 与 ShellInsetTile 会输出对应主题壳层类", async () => {
    await renderNode(
      <div>
        <ShellPanel theme="neo" variant="sidebar" data-testid="panel">
          sidebar
        </ShellPanel>
        <ShellInsetTile theme="starry" data-testid="tile">
          tile
        </ShellInsetTile>
        <ShellButton theme="starry" data-testid="button">
          action
        </ShellButton>
      </div>,
    );

    const panel = container.querySelector('[data-testid="panel"]');
    const tile = container.querySelector('[data-testid="tile"]');
    const button = container.querySelector('[data-testid="button"]');

    expect(panel?.className).toContain("border-r border-[var(--border)]");
    expect(panel?.className).toContain("shadow-none");
    expect(tile?.className).toContain("border border-[var(--border)]");
    expect(tile?.className).toContain("shadow-[0_0_5px_rgba(0,240,255,0.05)]");
    expect(button?.className).toContain("hover:bg-[var(--bg-elevated)]");
  });
});
