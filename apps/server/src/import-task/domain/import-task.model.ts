export type ImportTaskStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ImportTaskSourceType = 'url' | 'git' | 'local';

export interface ImportTaskModel {
  id: string;
  tenantId: string;
  integrationId: string;
  kbId: string;
  sourceType: ImportTaskSourceType;
  sourceUrl: string;
  targetUri: string;
  status: ImportTaskStatus;
  nodeCount: number;
  vectorCount: number;
  errorMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}
