import { Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { importEsmModule } from '../common/esm-import.util';
import { DocumentBlock, DocumentContentCodec } from './document-content-codec';
import type { DocumentTableContent } from './document-content-codec.types';
import { DOCUMENT_YJS_FRAGMENT_NAME } from './constants';

const BLOCKNOTE_CORE_MODULE = '@blocknote/core';
const BLOCKNOTE_YJS_MODULE = '@blocknote/core/yjs';
const TEST_YDOC_BLOCKS_KEY = 'blocks';
const TEST_YDOC_BLOCKS_VALUE_KEY = 'value';
const TEST_YDOC_FRAGMENT_TEXT = 'document';

jest.mock('../common/esm-import.util', () => ({
  importEsmModule: jest.fn(),
}));

describe('DocumentContentCodec', () => {
  let codec: DocumentContentCodec;
  const importEsmModuleMock = jest.mocked(importEsmModule);

  beforeEach(() => {
    importEsmModuleMock.mockImplementation(async (specifier: string) => {
      if (specifier === BLOCKNOTE_CORE_MODULE) {
        return {
          BlockNoteEditor: {
            create: () => ({}),
          },
        };
      }
      if (specifier === BLOCKNOTE_YJS_MODULE) {
        return {
          blocksToYDoc: (
            _editor: unknown,
            blocks: DocumentBlock[],
            fragmentName: string,
          ) => {
            const yDoc = new Y.Doc();
            const fragmentText = new Y.XmlText();
            fragmentText.insert(0, TEST_YDOC_FRAGMENT_TEXT);
            yDoc.getXmlFragment(fragmentName).insert(0, [fragmentText]);
            yDoc
              .getMap(TEST_YDOC_BLOCKS_KEY)
              .set(TEST_YDOC_BLOCKS_VALUE_KEY, JSON.stringify(blocks));
            return yDoc;
          },
          yDocToBlocks: (_editor: unknown, yDoc: Y.Doc) => {
            const serializedBlocks = yDoc
              .getMap(TEST_YDOC_BLOCKS_KEY)
              .get(TEST_YDOC_BLOCKS_VALUE_KEY);
            return typeof serializedBlocks === 'string'
              ? JSON.parse(serializedBlocks)
              : [];
          },
        };
      }
      throw new Error(`未配置的 ESM 测试模块：${specifier}`);
    });
    codec = new DocumentContentCodec();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('应该支持常规 Markdown 元素往返转换', () => {
    const markdown = [
      '# 标题',
      '',
      '第一段包含 [OpenViking](https://example.com) 链接。',
      '',
      '- 第一项',
      '- 第二项',
      '',
      '1. 第一步',
      '2. 第二步',
      '',
      '> 引用内容',
      '',
      '```ts',
      'const value = "ok";',
      '```',
      '',
      '![架构图](assets/diagram.png)',
      '',
      '---',
    ].join('\n');

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'bulletListItem',
      'bulletListItem',
      'numberedListItem',
      'numberedListItem',
      'quote',
      'codeBlock',
      'image',
      'horizontalRule',
    ]);
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该把链接解析为 BlockNote 行内 link 内容', () => {
    const blocks = codec.markdownToBlocks(
      '访问 [OpenViking](https://example.com/docs) 文档。',
    );

    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [
        { type: 'text', text: '访问 ' },
        {
          type: 'link',
          href: 'https://example.com/docs',
          content: [{ type: 'text', text: 'OpenViking' }],
        },
        { type: 'text', text: ' 文档。' },
      ],
    });
  });

  it('应该支持行内样式与行内代码的 Markdown 往返转换', () => {
    const markdown = '支持 **粗体**、*斜体*、~~删除线~~ 和 `inlineCode`。';

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [
        { type: 'text', text: '支持 ', styles: {} },
        { type: 'text', text: '粗体', styles: { bold: true } },
        { type: 'text', text: '、', styles: {} },
        { type: 'text', text: '斜体', styles: { italic: true } },
        { type: 'text', text: '、', styles: {} },
        { type: 'text', text: '删除线', styles: { strike: true } },
        { type: 'text', text: ' 和 ', styles: {} },
        { type: 'text', text: 'inlineCode', styles: { code: true } },
        { type: 'text', text: '。', styles: {} },
      ],
    });
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该保留嵌套列表层级', () => {
    const markdown = ['- 父项', '  - 子项', '- 另一项'].join('\n');

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks[0].children?.[0]).toMatchObject({
      type: 'bulletListItem',
      content: [{ type: 'text', text: '子项' }],
    });
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该支持 GFM 任务列表往返转换', () => {
    const markdown = ['- [x] 已完成任务', '- [ ] 待处理任务'].join('\n');

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks).toMatchObject([
      {
        type: 'checkListItem',
        props: expect.objectContaining({ checked: true }),
        content: [{ type: 'text', text: '已完成任务', styles: {} }],
      },
      {
        type: 'checkListItem',
        props: expect.objectContaining({ checked: false }),
        content: [{ type: 'text', text: '待处理任务', styles: {} }],
      },
    ]);
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该保留 Mermaid 文本绘图代码块的语言标记', () => {
    const markdown = [
      '```mermaid',
      'flowchart TD',
      '  A[开始] --> B[结束]',
      '```',
    ].join('\n');

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks).toMatchObject([
      {
        type: 'codeBlock',
        props: expect.objectContaining({ language: 'mermaid' }),
        content: [
          {
            type: 'text',
            text: 'flowchart TD\n  A[开始] --> B[结束]',
            styles: {},
          },
        ],
      },
    ]);
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该支持 GFM 表格往返转换', () => {
    const markdown = [
      '| 功能 | 状态 |',
      '| :--- | ---: |',
      '| Markdown | 已接入 |',
      '| Mermaid | 进行中 |',
    ].join('\n');

    const blocks = codec.markdownToBlocks(markdown);

    expect(blocks[0]).toMatchObject({
      type: 'table',
      content: {
        type: 'tableContent',
        headerRows: 1,
      },
    });
    const tableContent = blocks[0].content as unknown as DocumentTableContent;
    expect(tableContent.rows).toHaveLength(3);
    expect(tableContent.rows[0].cells[0]).toMatchObject({
      type: 'tableCell',
      content: [{ type: 'text', text: '功能', styles: {} }],
      props: expect.objectContaining({ textAlignment: 'left' }),
    });
    expect(tableContent.rows[0].cells[1]).toMatchObject({
      type: 'tableCell',
      content: [{ type: 'text', text: '状态', styles: {} }],
      props: expect.objectContaining({ textAlignment: 'right' }),
    });
    expect(codec.blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('应该把空 Markdown 转成空段落结构', () => {
    const blocks = codec.markdownToBlocks('');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [],
      children: [],
    });
    expect(codec.blocksToMarkdown(blocks)).toBe('');
  });

  it('应该把不支持的块降级为纯文本段落并记录 warn 日志', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const blocks: DocumentBlock[] = [
      {
        id: 'unsupported-1',
        type: 'embed-card',
        props: {},
        content: [{ type: 'text', text: '表格内容', styles: {} }],
        children: [],
      },
    ];

    expect(codec.blocksToMarkdown(blocks)).toBe('表格内容');
    expect(warnSpy).toHaveBeenCalledWith(
      '不支持的 BlockNote 块类型，已降级为普通段落: embed-card',
    );

    warnSpy.mockRestore();
  });

  it('应该通过 BlockNote Yjs 工具完成 Markdown 与 Y.Doc 往返', async () => {
    const markdown = ['# 协作文档', '', '第一段内容。'].join('\n');

    const yDoc = await codec.markdownToYDoc(markdown);
    const fragment = yDoc.getXmlFragment(DOCUMENT_YJS_FRAGMENT_NAME);
    const restoredMarkdown = await codec.yDocToMarkdown(yDoc);

    expect(fragment.length).toBeGreaterThan(0);
    expect(restoredMarkdown).toBe(markdown);
    expect(importEsmModuleMock).toHaveBeenCalledWith(BLOCKNOTE_CORE_MODULE);
    expect(importEsmModuleMock).toHaveBeenCalledWith(BLOCKNOTE_YJS_MODULE);
  });
});
