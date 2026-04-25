/** 集成模块内部输入模型 — 不依赖 HTTP DTO */
export interface CreateIntegrationInput {
  name: string;
  type: string;
  credentials?: Record<string, string>;
}

export interface UpdateIntegrationInput {
  name?: string;
  type?: string;
  credentials?: Record<string, string>;
  active?: boolean;
}
