"use client";

import React, { useCallback } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Link as LinkIcon,
  Table as TableIcon,
  Code,
  DatabaseZap,
} from "lucide-react";

// ─── 类型 ───

interface DocumentToolbarProps {
  editor: any;
}

interface EditorCursorBlock {
  type?: string;
  props?: Record<string, unknown>;
}

// ─── 工具函数 ───

function readCurrentBlock(editor: any): EditorCursorBlock {
  if (typeof editor?.getTextCursorPosition !== "function") {
    return {};
  }

  const cursorPosition = editor.getTextCursorPosition();
  return cursorPosition?.block ?? {};
}

function buildBlockTypeValue(block: EditorCursorBlock): string {
  if (block.type !== "codeBlock" && block.type !== "procode") {
    return block.type ?? "paragraph";
  }

  const language =
    typeof block.props?.language === "string"
      ? block.props.language
      : "plain";
  return `procode:${language}`;
}

/**
 * 执行编辑器的撤销操作。
 *
 * BlockNote v0.50 官方 API：`editor.undo()` 返回 boolean。
 * 该方法内部已经适配了协作（Yjs）与单人（Prosemirror History）两种模式。
 */
export function executeEditorUndo(editor: any): void {
  if (typeof editor?.undo === "function") {
    editor.undo();
  }
}

/**
 * 执行编辑器的恢复操作。
 *
 * BlockNote v0.50 官方 API：`editor.redo()` 返回 boolean。
 */
export function executeEditorRedo(editor: any): void {
  if (typeof editor?.redo === "function") {
    editor.redo();
  }
}

export function executeEditorSave(editor: any): void {
  if (typeof editor?.focus === "function") {
    editor.focus();
  }
}

// ─── 工具栏按钮组件 ───

