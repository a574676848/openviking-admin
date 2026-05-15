import { Logger } from '@nestjs/common';
import {
  BLOCK_SEPARATOR,
  DEFAULT_HEADING_LEVEL,
  DocumentBlock,
  DocumentInlineContent,
  DocumentLink,
  DocumentStyledText,
  DocumentTableContent,
  HORIZONTAL_RULE_MARKDOWN,
  LINE_BREAK,
  LIST_CHILD_INDENT,
  MAX_HEADING_LEVEL,
  MIN_CODE_FENCE_LENGTH,
  UNSUPPORTED_BLOCK_WARN_PREFIX,
} from './document-content-codec.types';

interface ParsedBlocks {
  blocks: DocumentBlock[];
  nextIndex: number;
}

export class DocumentMarkdownRenderer {
  constructor(private readonly logger: Logger) {}

  render(blocks: DocumentBlock[]): string {
    return this.renderBlocks(blocks).trimEnd();
  }

  private renderBlocks(blocks: DocumentBlock[]): string {
    const chunks: string[] = [];
    let index = 0;

    while (index < blocks.length) {
      if (this.isListBlock(blocks[index])) {
        const list = this.collectConsecutiveListItems(blocks, index);
        chunks.push(this.renderListItems(list.blocks, 0).join(LINE_BREAK));
        index = list.nextIndex;
        continue;
      }

      chunks.push(this.renderBlock(blocks[index]));
      index += 1;
    }

    return chunks
      .filter((chunk) => chunk.trim().length > 0)
      .join(BLOCK_SEPARATOR);
  }

  private renderBlock(block: DocumentBlock): string {
    switch (block.type) {
      case 'paragraph':
        return this.renderInlineContent(block.content);
      case 'heading':
        return this.renderHeading(block);
      case 'quote':
        return this.renderQuote(block);
      case 'codeBlock':
        return this.renderCodeBlock(block);
      case 'checkListItem':
      case 'bulletListItem':
      case 'numberedListItem':
        return '';
      case 'table':
        return this.renderTable(block);
      case 'image':
        return this.renderImage(block);
      case 'horizontalRule':
        return HORIZONTAL_RULE_MARKDOWN;
      default:
        return this.renderUnsupportedBlock(block);
    }
  }

  private renderHeading(block: DocumentBlock): string {
    const level = this.clampHeadingLevel(block.props?.level);
    return `${'#'.repeat(level)} ${this.renderInlineContent(block.content)}`.trimEnd();
  }

  private renderQuote(block: DocumentBlock): string {
    const content = this.inlineContentToPlainText(block.content);
    return content
      .split(LINE_BREAK)
      .map((line) => `> ${line}`.trimEnd())
      .join(LINE_BREAK);
  }

  private renderCodeBlock(block: DocumentBlock): string {
    const code = this.inlineContentToPlainText(block.content);
    const language = this.asString(block.props?.language);
    const fence = this.createCodeFence(code);

    return [`${fence}${language}`, code, fence].join(LINE_BREAK);
  }

  private renderImage(block: DocumentBlock): string {
    const url = this.asString(block.props?.url);
    const caption = this.asString(block.props?.caption);
    const name = this.asString(block.props?.name);
    const alt = caption || name;

    if (!url) {
      return this.renderUnsupportedBlock(block);
    }

    return `![${this.escapeLinkLabel(alt)}](${this.escapeLinkTarget(url)})`;
  }

  private renderTable(block: DocumentBlock): string {
    if (!this.isTableContent(block.content)) {
      return this.renderUnsupportedBlock(block);
    }

    const rows = block.content.rows;
    if (rows.length === 0) {
      return this.renderUnsupportedBlock(block);
    }

    const headerRow = rows[0];
    const headerLine = this.renderTableRow(headerRow.cells.map((cell) =>
      this.inlineContentToPlainText(cell.content),
    ));
    const alignmentLine = this.renderTableAlignmentRow(headerRow.cells.map((cell) =>
      this.resolveTableAlignment(cell.props?.textAlignment),
    ));
    const bodyLines = rows.slice(1).map((row) =>
      this.renderTableRow(
        row.cells.map((cell) => this.inlineContentToPlainText(cell.content)),
      ),
    );

    return [headerLine, alignmentLine, ...bodyLines].join(LINE_BREAK);
  }

  private renderUnsupportedBlock(block: DocumentBlock): string {
    this.logger.warn(`${UNSUPPORTED_BLOCK_WARN_PREFIX}: ${block.type}`);
    return this.blockToPlainText(block).trim();
  }

  private renderListItems(blocks: DocumentBlock[], depth: number): string[] {
    const lines: string[] = [];
    const indent = ' '.repeat(depth * LIST_CHILD_INDENT);
    let orderedIndex = 1;

    for (const block of blocks) {
      const marker = this.createListMarker(block, orderedIndex);
      const content = this.renderInlineContent(block.content);
      lines.push(`${indent}${marker} ${content}`.trimEnd());

      if (block.type === 'numberedListItem') {
        orderedIndex += 1;
      }

      if (block.children && block.children.length > 0) {
        lines.push(...this.renderListItems(block.children, depth + 1));
      }
    }

    return lines;
  }

  private createListMarker(block: DocumentBlock, orderedIndex: number): string {
    if (block.type === 'bulletListItem') {
      return '-';
    }

    if (block.type === 'checkListItem') {
      return block.props?.checked ? '- [x]' : '- [ ]';
    }

    const start = this.asNumber(block.props?.start);
    return `${start ?? orderedIndex}.`;
  }

