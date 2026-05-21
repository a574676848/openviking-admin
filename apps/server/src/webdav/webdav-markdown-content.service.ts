import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';
import type { Principal } from '../capabilities/domain/capability.types';
import {
  DOCUMENT_CONTENT_DOWNLOAD_LABEL,
  DOCUMENT_CONTENT_DOWNLOAD_PATH,
} from '../document/constants';
import { DocumentDraftRepository } from '../document/document-draft.repository';
import { DocumentService } from '../document/document.service';

export interface WebdavMarkdownNode {
  id: string;
  kbId: string;
  name: string;
  contentUri: string | null;
}

export interface WebdavMarkdownContent {
  body: string | Readable;
  contentLength?: string;
}

@Injectable()
export class WebdavMarkdownContentService {
  constructor(
    private readonly documentDraftRepository: DocumentDraftRepository,
    private readonly ovClientService: OVClientService,
    private readonly documentService: DocumentService,
  ) {}

  async load(
    node: WebdavMarkdownNode,
    tenantScope: string,
    principal: Principal,
  ): Promise<WebdavMarkdownContent> {
    const draft = await this.documentDraftRepository.findByNode(
      node.id,
      tenantScope,
    );

    if (draft && (draft.markdown.trim().length > 0 || node.contentUri)) {
      return { body: draft.markdown };
    }

    if (node.contentUri) {
      const response = await this.ovClientService.requestStream(
        this.resolveConnection(principal),
        `${DOCUMENT_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(node.contentUri)}`,
        'GET',
        undefined,
        {
          user:
            principal.ovConfig.user ?? principal.username ?? principal.userId,
        },
        { serviceLabel: DOCUMENT_CONTENT_DOWNLOAD_LABEL },
      );
      return {
        body: response.stream,
        contentLength: response.contentLength,
      };
    }

    const snapshot = await this.documentService.loadContent(
      node.id,
      tenantScope,
    );
    return { body: snapshot.markdown };
  }

  private resolveConnection(principal: Principal): OVConnection {
    return {
      baseUrl: principal.ovConfig.baseUrl,
      apiKey: principal.ovConfig.apiKey,
      account: principal.ovConfig.account,
      user: principal.ovConfig.user ?? principal.username ?? principal.userId,
    };
  }
}
