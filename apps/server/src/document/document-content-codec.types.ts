export type DocumentInlineContent =
  | DocumentStyledText
  | DocumentLink
  | DocumentCustomInlineContent;

export interface DocumentStyledText {
  type: 'text';
  text: string;
  styles: Record<string, boolean | string>;
}

export interface DocumentLink {
  type: 'link';
  href: string;
  content: DocumentStyledText[];
}

export interface DocumentCustomInlineContent {
  type: string;
  content?: DocumentStyledText[];
  props?: Record<string, boolean | number | string>;
}

export interface DocumentTableCell {
  type: 'tableCell';
  props: Record<string, boolean | number | string>;
  content: DocumentInlineContent[];
}

export interface DocumentTableContent {
  type: 'tableContent';
  columnWidths: Array<number | undefined>;
  headerRows?: number;
  headerCols?: number;
  rows: Array<{
    cells: DocumentTableCell[];
  }>;
}

export interface DocumentBlock {
  id?: string;
  type: string;
  props?: Record<string, boolean | number | string>;
  content?: DocumentInlineContent[] | DocumentTableContent | string;
  children?: DocumentBlock[];
}

export const DOCUMENT_BLOCK_ID_PREFIX = 'document-block';
export const DEFAULT_TEXT_PROPS = {
  textColor: 'default',
  backgroundColor: 'default',
  textAlignment: 'left',
} as const;
export const DEFAULT_MEDIA_PROPS = {
  backgroundColor: 'default',
  caption: '',
  name: '',
  previewWidth: 512,
  showPreview: true,
} as const;
export const DEFAULT_HEADING_LEVEL = 1;
export const MAX_HEADING_LEVEL = 6;
export const MIN_CODE_FENCE_LENGTH = 3;
export const LIST_CHILD_INDENT = 2;
export const TAB_WIDTH = 4;
export const BLOCK_SEPARATOR = '\n\n';
export const LINE_BREAK = '\n';
export const HORIZONTAL_RULE_MARKDOWN = '---';
export const EMPTY_DOCUMENT_PARAGRAPH = '';
export const UNSUPPORTED_BLOCK_WARN_PREFIX =
  '不支持的 BlockNote 块类型，已降级为普通段落';
