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

  it("neo danger button 保留硬边框与投影约束", () => {
    const className = getShellButtonClass("neo", "danger");
    expect(className).toContain("border-[3px]");
    expect(className).toContain("bg-[var(--danger)]");
    expect(className).toContain("shadow-[2px_2px_0px_#000]");
  });

  it("swiss default button 使用细边框且不带硬投影", () => {
    const className = getShellButtonClass("swiss", "default");
    expect(className).toContain("border border-[var(--border)]");
    expect(className).toContain("hover:bg-[var(--bg-elevated)]");
    expect(className).not.toContain("shadow-[2px_2px_0px_#000]");
  });

  it("ShellPanel 与 ShellInsetTile 会输出对应主题壳层类", async () => {
    await renderNode(
      <div>
        <ShellPanel theme="neo" variant="sidebar" data-testid="panel">
          sidebar
        </ShellPanel>
        <ShellInsetTile theme="swiss" data-testid="tile">
          tile
        </ShellInsetTile>
        <ShellButton theme="swiss" data-testid="button">
          action
        </ShellButton>
      </div>,
    );

    const panel = container.querySelector('[data-testid="panel"]');
    const tile = container.querySelector('[data-testid="tile"]');
    const button = container.querySelector('[data-testid="button"]');

    expect(panel?.className).toContain("border-r-[3px]");
    expect(panel?.className).toContain("shadow-[8px_0px_0px_#000]");
    expect(tile?.className).toContain("border border-[var(--border)]");
    expect(tile?.className).not.toContain("shadow-[2px_2px_0px_#000]");
    expect(button?.className).toContain("hover:bg-[var(--bg-elevated)]");
  });
});
