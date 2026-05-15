import { Injectable, Logger } from '@nestjs/common';
import type { Doc } from 'yjs';
import { importEsmModule } from '../common/esm-import.util';
import { DOCUMENT_YJS_FRAGMENT_NAME } from './constants';
import { DocumentMarkdownParser } from './document-markdown-parser';
import { DocumentMarkdownRenderer } from './document-markdown-renderer';
import { DocumentBlock } from './document-content-codec.types';

const BLOCKNOTE_CORE_MODULE = '@blocknote/core';
const BLOCKNOTE_YJS_MODULE = '@blocknote/core/yjs';

interface BlockNoteCoreModule {
  BlockNoteEditor: {
    create(): unknown;
  };
}

interface BlockNoteYjsModule {
  blocksToYDoc(
    editor: unknown,
    blocks: DocumentBlock[],
    fragmentName: string,
  ): Doc;
  yDocToBlocks(
    editor: unknown,
    document: Doc,
    fragmentName: string,
  ): DocumentBlock[];
}

interface BlockNoteYjsRuntime extends BlockNoteYjsModule {
  editor: unknown;
}

export type {
  DocumentBlock,
  DocumentCustomInlineContent,
  DocumentInlineContent,
  DocumentLink,
  DocumentStyledText,
} from './document-content-codec.types';

@Injectable()
export class DocumentContentCodec {
  private readonly logger = new Logger(DocumentContentCodec.name);
  private readonly parser = new DocumentMarkdownParser();
  private readonly renderer = new DocumentMarkdownRenderer(this.logger);
  private blockNoteRuntime?: Promise<BlockNoteYjsRuntime>;

  markdownToBlocks(markdown: string): DocumentBlock[] {
    return this.parser.parse(markdown);
  }

  blocksToMarkdown(blocks: DocumentBlock[]): string {
    return this.renderer.render(blocks);
  }

  async markdownToYDoc(markdown: string): Promise<Doc> {
    return this.blocksToYDoc(this.markdownToBlocks(markdown));
  }

  async yDocToMarkdown(document: Doc): Promise<string> {
    return this.blocksToMarkdown(await this.yDocToBlocks(document));
  }

  async blocksToYDoc(blocks: DocumentBlock[]): Promise<Doc> {
    const runtime = await this.loadBlockNoteRuntime();
    return runtime.blocksToYDoc(
      runtime.editor,
      blocks,
      DOCUMENT_YJS_FRAGMENT_NAME,
    );
  }

  async yDocToBlocks(document: Doc): Promise<DocumentBlock[]> {
    const runtime = await this.loadBlockNoteRuntime();
    return runtime.yDocToBlocks(
      runtime.editor,
      document,
      DOCUMENT_YJS_FRAGMENT_NAME,
    );
  }

  private loadBlockNoteRuntime(): Promise<BlockNoteYjsRuntime> {
    this.blockNoteRuntime ??= this.createBlockNoteRuntime();
    return this.blockNoteRuntime;
  }

  private async createBlockNoteRuntime(): Promise<BlockNoteYjsRuntime> {
    const [coreModule, yjsModule] = await Promise.all([
      importEsmModule<BlockNoteCoreModule>(BLOCKNOTE_CORE_MODULE),
      importEsmModule<BlockNoteYjsModule>(BLOCKNOTE_YJS_MODULE),
    ]);

    return {
      editor: coreModule.BlockNoteEditor.create(),
      blocksToYDoc: yjsModule.blocksToYDoc,
      yDocToBlocks: yjsModule.yDocToBlocks,
    };
  }
}
