import { Injectable } from '@nestjs/common';
import {
  type DocumentAssetDedupEntry,
  type DocumentAssetDedupStore,
} from './document-asset-dedup.store';

@Injectable()
export class InMemoryDocumentAssetDedupStore
  implements DocumentAssetDedupStore
{
  private readonly entries = new Map<string, Map<string, string>>();

  async get(nodeId: string, hash: string): Promise<string | null> {
    return this.entries.get(nodeId)?.get(hash) ?? null;
  }

  async set(nodeId: string, hash: string, assetPath: string): Promise<void> {
    const nodeEntries = this.ensureNodeEntries(nodeId);
    nodeEntries.set(hash, assetPath);
  }

  async getAll(nodeId: string): Promise<DocumentAssetDedupEntry[]> {
    const nodeEntries = this.entries.get(nodeId);
    if (!nodeEntries) {
      return [];
    }

    return Array.from(nodeEntries.entries()).map(([entryHash, entryPath]) => ({
      hash: entryHash,
      assetPath: entryPath,
    }));
  }

  async replaceAll(
    nodeId: string,
    entries: DocumentAssetDedupEntry[],
  ): Promise<void> {
    this.entries.set(
      nodeId,
      new Map(entries.map((entry) => [entry.hash, entry.assetPath])),
    );
  }

  private ensureNodeEntries(nodeId: string): Map<string, string> {
    let nodeEntries = this.entries.get(nodeId);
    if (!nodeEntries) {
      nodeEntries = new Map<string, string>();
      this.entries.set(nodeId, nodeEntries);
    }
    return nodeEntries;
  }
}
