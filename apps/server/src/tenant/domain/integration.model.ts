import type { IntegrationType } from '../../common/constants/system.enum';

export interface IntegrationModel {
  id: string;
  tenantId: string;
  name: string;
  type: IntegrationType;
  credentials: Record<string, string>;
  config: Record<string, unknown> | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
