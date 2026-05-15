import {
  DEFAULT_MEDIA_PROPS,
  DEFAULT_TEXT_PROPS,
  DOCUMENT_BLOCK_ID_PREFIX,
  DocumentBlock,
  DocumentCustomInlineContent,
  DocumentInlineContent,
  DocumentStyledText,
  DocumentTableCell,
  DocumentTableContent,
  EMPTY_DOCUMENT_PARAGRAPH,
  LINE_BREAK,
  TAB_WIDTH,
} from './document-content-codec.types';

interface GeneratedBlockIdFactory {
  next(): string;
}

interface CodeFenceStart {
  marker: string;
  length: number;
  language: string;
}

interface ListItemMarker {
  indent: number;
  type: 'bulletListItem' | 'numberedListItem' | 'checkListItem';
  markerNumber?: number;
  checked?: boolean;
  content: string;
}

interface ParsedBlocks {
  blocks: DocumentBlock[];
  nextIndex: number;
}

export class DocumentMarkdownParser {
  parse(markdown: string): DocumentBlock[] {
    const lines = this.normalizeLineEndings(markdown).split(LINE_BREAK);
    const idFactory = this.createIdFactory();
    const blocks = this.parseBlocks(lines, 0, idFactory).blocks;

    if (blocks.length > 0) {
      return blocks;
    }

    return [
      this.createTextBlock('paragraph', EMPTY_DOCUMENT_PARAGRAPH, idFactory),
    ];
  }

  private parseBlocks(
    lines: string[],
    startIndex: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const blocks: DocumentBlock[] = [];
    let index = startIndex;

    while (index < lines.length) {
      if (this.isBlankLine(lines[index])) {
        index += 1;
        continue;
      }

      const parsed = this.parseNextBlock(lines, index, idFactory);
      blocks.push(...parsed.blocks);
      index = parsed.nextIndex;
    }

    return { blocks, nextIndex: index };
  }

  private parseNextBlock(
    lines: string[],
    index: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const line = lines[index];
    const trimmed = line.trim();
    const codeFence = this.matchCodeFenceStart(line);

    if (codeFence) {
      return this.parseCodeBlock(lines, index, codeFence, idFactory);
    }

    if (this.isHorizontalRule(trimmed)) {
      return {
        blocks: [this.createHorizontalRuleBlock(idFactory)],
        nextIndex: index + 1,
      };
    }

    const heading = this.matchHeading(trimmed);
    if (heading) {
      return {
        blocks: [
          this.createTextBlock('heading', heading.text, idFactory, {
            level: heading.level,
          }),
        ],
        nextIndex: index + 1,
      };
    }

    if (this.matchListItem(line)) {
      return this.parseList(lines, index, idFactory);
    }

    if (this.isBlockquote(line)) {
      return this.parseBlockquote(lines, index, idFactory);
    }

    if (this.isTableStart(lines, index)) {
      return this.parseTable(lines, index, idFactory);
    }

    const image = this.matchStandaloneImage(trimmed);
    if (image) {
      return {
        blocks: [this.createImageBlock(image.url, image.caption, idFactory)],
        nextIndex: index + 1,
      };
    }

    return this.parseParagraph(lines, index, idFactory);
  }

  private parseCodeBlock(
    lines: string[],
    startIndex: number,
    fence: CodeFenceStart,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const content: string[] = [];
    let index = startIndex + 1;

    while (index < lines.length && !this.isCodeFenceEnd(lines[index], fence)) {
      content.push(lines[index]);
      index += 1;
    }

    const nextIndex = index < lines.length ? index + 1 : index;
    return {
      blocks: [
        this.createTextBlock('codeBlock', content.join(LINE_BREAK), idFactory, {
          language: fence.language,
        }),
      ],
      nextIndex,
    };
  }

