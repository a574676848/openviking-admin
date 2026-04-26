import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlertTriangle } from "lucide-react";
import { ConsoleButton } from "./forms";
import { ConsoleEmptyState, ConsoleStatusPanel } from "./feedback";

describe("ConsoleEmptyState", () => {
  it("在提供 action 时会渲染操作区", () => {
    const html = renderToStaticMarkup(
      <ConsoleEmptyState
        icon={AlertTriangle}
        title="加载失败"
        description="请检查网络连接后重试。"
        action={<ConsoleButton type="button">重新加载</ConsoleButton>}
      />,
    );

    expect(html).toContain("加载失败");
    expect(html).toContain("请检查网络连接后重试。");
    expect(html).toContain("重新加载");
  });
});

describe("ConsoleStatusPanel", () => {
  it("会包裹面板并复用空状态内容", () => {
    const html = renderToStaticMarkup(
      <ConsoleStatusPanel
        icon={AlertTriangle}
        title="系统遥测加载失败"
        description="请稍后重新加载。"
        action={<ConsoleButton type="button">重新加载</ConsoleButton>}
      />,
    );

    expect(html).toContain("系统遥测加载失败");
    expect(html).toContain("请稍后重新加载。");
    expect(html).toContain("重新加载");
  });
});
