import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsoleTableShell, resolveConsoleTableState } from "./composites";

describe("resolveConsoleTableState", () => {
  it("按 loading > error > empty > ready 的顺序返回状态", () => {
    expect(resolveConsoleTableState({ loading: true, hasError: true, hasData: true })).toBe("loading");
    expect(resolveConsoleTableState({ loading: false, hasError: true, hasData: true })).toBe("error");
    expect(resolveConsoleTableState({ loading: false, hasError: false, hasData: false })).toBe("empty");
    expect(resolveConsoleTableState({ loading: false, hasError: false, hasData: true })).toBe("ready");
  });
});

describe("ConsoleTableShell", () => {
  it("会优先渲染错误态，其次才是空态", () => {
    const html = renderToStaticMarkup(
      <ConsoleTableShell
        columns={<div>表头</div>}
        state="error"
        stateContent={{
          error: <div>加载失败，请重试</div>,
          empty: <div>暂无记录</div>,
        }}
      />,
    );

    expect(html).toContain("表头");
    expect(html).toContain("加载失败，请重试");
    expect(html).not.toContain("暂无记录");
  });

  it("在有数据且无加载、无错误时渲染内容区", () => {
    const html = renderToStaticMarkup(
      <ConsoleTableShell
        columns={<div>表头</div>}
        state="ready"
        stateContent={{
          loading: <div>加载中</div>,
          error: <div>错误</div>,
          empty: <div>空状态</div>,
        }}
      >
        <div>数据行</div>
      </ConsoleTableShell>,
    );

    expect(html).toContain("数据行");
    expect(html).not.toContain("加载中");
    expect(html).not.toContain("错误");
  });
});
