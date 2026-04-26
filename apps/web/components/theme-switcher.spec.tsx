import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "./theme-switcher";

const setThemeMock = vi.fn();

vi.mock("./app-provider", () => ({
  useApp: () => ({
    theme: "neo",
    setTheme: setThemeMock,
  }),
}));

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

let container: HTMLDivElement;
let root: Root;

async function renderComponent() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ThemeSwitcher />);
  });
}

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    setThemeMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("展开菜单后选择主题会调用 setTheme", async () => {
    await renderComponent();

    const trigger = container.querySelector('button[aria-label="切换界面主题"]');
    expect(trigger).toBeTruthy();
    expect(container.textContent).toContain("现代波普");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("瑞士极简");

    const swissOption = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("瑞士极简"),
    );
    expect(swissOption).toBeTruthy();

    await act(async () => {
      swissOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setThemeMock).toHaveBeenCalledWith("swiss");
  });
});