  private parseList(
    lines: string[],
    startIndex: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const roots: DocumentBlock[] = [];
    const stack: Array<{ indent: number; block: DocumentBlock }> = [];
    let index = startIndex;

    while (index < lines.length) {
      const marker = this.matchListItem(lines[index]);
      if (!marker) {
        break;
      }

      const continuation = this.collectListContinuation(
        lines,
        index + 1,
        marker,
      );
      const block = this.createListItemBlock(
        marker,
        continuation.content,
        idFactory,
      );

      while (
        stack.length > 0 &&
        marker.indent <= stack[stack.length - 1].indent
      ) {
        stack.pop();
      }

      const parent = stack[stack.length - 1]?.block;
      if (parent) {
        parent.children = [...(parent.children ?? []), block];
      } else {
        roots.push(block);
      }

      stack.push({ indent: marker.indent, block });
      index = continuation.nextIndex;
    }

    return { blocks: roots, nextIndex: index };
  }

  private parseBlockquote(
    lines: string[],
    startIndex: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const quoteLines: string[] = [];
    let index = startIndex;

    while (index < lines.length && this.isBlockquote(lines[index])) {
      quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
      index += 1;
    }

    return {
      blocks: [
        this.createTextBlock(
          'quote',
          quoteLines.join(LINE_BREAK).trimEnd(),
          idFactory,
        ),
      ],
      nextIndex: index,
    };
  }

