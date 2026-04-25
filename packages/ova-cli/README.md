# @openviking-admin/ova-cli

`ova` 是 OpenViking Admin 能力平台的官方命令行 adapter。

它面向开发者、CI、运维终端和本地 Agent 运行环境。CLI 调用 OpenViking Admin 公开 HTTP API，不在本地复制服务端授权规则或业务规则。

## 安装

```bash
npm install -g @openviking-admin/ova-cli
```

仓内开发：

```bash
npm run ova -- <group> <command> [options]
```

## 登录

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password admin123 \
  --tenant-code acme
```

SSO ticket 登录：

```bash
ova auth sso --ticket <sso-ticket>
```

## Profile 管理

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password admin123 \
  --tenant-code acme \
  --profile dev

ova config set --server https://prod.example.com --profile prod
ova config use --profile prod
ova config show
```

Profile 状态文件：

```text
~/.openviking/ova/auth.json
```

CLI 会按 profile 保存 `accessToken`、`refreshToken`、过期时间和可选的派生 capability 凭证。登录 token 过期前会自动刷新。

## 能力调用

```bash
ova capabilities list
ova capabilities inspect --id knowledge.search
ova knowledge search --query "多租户隔离" --limit 5
ova knowledge grep --pattern "tenant" --uri "viking://resources/tenants/acme/"
ova resources list --uri "viking://resources/tenants/acme/"
ova resources tree --uri "viking://resources/tenants/acme/" --depth 2
```

## 换证

```bash
ova auth credential-options
ova auth token-exchange --output json
ova auth session-exchange --output json
ova auth client-credentials --name ci-bot --save
```

派生凭证默认只输出；只有显式传入 `--save` 时，才会持久化到当前 profile。

## 输出

```bash
ova knowledge search --query "权限边界" --output text
ova knowledge search --query "权限边界" --output json
ova knowledge search --query "权限边界" --output jsonl
```

脚本建议使用 `json`，Agent 或日志管道建议使用 `jsonl`。

## 诊断命令

```bash
ova doctor
ova doctor --output json
ova doctor --output jsonl
```

`doctor` 会检查 profile 状态、token 过期时间、`/api/capabilities` 可达性，以及有凭证时的 `/api/auth/whoami`。

## 开发

```bash
npm --workspace @openviking-admin/ova-cli run test
npm --workspace @openviking-admin/ova-cli run build
npm --workspace @openviking-admin/ova-cli pack
```

完整用户文档见 `docs/CLI_GUIDE.md`。
