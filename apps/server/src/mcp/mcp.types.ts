export interface JsonRpcRequest {
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
  };
}

export type McpCredential =
  | { kind: 'apiKey'; value: string }
  | { kind: 'sessionKey'; value: string };

export interface McpMessageQuery {
  sessionId: string;
  sessionToken: string;
  key?: string;
  sessionKey?: string;
}