function ToolbarButton({
  icon,
  onClick,
  active,
  title,
  disabled,
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      // 使用 onMouseDown 而非 onClick，并立即 preventDefault 以防止编辑器失焦
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick?.();
      }}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-tile)] transition-all ${
        disabled
          ? "cursor-not-allowed text-[var(--text-muted)] opacity-50"
          : active
          ? "bg-[var(--brand-muted)] text-[var(--brand)]"
          : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--brand)]"
      }`}
    >
      {icon}
    </button>
  );
}

// ─── 主组件 ───

export function DocumentToolbar({ editor }: DocumentToolbarProps) {
  if (!editor) return null;

  const handleUndo = useCallback(() => {
    executeEditorUndo(editor);
  }, [editor]);

  const handleRedo = useCallback(() => {
    executeEditorRedo(editor);
  }, [editor]);

  const isActive = (style: string) => {
    if (typeof editor?.getActiveStyles !== "function") {
      return false;
    }

    const styles = editor.getActiveStyles();
    return Boolean(styles?.[style]);
  };

  const toggleBlockType = (type: any, props?: any) => {
    if (typeof editor?.updateBlock !== "function") {
      return;
    }
    editor.focus();
    const block = readCurrentBlock(editor);

    // 如果是代码块，确保有初始语言属性以激活高亮和编辑 UI
    const finalProps =
      (type === "codeBlock" || type === "procode") ? { language: "javascript", ...props } : props;

    editor.updateBlock(block, { type, props: finalProps });
  };

  const insertLink = () => {
    if (typeof editor?.createLink !== "function") {
      return;
    }
    const url = prompt("请输入链接地址:", "https://");
    if (url) {
      editor.createLink(url);
    }
  };

  const insertTable = () => {
    if (typeof editor?.insertBlocks !== "function") {
      return;
    }

    editor.focus?.();
    const block = readCurrentBlock(editor);
    editor.insertBlocks(
      [
        {
          type: "table",
          content: {
            type: "tableContent",
            columnWidths: [undefined, undefined],
            headerRows: 1,
            rows: [
              {
                cells: [
                  {
                    type: "tableCell",
                    props: {
                      backgroundColor: "default",
                      textColor: "default",
                      textAlignment: "left",
                    },
                    content: [{ type: "text", text: "列 1", styles: {} }],
                  },
                  {
                    type: "tableCell",
                    props: {
                      backgroundColor: "default",
                      textColor: "default",
                      textAlignment: "left",
                    },
                    content: [{ type: "text", text: "列 2", styles: {} }],
                  },
                ],
              },
              {
                cells: [
                  {
                    type: "tableCell",
                    props: {
                      backgroundColor: "default",
                      textColor: "default",
                      textAlignment: "left",
                    },
                    content: [{ type: "text", text: "值 1", styles: {} }],
                  },
                  {
                    type: "tableCell",
                    props: {
                      backgroundColor: "default",
                      textColor: "default",
                      textAlignment: "left",
                    },
                    content: [{ type: "text", text: "值 2", styles: {} }],
                  },
                ],
              },
            ],
          },
        },
      ],
      block,
      "after",
    );
  };

  const currentBlock = readCurrentBlock(editor);
  const currentType = buildBlockTypeValue(currentBlock);
  const currentHeadingLevel =
    typeof currentBlock.props?.level === "number"
      ? currentBlock.props.level
      : 1;

  return (
    <div className="sticky top-0 z-10 flex w-full flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-card)]/95 px-4 py-2 backdrop-blur-sm ov-document-toolbar">
      {/* 撤销 / 恢复 */}
      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--border)]">
        <ToolbarButton
          onClick={handleUndo}
          icon={<Undo2 size={16} />}
          title="撤销 (Ctrl+Z)"
        />
        <ToolbarButton
          onClick={handleRedo}
          icon={<Redo2 size={16} />}
          title="恢复 (Ctrl+Shift+Z)"
        />
      </div>

      {/* 块类型下拉 */}
      <div className="flex items-center gap-1 pr-2 mr-1 border-r border-[var(--border)]">
        {/* select 不会导致编辑器失焦的问题，因为切换后会调用 editor.focus() */}
        <select
          className="bg-transparent text-sm font-medium outline-none cursor-pointer hover:text-[var(--brand)] transition-colors px-1"
          value={
            currentType === "heading"
              ? `heading-${currentHeadingLevel}`
              : currentType
          }
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith("heading-")) {
              toggleBlockType("heading", {
                level: parseInt(val.split("-")[1]),
              });
            } else if (val.startsWith("codeBlock:") || val.startsWith("procode:")) {
              toggleBlockType("procode", { language: val.split(":")[1] });
            } else {
              toggleBlockType(val);
            }
          }}
        >
          <option value="paragraph">正文</option>
          <option value="heading-1">标题 1</option>
          <option value="heading-2">标题 2</option>
          <option value="heading-3">标题 3</option>
          <option value="bulletListItem">无序列表</option>
          <option value="numberedListItem">有序列表</option>
          <option value="checkListItem">任务列表</option>
          <option value="procode:javascript">代码块</option>
          <option value="codeBlock:mermaid">文本绘图（Mermaid）</option>
        </select>
      </div>

      {/* 文字样式 */}
      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--border)]">
        <ToolbarButton
          active={isActive("bold")}
          onClick={() => editor.toggleStyles?.({ bold: true })}
          icon={<Bold size={16} />}
          title="加粗 (Ctrl+B)"
        />
        <ToolbarButton
          active={isActive("italic")}
          onClick={() => editor.toggleStyles?.({ italic: true })}
          icon={<Italic size={16} />}
          title="斜体 (Ctrl+I)"
        />
        <ToolbarButton
          active={isActive("strike")}
          onClick={() => editor.toggleStyles?.({ strike: true })}
          icon={<Strikethrough size={16} />}
          title="删除线"
        />
        <ToolbarButton
          active={currentType.startsWith("procode:") || currentType.startsWith("codeBlock:")}
          onClick={() => toggleBlockType("procode")}
          icon={<Code size={16} />}
          title="代码块"
        />
      </div>

      {/* 列表快捷切换 */}
      <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--border)]">
        <ToolbarButton
          active={currentType === "bulletListItem"}
          onClick={() => toggleBlockType("bulletListItem")}
          icon={<List size={16} />}
          title="无序列表"
        />
        <ToolbarButton
          active={currentType === "numberedListItem"}
          onClick={() => toggleBlockType("numberedListItem")}
          icon={<ListOrdered size={16} />}
          title="有序列表"
        />
      </div>

      {/* 插入操作 */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={insertLink}
          icon={<LinkIcon size={16} />}
          title="插入链接"
        />
        <ToolbarButton
          onClick={insertTable}
          icon={<TableIcon size={16} />}
          title="插入表格"
        />
      </div>
    </div>
  );
}
