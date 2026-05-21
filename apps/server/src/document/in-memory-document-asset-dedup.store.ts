import { Inject, Injectable, Optional } from '@nestjs/common';
import { DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS } from './constants';
import {
  DOCUMENT_ASSET_DEDUP_STORE_OPTIONS,
  type DocumentAssetDedupEntry,
  type DocumentAssetDedupStore,
  type DocumentAssetDedupStoreOptions,
} from './document-asset-dedup.store';

@Injectable()
export class InMemoryDocumentAssetDedupStore implements DocumentAssetDedupStore {
  private readonly entries = new Map<
    string,
    { expiresAt: number; values: Map<string, string> }
  >();

  constructor(
    @Optional()
    @Inject(DOCUMENT_ASSET_DEDUP_STORE_OPTIONS)
    private readonly options?: DocumentAssetDedupStoreOptions,
  ) {}

  async get(nodeId: string, hash: string): Promise<string | null> {
    this.cleanupExpired();
    return this.entries.get(nodeId)?.values.get(hash) ?? null;
  }

  async set(nodeId: string, hash: string, assetPath: string): Promise<void> {
    const nodeEntries = this.ensureNodeEntries(nodeId);
    nodeEntries.values.set(hash, assetPath);
    nodeEntries.expiresAt = this.nextExpiresAt();
  }

  async getAll(nodeId: string): Promise<DocumentAssetDedupEntry[]> {
    this.cleanupExpired();
    const nodeEntries = this.entries.get(nodeId);
    if (!nodeEntries) {
      return [];
    }

    return Array.from(nodeEntries.values.entries()).map(
      ([entryHash, entryPath]) => ({
        hash: entryHash,
        assetPath: entryPath,
      }),
    );
  }

  async replaceAll(
    nodeId: string,
    entries: DocumentAssetDedupEntry[],
  ): Promise<void> {
    this.entries.set(nodeId, {
      expiresAt: this.nextExpiresAt(),
      values: new Map(entries.map((entry) => [entry.hash, entry.assetPath])),
    });
  }

  cleanupExpired(now = Date.now()) {
    let deleted = 0;
    for (const [nodeId, entry] of this.entries.entries()) {
      if (entry.expiresAt > now) {
        continue;
      }
      this.entries.delete(nodeId);
      deleted += 1;
    }
    return deleted;
  }

  private ensureNodeEntries(nodeId: string) {
    this.cleanupExpired();
    let nodeEntries = this.entries.get(nodeId);
    if (!nodeEntries) {
      nodeEntries = {
        expiresAt: this.nextExpiresAt(),
        values: new Map<string, string>(),
      };
      this.entries.set(nodeId, nodeEntries);
    }
    return nodeEntries;
  }

  private nextExpiresAt() {
    return Date.now() + this.resolveTtlSeconds() * 1000;
  }

  private resolveTtlSeconds() {
    const ttlSeconds = Number(this.options?.ttlSeconds);
    return Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? ttlSeconds
      : DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS;
  }
}