  private parseParagraph(
    lines: string[],
    startIndex: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const paragraphLines: string[] = [];
    let index = startIndex;

    while (index < lines.length && !this.startsBlock(lines[index])) {
      if (this.isBlankLine(lines[index])) {
        break;
      }

      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    return {
      blocks: [
        this.createTextBlock(
          'paragraph',
          paragraphLines.join(' ').trim(),
          idFactory,
        ),
      ],
      nextIndex: index,
    };
  }

  private parseTable(
    lines: string[],
    startIndex: number,
    idFactory: GeneratedBlockIdFactory,
  ): ParsedBlocks {
    const headerCells = this.parseTableCells(lines[startIndex]);
    const alignmentCells = this.parseTableCells(lines[startIndex + 1]);
    const rows: Array<{ cells: DocumentTableCell[] }> = [
      {
        cells: headerCells.map((cell) => this.createTableCell(cell.trim())),
      },
    ];
    let index = startIndex + 2;

    while (index < lines.length && this.isTableDataLine(lines[index])) {
      rows.push({
        cells: this.parseTableCells(lines[index]).map((cell) =>
          this.createTableCell(cell.trim()),
        ),
      });
      index += 1;
    }

    const columnCount = Math.max(
      headerCells.length,
      ...rows.map((row) => row.cells.length),
    );
    for (const row of rows) {
      while (row.cells.length < columnCount) {
        row.cells.push(this.createTableCell(''));
      }
    }

    const alignments = alignmentCells.map((cell) =>
      this.parseTableAlignment(cell.trim()),
    );
    rows.forEach((row) => {
      row.cells.forEach((cell, cellIndex) => {
        cell.props.textAlignment = alignments[cellIndex] ?? 'left';
      });
    });

    return {
      blocks: [
        {
          id: idFactory.next(),
          type: 'table',
          props: {
            textColor: 'default',
          },
          content: {
            type: 'tableContent',
            columnWidths: Array.from({ length: columnCount }, () => undefined),
            headerRows: 1,
            rows,
          },
          children: [],
        },
      ],
      nextIndex: index,
    };
  }

  private collectListContinuation(
    lines: string[],
    startIndex: number,
    marker: ListItemMarker,
  ): { content: string; nextIndex: number } {
    const content = [marker.content];
    let index = startIndex;

    while (index < lines.length) {
      const line = lines[index];
      if (this.isBlankLine(line) || this.matchListItem(line)) {
        break;
      }

      if (this.countIndent(line) <= marker.indent) {
        break;
      }

      content.push(line.trim());
      index += 1;
    }

    return { content: content.join(' '), nextIndex: index };
  }

  private createTextBlock(
    type: string,
    markdown: string,
    idFactory: GeneratedBlockIdFactory,
    props: Record<string, boolean | number | string> = {},
  ): DocumentBlock {
    return {
      id: idFactory.next(),
      type,
      props: {
        ...DEFAULT_TEXT_PROPS,
        ...props,
      },
      content: this.parseInlineContent(markdown),
      children: [],
    };
  }

  private createListItemBlock(
    marker: ListItemMarker,
    content: string,
    idFactory: GeneratedBlockIdFactory,
  ): DocumentBlock {
    return this.createTextBlock(marker.type, content, idFactory, {
      ...(typeof marker.checked === 'boolean'
        ? { checked: marker.checked }
        : {}),
      ...(marker.markerNumber ? { start: marker.markerNumber } : {}),
    });
  }

  private createImageBlock(
    url: string,
    caption: string,
    idFactory: GeneratedBlockIdFactory,
  ): DocumentBlock {
    return {
      id: idFactory.next(),
      type: 'image',
      props: {
        ...DEFAULT_MEDIA_PROPS,
        url,
        caption,
        name: this.extractFileName(url),
      },
      content: undefined,
      children: [],
    };
  }

  private createHorizontalRuleBlock(
    idFactory: GeneratedBlockIdFactory,
  ): DocumentBlock {
    return {
      id: idFactory.next(),
      type: 'horizontalRule',
      props: {},
      content: undefined,
      children: [],
    };
  }

  private createTableCell(value: string): DocumentTableCell {
    return {
      type: 'tableCell',
      props: {
        backgroundColor: 'default',
        textColor: 'default',
        textAlignment: 'left',
      },
      content: this.parseInlineContent(value),
    };
  }

  private parseInlineContent(markdown: string): DocumentInlineContent[] {
    const result: DocumentInlineContent[] = [];
    let currentIndex = 0;

    while (currentIndex < markdown.length) {
      const match = this.findNextInlineMatch(markdown.slice(currentIndex));
      if (!match) {
        this.pushTextContent(result, markdown.slice(currentIndex));
        break;
      }

      if (match.index > 0) {
        this.pushTextContent(
          result,
          markdown.slice(currentIndex, currentIndex + match.index),
        );
      }

      if (match.type === 'link') {
        result.push({
          type: 'link',
          href: this.normalizeLinkTarget(match.href ?? ''),
          content: this.parseLinkLabelContent(match.content),
        });
      } else if (match.type === 'code') {
        result.push(this.createStyledText(match.content, { code: true }));
      } else {
        this.pushInlineContent(
          result,
          this.applyStyleToInlineContent(
            this.parseInlineContent(match.content),
            match.type,
          ),
        );
      }

      currentIndex += match.index + match.length;
    }

    return result;
  }

  private pushTextContent(result: DocumentInlineContent[], text: string): void {
    if (text.length === 0) {
      return;
    }

    result.push(this.createStyledText(text));
  }

  private pushInlineContent(
    result: DocumentInlineContent[],
    items: DocumentInlineContent[],
  ): void {
    result.push(...items);
  }

  private applyStyleToInlineContent(
    items: DocumentInlineContent[],
    style: 'bold' | 'italic' | 'strike',
  ): DocumentInlineContent[] {
    return items.map((item) => {
      if (this.isStyledText(item)) {
        return this.createStyledText(item.text, {
          ...item.styles,
          [style]: true,
        });
      }

      if (item.type === 'link') {
        const linkContent = item.content ?? [];
        return {
          ...item,
          content: linkContent.map((contentItem) =>
            this.createStyledText(contentItem.text, {
              ...contentItem.styles,
              [style]: true,
            }),
          ),
        };
      }

      return item;
    });
  }

  private parseLinkLabelContent(label: string): DocumentStyledText[] {
    return this.toStyledTextContent(this.parseInlineContent(label));
  }

  private toStyledTextContent(
    items: DocumentInlineContent[],
  ): DocumentStyledText[] {
    return items.map((item) => {
      if (this.isStyledText(item)) {
        return item;
      }

      if (item.type === 'link') {
        return this.createStyledText(
          this.inlineContentToPlainText(item.content),
        );
      }

      return this.createStyledText(
        this.inlineContentToPlainText(item.content ?? []),
      );
    });
  }

  private inlineContentToPlainText(
    content: DocumentInlineContent[] | DocumentStyledText[] | undefined,
  ): string {
    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((item) => {
        if (this.isStyledText(item)) {
          return item.text;
        }

        if (this.hasInlineContent(item)) {
          return this.inlineContentToPlainText(item.content);
        }

        return '';
      })
      .join('');
  }

  private isStyledText(
    item: DocumentInlineContent | DocumentStyledText,
  ): item is DocumentStyledText {
    return item.type === 'text' && 'text' in item && 'styles' in item;
  }

  private hasInlineContent(
    item: DocumentInlineContent | DocumentStyledText,
  ): item is DocumentCustomInlineContent {
    return 'content' in item;
  }

  private createStyledText(
    text: string,
    styles: Record<string, boolean | string> = {},
  ): DocumentStyledText {
    return { type: 'text', text, styles };
  }

  private findNextInlineMatch(source: string): {
    index: number;
    length: number;
    type: 'link' | 'code' | 'strike' | 'bold' | 'italic';
    content: string;
    href?: string;
  } | null {
    const matches = [
      this.matchInlinePattern(
        source,
        /(?<!!)\[([^\]\n]*)\]\(([^)\n]+)\)/,
        'link',
        (match) => ({
          content: match[1],
          href: match[2],
        }),
      ),
      this.matchInlinePattern(source, /`([^`\n]+)`/, 'code', (match) => ({
        content: match[1],
      })),
      this.matchInlinePattern(source, /~~([^\n]+?)~~/, 'strike', (match) => ({
        content: match[1],
      })),
      this.matchInlinePattern(
        source,
        /\*\*([^\n]+?)\*\*|__([^\n]+?)__/,
        'bold',
        (match) => ({
          content: match[1] || match[2],
        }),
      ),
      this.matchInlinePattern(
        source,
        /(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/,
        'italic',
        (match) => ({
          content: match[1] || match[2],
        }),
      ),
    ].filter((item) => item !== null);

    if (matches.length === 0) {
      return null;
    }

    return matches.reduce((current, next) => {
      if (next.index < current.index) {
        return next;
      }
      return current;
    });
  }

  private matchInlinePattern(
    source: string,
    pattern: RegExp,
    type: 'link' | 'code' | 'strike' | 'bold' | 'italic',
    buildContent: (match: RegExpExecArray) => {
      content: string;
      href?: string;
    },
  ): {
    index: number;
    length: number;
    type: 'link' | 'code' | 'strike' | 'bold' | 'italic';
    content: string;
    href?: string;
  } | null {
    const match = pattern.exec(source);
    if (!match || typeof match.index !== 'number') {
      return null;
    }

    const content = buildContent(match);
    return {
      index: match.index,
      length: match[0].length,
      type,
      content: content.content,
      href: content.href,
    };
  }

  private startsBlock(line: string): boolean {
    return (
      this.startsStructuredBlock(line) ||
      this.matchStandaloneImage(line.trim()) !== null
    );
  }

  private startsStructuredBlock(line: string): boolean {
    const trimmed = line.trim();
    return (
      this.isBlankLine(line) ||
      this.matchCodeFenceStart(line) !== null ||
      this.isHorizontalRule(trimmed) ||
      this.matchHeading(trimmed) !== null ||
      this.matchListItem(line) !== null ||
      this.isBlockquote(line)
    );
  }

  private matchCodeFenceStart(line: string): CodeFenceStart | null {
    const match = line.match(/^\s*(`{3,}|~{3,})\s*([^`]*)$/);
    if (!match) {
      return null;
    }

    return {
      marker: match[1][0],
      length: match[1].length,
      language: match[2].trim(),
    };
  }

  private isCodeFenceEnd(line: string, fence: CodeFenceStart): boolean {
    const escapedMarker = this.escapeRegExp(fence.marker);
    const pattern = new RegExp(`^\\s*${escapedMarker}{${fence.length},}\\s*$`);
    return pattern.test(line);
  }

  private matchHeading(line: string): { level: number; text: string } | null {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      return null;
    }

    return { level: match[1].length, text: match[2] };
  }

  private matchListItem(line: string): ListItemMarker | null {
    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      return {
        indent: this.countIndent(task[1]),
        type: 'checkListItem',
        checked: task[2].toLowerCase() === 'x',
        content: task[3].trim(),
      };
    }

    const bullet = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (bullet) {
      return {
        indent: this.countIndent(bullet[1]),
        type: 'bulletListItem',
        content: bullet[3].trim(),
      };
    }

    const numbered = line.match(/^(\s*)(\d{1,9})[.)]\s+(.+)$/);
    if (!numbered) {
      return null;
    }

    return {
      indent: this.countIndent(numbered[1]),
      type: 'numberedListItem',
      markerNumber: Number(numbered[2]),
      content: numbered[3].trim(),
    };
  }

  private matchStandaloneImage(
    line: string,
  ): { caption: string; url: string } | null {
    const match = line.match(/^!\[([^\]\n]*)\]\(([^)\n]+)\)$/);
    if (!match) {
      return null;
    }

    return {
      caption: match[1],
      url: this.normalizeLinkTarget(match[2]),
    };
  }

  private isHorizontalRule(line: string): boolean {
    return /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
  }

  private isBlockquote(line: string): boolean {
    return /^\s*>/.test(line);
  }

  private isBlankLine(line: string): boolean {
    return line.trim().length === 0;
  }

  private isTableStart(lines: string[], index: number): boolean {
    if (index + 1 >= lines.length) {
      return false;
    }

    return (
      this.isTableDataLine(lines[index]) &&
      this.isTableAlignmentLine(lines[index + 1])
    );
  }

  private isTableDataLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.includes('|') && !this.startsStructuredBlock(line);
  }

  private isTableAlignmentLine(line: string): boolean {
    const cells = this.parseTableCells(line);
    return (
      cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
    );
  }

  private parseTableCells(line: string): string[] {
    const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return normalized.split('|');
  }

  private parseTableAlignment(
    value: string,
  ): 'left' | 'center' | 'right' | 'justify' {
    if (value.startsWith(':') && value.endsWith(':')) {
      return 'center';
    }
    if (value.startsWith(':')) {
      return 'left';
    }
    if (value.endsWith(':')) {
      return 'right';
    }
    return 'left';
  }

  private countIndent(value: string): number {
    return Array.from(value).reduce((total, char) => {
      return total + (char === '\t' ? TAB_WIDTH : 1);
    }, 0);
  }

  private normalizeLineEndings(value: string): string {
    return value.replace(/\r\n?/g, LINE_BREAK);
  }

  private normalizeLinkTarget(value: string): string {
    return value.trim().replace(/^<(.+)>$/, '$1');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractFileName(url: string): string {
    const cleanUrl = url.split(/[?#]/)[0];
    const segments = cleanUrl
      .split('/')
      .filter((segment) => segment.length > 0);

    return segments[segments.length - 1] ?? '';
  }

  private createIdFactory(): GeneratedBlockIdFactory {
    let counter = 0;

    return {
      next: () => {
        counter += 1;
        return `${DOCUMENT_BLOCK_ID_PREFIX}-${counter}`;
      },
    };
  }
}
