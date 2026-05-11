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

  it("支持按配置进行搜索与排序", async () => {
    const interactiveColumns: ColumnDef<DemoRow>[] = [
      {
        key: "name",
        header: "名称",
        cell: (row) => row.name,
        searchable: true,
        searchValue: (row) => row.name,
        sortable: true,
        sortValue: (row) => row.name,
      },
      {
        key: "status",
        header: "状态",
        cell: (row) => row.status,
        searchable: true,
        searchValue: (row) => row.status,
      },
    ];

    await renderTable(
      <DataTable
        data={[
          { name: "Beta", status: "处理中" },
          { name: "Alpha", status: "完成" },
          { name: "Gamma", status: "失败" },
        ]}
        columns={interactiveColumns}
        searchConfig={{ placeholder: "搜索名称" }}
      />,
    );

    const sortButton = container.querySelector("th button");
    expect(sortButton?.textContent).toContain("名称");

    await act(async () => {
      sortButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const ascendingRows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(ascendingRows[0]).toContain("Alpha");
    expect(ascendingRows[1]).toContain("Beta");

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(searchInput?.getAttribute("placeholder")).toBe("搜索名称");

    await act(async () => {
      if (searchInput) {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setValue?.call(searchInput, "gam");
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const filteredRows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0]).toContain("Gamma");
  });

  it("默认按分页展示列表数据", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      name: `文档${index + 1}`,
      status: "完成",
    }));

    await renderTable(<DataTable data={rows} columns={columns} />);

    let visibleRows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(visibleRows).toHaveLength(10);
    expect(container.textContent).toContain("显示 1-10 条，共 12 条");

    const nextButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("下一页"),
    );

    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    visibleRows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(visibleRows).toHaveLength(2);
    expect(visibleRows[0]).toContain("文档11");
    expect(container.textContent).toContain("显示 11-12 条，共 12 条");
  });
});
