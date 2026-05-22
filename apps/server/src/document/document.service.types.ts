import { type OVStreamResponse } from '../common/ov-client.service';
import { type DocumentBlock } from './document-content-codec';

export interface DocumentContentSnapshot {
  nodeId: string;
  kbId: string;
  name: string;
  contentUri: string | null;
  draftVersion: number;
  indexedVersion: number;
  indexStatus: string;
  markdown: string;
  blocks: DocumentBlock[];
  updatedAt: Date;
}

export interface DocumentMetadata {
  nodeId: string;
  kbId: string;
  name: string;
  contentUri: string | null;
  draftVersion: number;
  indexedVersion: number;
  indexStatus: string;
  vectorCount: number | null;
  lastIndexedAt: Date | null;
  indexError: string | null;
  readOnly: boolean;
  canWrite: boolean;
  draftReady: boolean;
  collab: {
    path: string;
    documentName: string;
  };
  updatedAt: Date;
}

export interface DocumentSaveResult {
  nodeId: string;
  contentUri: string | null;
  draftVersion: number;
  indexStatus: string;
  updatedAt: Date;
}

export interface DocumentIndexResult {
  nodeId: string;
  contentUri: string;
  draftVersion: number;
  indexedVersion: number;
  indexStatus: string;
  vectorCount: number | null;
  lastIndexedAt: Date | null;
}

export interface DocumentSaveOptions {
  assertNoActiveWriteSession?: boolean;
}

export interface DocumentLoadOptions {
  // 控制从 OV 引擎拉取正文的最长等待时间；超时会抛错而不是无限期持有上游连接。
  ovFetchTimeoutMs?: number;
}

export interface DocumentAssetUploadFile {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
  size: number;
}

export interface DocumentAssetUploadResult {
  path: string;
  uri: string;
}

export type DocumentAssetStream = OVStreamResponse;
