export const DOCUMENT_ASSET_DEDUP_STORE_DRIVER = {
  MEMORY: 'memory',
  REDIS: 'redis',
} as const;

export type DocumentAssetDedupStoreDriver =
  (typeof DOCUMENT_ASSET_DEDUP_STORE_DRIVER)[keyof typeof DOCUMENT_ASSET_DEDUP_STORE_DRIVER];

export interface DocumentAssetDedupEntry {
  hash: string;
  assetPath: string;
}

export interface DocumentAssetDedupStoreOptions {
  driver: DocumentAssetDedupStoreDriver;
  redisUrl?: string;
  redisHost: string;
  redisPort: number;
  redisDb: number;
  redisPassword?: string;
  redisTls: boolean;
  redisKeyPrefix: string;
  redisConnectTimeoutMs: number;
  ttlSeconds: number;
}

export interface DocumentAssetDedupStore {
  get(nodeId: string, hash: string): Promise<string | null>;
  set(nodeId: string, hash: string, assetPath: string): Promise<void>;
  getAll(nodeId: string): Promise<DocumentAssetDedupEntry[]>;
  replaceAll(nodeId: string, entries: DocumentAssetDedupEntry[]): Promise<void>;
}

export const DOCUMENT_ASSET_DEDUP_STORE = Symbol(
  'DOCUMENT_ASSET_DEDUP_STORE',
);
export const DOCUMENT_ASSET_DEDUP_STORE_OPTIONS = Symbol(
  'DOCUMENT_ASSET_DEDUP_STORE_OPTIONS',
);