  private collectConsecutiveListItems(
    blocks: DocumentBlock[],
    startIndex: number,
  ): ParsedBlocks {
    const listBlocks: DocumentBlock[] = [];
    const listType = blocks[startIndex].type;
    let index = startIndex;

    while (
      index < blocks.length &&
      this.isListBlock(blocks[index]) &&
      blocks[index].type === listType
    ) {
      listBlocks.push(blocks[index]);
      index += 1;
    }

    return { blocks: listBlocks, nextIndex: index };
  }

  private renderInlineContent(content: DocumentBlock['content']): string {
    if (typeof content === 'string') {
      return this.escapePlainText(content);
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content.map((item) => this.renderInlineItem(item)).join('');
  }

  private renderInlineItem(item: DocumentInlineContent): string {
    if (this.isStyledText(item)) {
      return this.renderStyledText(item);
    }

    if (this.isLink(item)) {
      const text = item.content
        .map((contentItem) => this.escapeLinkLabel(contentItem.text))
        .join('');
      return `[${text}](${this.escapeLinkTarget(item.href)})`;
    }

    this.logger.warn(
      `不支持的 BlockNote 行内内容，已降级为纯文本: ${item.type}`,
    );
    return this.inlineContentToPlainText(item.content);
  }

  private inlineContentToPlainText(
    content: DocumentBlock['content'] | DocumentStyledText[] | undefined,
  ): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((item) => {
        if (this.isStyledText(item)) {
          return item.text;
        }

        if (this.isLink(item)) {
          return this.inlineContentToPlainText(item.content);
        }

        return this.inlineContentToPlainText(item.content);
      })
      .join('');
  }

  private blockToPlainText(block: DocumentBlock): string {
    const parts = [this.inlineContentToPlainText(block.content)];

    for (const child of block.children ?? []) {
      const childText = this.blockToPlainText(child);
      if (childText.length > 0) {
        parts.push(childText);
      }
    }

    return parts.filter((part) => part.length > 0).join(LINE_BREAK);
  }

  private isListBlock(block: DocumentBlock): boolean {
    return (
      block.type === 'bulletListItem' ||
      block.type === 'numberedListItem' ||
      block.type === 'checkListItem'
    );
  }

  private isStyledText(
    item: DocumentInlineContent | DocumentStyledText,
  ): item is DocumentStyledText {
    return item.type === 'text' && 'text' in item;
  }

  private isLink(item: DocumentInlineContent): item is DocumentLink {
    return (
      item.type === 'link' && 'href' in item && Array.isArray(item.content)
    );
  }

  private clampHeadingLevel(value: unknown): number {
    const level = this.asNumber(value) ?? DEFAULT_HEADING_LEVEL;
    return Math.min(Math.max(level, DEFAULT_HEADING_LEVEL), MAX_HEADING_LEVEL);
  }

  private createCodeFence(code: string): string {
    const backtickRuns: string[] = code.match(/`+/g) ?? [];
    const longestRun = backtickRuns.reduce(
      (max, run) => Math.max(max, run.length),
      0,
    );
    const length = Math.max(MIN_CODE_FENCE_LENGTH, longestRun + 1);

    return '`'.repeat(length);
  }

  private isTableContent(
    content: DocumentBlock['content'],
  ): content is DocumentTableContent {
    return Boolean(
      content &&
        typeof content === 'object' &&
        'type' in content &&
        content.type === 'tableContent' &&
        'rows' in content &&
        Array.isArray(content.rows),
    );
  }

  private renderTableRow(cells: string[]): string {
    return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`;
  }

  private renderTableAlignmentRow(
    alignments: Array<'left' | 'center' | 'right' | 'justify'>,
  ): string {
    return this.renderTableRow(
      alignments.map((alignment) => {
        if (alignment === 'center') {
          return ':---:';
        }
        if (alignment === 'left') {
          return ':---';
        }
        if (alignment === 'right') {
          return '---:';
        }
        return ':---';
      }),
    );
  }

  private resolveTableAlignment(
    value: unknown,
  ): 'left' | 'center' | 'right' | 'justify' {
    if (
      value === 'left' ||
      value === 'center' ||
      value === 'right' ||
      value === 'justify'
    ) {
      return value;
    }
    return 'left';
  }

  private createInlineCodeDelimiter(value: string): string {
    const backtickRuns: string[] = value.match(/`+/g) ?? [];
    const longestRun = backtickRuns.reduce(
      (max, run) => Math.max(max, run.length),
      0,
    );
    return '`'.repeat(Math.max(1, longestRun + 1));
  }

  private renderStyledText(item: DocumentStyledText): string {
    const styles = item.styles ?? {};
    const text = item.text;

    if (styles.code) {
      const delimiter = this.createInlineCodeDelimiter(text);
      return `${delimiter}${text}${delimiter}`;
    }

    let rendered = this.escapePlainText(text);
    if (styles.italic) {
      rendered = `*${rendered}*`;
    }
    if (styles.bold) {
      rendered = `**${rendered}**`;
    }
    if (styles.strike) {
      rendered = `~~${rendered}~~`;
    }

    return rendered;
  }

  private escapePlainText(value: string): string {
    return value.replace(/([\\[\]()])/g, '\\$1');
  }

  private escapeLinkLabel(value: string): string {
    return value.replace(/([\\[\]])/g, '\\$1');
  }

  private escapeLinkTarget(value: string): string {
    return value.replace(/([\\)])/g, '\\$1');
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }
}
