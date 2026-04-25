# ADR 0002：凭证分层

## 决策

采用 JWT、capability access token、session key、API key 分层。

## 原因

- 人类用户与机器调用方的安全边界不同
- 已登录用户不应被迫手工复制 API key。
- MCP、HTTP、CLI、Skill 需要共享统一的租户上下文恢复方式。
