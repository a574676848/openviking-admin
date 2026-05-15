"use client";

const FEISHU_CLIPBOARD_MARKER = "feishu";
const DINGTALK_CLIPBOARD_MARKER = "dingtalk";
const MERMAID_LANGUAGE = "mermaid";
const MERMAID_DIAGRAM_START_PATTERN =
  /^(graph|flowchart|sequencediagram|classdiagram|statediagram(?:-v2)?|erdiagram|journey|gantt|pie|mindmap|timeline|gitgraph|requirementdiagram|quadrantchart|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta)\b/i;
const BLOCK_TAG_NAMES = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "TR",
  "TBODY",
  "THEAD",
  "BLOCKQUOTE",
  "PRE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);
const DROPPED_TAG_NAMES = new Set([
  "SVG",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "NOSCRIPT",
  "STYLE",
  "SCRIPT",
]);

interface EnterpriseEditorBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: EnterpriseEditorBlock[];
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function collectElementChildrenMarkdown(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => renderNodeToMarkdown(node))
    .join("");
}

function renderTextNode(node: Text): string {
  return node.textContent?.replace(/\s+/g, " ") ?? "";
}

function renderHeading(element: HTMLElement): string {
  const level = Number(element.tagName.slice(1));
  const content = normalizeWhitespace(collectElementChildrenMarkdown(element));
  if (!content) {
    return "";
  }
  return `${"#".repeat(level)} ${content}\n\n`;
}

function renderList(
  element: HTMLElement,
  ordered: boolean,
  depth = 0,
): string {
  const items = Array.from(element.children).filter(
    (child) => child.tagName === "LI",
  );
  const lines = items.flatMap((item, index) => {
    const indent = "  ".repeat(depth);
    const marker = ordered ? `${index + 1}.` : "-";
    const parts: string[] = [];
    const inlineSegments: string[] = [];

    Array.from(item.childNodes).forEach((childNode) => {
      if (
        childNode.nodeType === Node.ELEMENT_NODE &&
        ((childNode as Element).tagName === "UL" ||
          (childNode as Element).tagName === "OL")
      ) {
        if (inlineSegments.length > 0) {
          parts.push(
            `${indent}${marker} ${normalizeWhitespace(inlineSegments.join(""))}`,
          );
          inlineSegments.length = 0;
        }
        parts.push(
          renderList(
            childNode as HTMLElement,
            (childNode as Element).tagName === "OL",
            depth + 1,
          ).trimEnd(),
        );
      } else {
        inlineSegments.push(renderNodeToMarkdown(childNode));
      }
    });

    if (inlineSegments.length > 0) {
      parts.unshift(
        `${indent}${marker} ${normalizeWhitespace(inlineSegments.join(""))}`,
      );
    }

    return parts.filter(Boolean);
  });

  return `${lines.join("\n")}\n\n`;
}

function renderTable(element: HTMLTableElement): string {
  const rows = Array.from(element.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
        .map((cell) =>
          normalizeWhitespace(collectElementChildrenMarkdown(cell)).trim(),
        ),
    )
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );

  const header = normalizedRows[0];
  const alignment = Array.from({ length: columnCount }, () => "---");
  const body = normalizedRows.slice(1);

  return [
    `| ${header.map((cell) => escapeTableCell(cell)).join(" | ")} |`,
    `| ${alignment.join(" | ")} |`,
    ...body.map(
      (row) => `| ${row.map((cell) => escapeTableCell(cell)).join(" | ")} |`,
    ),
    "",
  ].join("\n");
}

function renderBlockquote(element: HTMLElement): string {
  const content = normalizeWhitespace(collectElementChildrenMarkdown(element));
  if (!content) {
    return "";
  }
  return `${content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}\n\n`;
}

