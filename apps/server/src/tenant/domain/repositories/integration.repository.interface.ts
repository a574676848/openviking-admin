import { Integration } from '../../entities/integration.entity';

export interface IIntegrationRepository {
  find(options: any): Promise<Integration[]>;
  findOne(options: any): Promise<Integration | null>;
  save(integration: Partial<Integration>): Promise<Integration>;
  remove(integration: Integration): Promise<Integration>;
}

export const IIntegrationRepository = Symbol('IIntegrationRepository');
