import { UserMcpKey } from '../../entities/user-mcp-key.entity';

export const MCP_KEY_REPOSITORY = 'IMcpKeyRepository';

export interface IMcpKeyRepository {
  create(data: Partial<UserMcpKey>): UserMcpKey;
  save(key: UserMcpKey): Promise<UserMcpKey>;
  find(options: any): Promise<UserMcpKey[]>;
  findOne(options: any): Promise<UserMcpKey | null>;
  count(options: any): Promise<number>;
  remove(key: UserMcpKey): Promise<UserMcpKey>;
  update(id: string, data: Partial<UserMcpKey>): Promise<any>;
}
