import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsoleIconTile, ConsoleSelectionCard, ConsoleSurfaceCard } from "./layout";

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

describe("console-layout", () => {
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

  it("ConsoleSurfaceCard 根据 tone 输出对应内层壳样式", async () => {
    await renderNode(
      <div>
        <ConsoleSurfaceCard tone="elevated" className="test-elevated">
          elevated
        </ConsoleSurfaceCard>
        <ConsoleSurfaceCard tone="inverse" className="test-inverse">
          inverse
        </ConsoleSurfaceCard>
      </div>,
    );

    const elevated = container.querySelector(".test-elevated");
    const inverse = container.querySelector(".test-inverse");

    expect(elevated?.className).toContain("border-[3px]");
    expect(elevated?.className).toContain("bg-[var(--bg-elevated)]");
    expect(inverse?.className).toContain("bg-black");
    expect(inverse?.className).toContain("text-white");
  });

  it("ConsoleSelectionCard 根据 active 输出选中态卡片样式", async () => {
    await renderNode(
      <div>
        <ConsoleSelectionCard active className="test-active">
          active
        </ConsoleSelectionCard>
        <ConsoleSelectionCard className="test-idle">idle</ConsoleSelectionCard>
      </div>,
    );

    const active = container.querySelector(".test-active");
    const idle = container.querySelector(".test-idle");

    expect(active?.className).toContain("bg-black");
    expect(active?.className).toContain("text-white");
    expect(idle?.className).toContain("bg-[var(--bg-card)]");
    expect(idle?.className).toContain("shadow-[3px_3px_0px_#000]");
  });

  it("ConsoleIconTile 与 ConsoleSurfaceCard 支持 success tone", async () => {
    await renderNode(
      <div>
        <ConsoleSurfaceCard tone="success" className="test-success-surface">
          ok
        </ConsoleSurfaceCard>
        <ConsoleIconTile tone="success" className="test-success-tile">
          ok
        </ConsoleIconTile>
      </div>,
    );

    const successSurface = container.querySelector(".test-success-surface");
    const successTile = container.querySelector(".test-success-tile");

    expect(successSurface?.className).toContain("bg-[var(--success)]");
    expect(successSurface?.className).toContain("text-white");
    expect(successTile?.className).toContain("bg-[var(--success)]");
    expect(successTile?.className).toContain("h-10 w-10");
  });
});
