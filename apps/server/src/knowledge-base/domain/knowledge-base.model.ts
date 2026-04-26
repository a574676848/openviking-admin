export type KnowledgeBaseStatus = 'active' | 'building' | 'archived';

export interface KnowledgeBaseModel {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  status: KnowledgeBaseStatus;
  vikingUri: string;
  docCount: number;
  vectorCount: number;
  createdAt: Date;
  updatedAt: Date;
}