function renderPreformatted(element: HTMLElement): string {
  const codeElement = element.querySelector("code");
  const languageClass =
    codeElement?.getAttribute("class") ??
    codeElement?.getAttribute("data-language") ??
    codeElement?.getAttribute("lang") ??
    element.getAttribute("data-language") ??
    element.getAttribute("lang") ??
    "";
  const languageMatch = languageClass.match(/language-([a-z0-9_-]+)/i);
  const content = (codeElement?.textContent ?? element.textContent ?? "")
    .replace(/\r\n?/g, "\n")
    .trimEnd();
  const language =
    languageMatch?.[1] ??
    detectMermaidLanguageFromContent(content) ??
    "";
  if (!content) {
    return "";
  }
  return `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
}

function detectMermaidLanguageFromContent(content: string): string | null {
  const firstMeaningfulLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstMeaningfulLine) {
    return null;
  }

  return MERMAID_DIAGRAM_START_PATTERN.test(firstMeaningfulLine)
    ? MERMAID_LANGUAGE
    : null;
}

function renderInlineElement(element: HTMLElement): string {
  const tagName = element.tagName;
  if (DROPPED_TAG_NAMES.has(tagName)) {
    return "";
  }

  if (tagName === "BR") {
    return "\n";
  }
  if (tagName === "STRONG" || tagName === "B") {
    return `**${normalizeWhitespace(collectElementChildrenMarkdown(element))}**`;
  }
  if (tagName === "EM" || tagName === "I") {
    return `*${normalizeWhitespace(collectElementChildrenMarkdown(element))}*`;
  }
  if (tagName === "DEL" || tagName === "S" || tagName === "STRIKE") {
    return `~~${normalizeWhitespace(collectElementChildrenMarkdown(element))}~~`;
  }
  if (tagName === "CODE" && element.parentElement?.tagName !== "PRE") {
    return `\`${element.textContent?.trim() ?? ""}\``;
  }
  if (tagName === "A") {
    const href = element.getAttribute("href")?.trim();
    const text = normalizeWhitespace(collectElementChildrenMarkdown(element));
    if (!href || !text) {
      return text;
    }
    return `[${text}](${href})`;
  }
  if (tagName === "IMG") {
    const src = element.getAttribute("src")?.trim();
    if (!src) {
      return "";
    }
    const alt = element.getAttribute("alt")?.trim() ?? "";
    return `![${alt}](${src})`;
  }

  return collectElementChildrenMarkdown(element);
}

function renderNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return renderTextNode(node as Text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName;

  if (DROPPED_TAG_NAMES.has(tagName)) {
    return "";
  }
  if (tagName === "H1" || tagName === "H2" || tagName === "H3" || tagName === "H4" || tagName === "H5" || tagName === "H6") {
    return renderHeading(element);
  }
  if (tagName === "P" || tagName === "DIV" || tagName === "SECTION" || tagName === "ARTICLE") {
    const content = normalizeWhitespace(collectElementChildrenMarkdown(element));
    return content ? `${content}\n\n` : "";
  }
  if (tagName === "UL") {
    return renderList(element, false);
  }
  if (tagName === "OL") {
    return renderList(element, true);
  }
  if (tagName === "TABLE") {
    return renderTable(element as HTMLTableElement);
  }
  if (tagName === "BLOCKQUOTE") {
    return renderBlockquote(element);
  }
  if (tagName === "PRE") {
    return renderPreformatted(element);
  }
  if (BLOCK_TAG_NAMES.has(tagName)) {
    return collectElementChildrenMarkdown(element);
  }

  return renderInlineElement(element);
}

export function isEnterpriseClipboardHtml(html: string): boolean {
  const normalizedHtml = html.toLowerCase();
  return (
    normalizedHtml.includes(FEISHU_CLIPBOARD_MARKER) ||
    normalizedHtml.includes(DINGTALK_CLIPBOARD_MARKER)
  );
}

export function sanitizeEnterpriseClipboardHtmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const markdown = Array.from(document.body.childNodes)
    .map((node) => renderNodeToMarkdown(node))
    .join("");

  return normalizeWhitespace(markdown);
}

function readInlineContentAsText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (!item || typeof item !== "object") {
        return "";
      }

      const candidate = item as { text?: unknown; type?: unknown; content?: unknown };
      if (typeof candidate.text === "string") {
        return candidate.text;
      }

      if (candidate.type === "link" && Array.isArray(candidate.content)) {
        return readInlineContentAsText(candidate.content);
      }

      return "";
    })
    .join("");
}

function normalizeEnterpriseCodeBlock(
  block: EnterpriseEditorBlock,
): any {
  if (block.type !== "codeBlock") {
    return block;
  }

  const language =
    typeof block.props?.language === "string" && block.props.language.trim()
      ? block.props.language.trim().toLowerCase()
      : detectMermaidLanguageFromContent(readInlineContentAsText(block.content)) ??
        "plain";
  const code = readInlineContentAsText(block.content);

  if (language === MERMAID_LANGUAGE) {
    return {
      type: "mermaid",
      props: {
        code,
        viewMode: "split",
        title: "",
      },
    };
  }

  return {
    type: "procode",
    props: {
      code,
      language,
      title: "",
    },
  };
}

function normalizeEnterpriseEditorBlock(
  block: EnterpriseEditorBlock,
): any {
  const normalizedBlock = normalizeEnterpriseCodeBlock(block);
  if (normalizedBlock.type === "mermaid" || normalizedBlock.type === "procode") {
    return normalizedBlock;
  }

  const children = Array.isArray(block.children)
    ? block.children.map((child) => normalizeEnterpriseEditorBlock(child))
    : undefined;

  return {
    ...block,
    children,
  };
}

export function normalizeEnterpriseClipboardBlocks(
  blocks: EnterpriseEditorBlock[],
): any[] {
  return blocks.map((block) => normalizeEnterpriseEditorBlock(block));
}
