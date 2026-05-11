export type JsonRpcId = string | number;

export type JsonRpcParams = Record<string, unknown>;

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
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
