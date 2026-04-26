import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataTable, type ColumnDef } from "./DataTable";

interface DemoRow {
  name: string;
  status: string;
}

const columns: ColumnDef<DemoRow>[] = [
  {
    key: "name",
    header: "名称",
    cell: (row) => row.name,
  },
  {
    key: "status",
    header: "状态",
    cell: (row) => row.status,
  },
];

let container: HTMLDivElement;
let root: Root;

async function renderTable(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
}

describe("DataTable", () => {
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

  it("在加载态时显示加载文案", async () => {
    await renderTable(<DataTable data={[]} columns={columns} loading />);

    expect(container.textContent).toContain("正在同步数据...");
    expect(container.textContent).not.toContain("暂无数据");
  });

  it("在空态和有数据态之间正确切换", async () => {
    await renderTable(
      <DataTable data={[]} columns={columns} emptyMessage="暂无数据" />,
    );

    expect(container.textContent).toContain("暂无数据");

    await act(async () => {
      root.render(
        <DataTable
          data={[
            { name: "文档一", status: "完成" },
            { name: "文档二", status: "处理中" },
          ]}
          columns={columns}
          rowClassName={(row) => (row.status === "完成" ? "row-done" : "row-running")}
        />,
      );
    });

    expect(container.textContent).toContain("文档一");
    expect(container.textContent).toContain("处理中");
    expect(container.querySelector(".row-done")).toBeTruthy();
    expect(container.querySelector(".row-running")).toBeTruthy();
  });
});
