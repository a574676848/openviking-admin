export interface SearchLogModel {
  id: string;
  tenantId: string;
  query: string;
  scope: string;
  resultCount: number;
  scoreMax: number;
  latencyMs: number;
  feedback: string;
  feedbackNote: string;
  meta: Record<string, unknown>;
  createdAt: Date;
}
