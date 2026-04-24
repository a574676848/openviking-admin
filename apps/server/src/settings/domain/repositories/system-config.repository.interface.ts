import { SystemConfig } from '../../entities/system-config.entity';

export interface ISystemConfigRepository {
  find(options?: any): Promise<SystemConfig[]>;
  findOne(options: any): Promise<SystemConfig | null>;
  save(config: Partial<SystemConfig>): Promise<SystemConfig>;
}

export const ISystemConfigRepository = Symbol('ISystemConfigRepository');
