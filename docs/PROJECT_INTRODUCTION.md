# OpenViking — 专为 AI Agent 设计的上下文数据库

> **Context Database for AI Agents**
>
> 抛弃扁平向量切片，拥抱文件系统范式。让 Agent 从"概率模糊盲猜"进化为"确定性目录导航"。

---

## 1. 定位与愿景

OpenViking（由火山引擎 / 字节跳动团队开源）是一款面向 AI Agent 的**上下文数据库（Context Database）**。

传统 RAG 系统将知识切碎为扁平的向量碎片（Flat Vector Storage），导致 Agent 只能依赖概率检索拼凑上下文，既浪费 Token 又容易丢失全局语义。OpenViking 另辟蹊径——以**文件系统范式（Filesystem Paradigm）**重新组织 Agent 的全部认知资源，让 Agent 像操作系统一样拥有自己的目录树、导航路径和按需加载能力。

---

## 2. 五大核心工程支柱

### 2.1 虚拟文件系统范式（Viking URI Protocol）

OpenViking 引入 `viking://` 协议，将 Agent 的整个"大脑"映射为虚拟目录树：

```text
viking://
├── resources/        ← 静态知识库：项目文档、代码库、PDF、API 规范
├── user/             ← 用户画像：动态偏好、长短期显式记忆
└── agent/            ← Agent 自身：工具链、Prompt 技能卡、操作经验
```

**关键价值**：Agent 不再盲猜"哪段文本可能有用"，而是通过确定性的目录路径精准定位所需信息——就像开发者在 IDE 中浏览工程目录一样直觉。

---

### 2.2 阶梯式上下文加载（Tiered Context Loading）

为解决传统 RAG 将大量文本一次性灌入 LLM 造成的 Token 浪费和上下文污染，OpenViking 在写入时自动将数据切分为三层：

| 层级 | 名称 | Token 预算 | 作用 |
|------|------|-----------|------|
| **L0** | Abstract（摘要层） | < 100 tokens | 单句总结，Agent 扫一眼即知是否相关 |
| **L1** | Overview（架构层） | < 2,000 tokens | 核心要点 + 目录大纲，足以支撑高层规划 |
| **L2** | Detail（细节层） | 完整原文 | 仅在 Agent 确认必须深挖时按需加载 |

**实测效果**：在基准测试中，阶梯式加载帮助 Agent 减少约 **43% 的 Token 成本**，同时保持了检索质量。

```text
Agent 提问
  → L0 快速扫描（哪些文件可能相关？）
  → L1 中层确认（这个文件的结构和要点是什么？）
  → L2 精确读取（只加载真正需要的段落）
```

---

### 2.3 目录递归检索（Directory Recursive Retrieval）

传统向量检索只能拉取最相似的 K 个碎片，极易丢失同一模块下的关联上下文。OpenViking 采用"先定位目录，再递归探查"：

```text
1. 意图分析      → 解析用户查询的真实目的
2. 目录定位      → 向量检索锁定高分目标文件夹（而非文本碎片）
3. 递归发掘      → 在目标目录下执行 ls / grep / glob 确定性操作
                   确保不漏掉同一模块的关联上下文
```

这让检索从"碎片拼凑"升级为"模块级完整认知"。

---

### 2.4 检索轨迹可视化（Visualized Retrieval Trajectory）

Agent 给错答案，往往不是模型推理不行，而是 RAG 路由阶段"喂错了药"。

OpenViking 完整记录 Agent 在虚拟目录中的每一步：浏览 → 跳转 → 定位 → 读取。开发者可以通过可视化轨迹审计：

> "Agent 到底是在哪个文件夹走偏的？"

极大降低了上下文路由的 Debug 成本。

---

### 2.5 统一能力平台（Capability-First Architecture）

OpenViking 将所有知识能力定义为稳定契约，通过四种平级入口对外开放：

| 入口 | 适用场景 | 说明 |
|------|---------|------|
| **HTTP** | 后端系统、网关、自动化脚本 | RESTful API，直接集成 |
| **CLI** | 开发者终端、CI、Agent 宿主机 | `ova` 命令行，支持 profile 和自动刷新 |
| **MCP** | Claude、Cursor、IDE 等 | 标准 `tools/list` + `tools/call` |
| **Skill** | Codex、Claude Skills、自研 Agent | 轻量编排，不发明新协议 |

同一组业务规则只定义一次，四种入口共享统一的认证、授权、审计、限流和日志追踪。

---

## 3. OpenViking Admin — 企业级私域 AI 知识中枢

**OpenViking Admin** 是基于 OpenViking 核心引擎构建的企业管理平台，为组织补齐数据安全、租户隔离、权限治理和 AI Agent 接入能力：

### 3.1 架构全景

```text
┌────────────────────────────────────────────────────────────────────┐
│  接入层 — HTTP / CLI / MCP / Skill / WebDAV                        │
├────────────────────────────────────────────────────────────────────┤
│  应用层 — Auth · Tenant · Capability 编排 · Search · Import        │
├────────────────────────────────────────────────────────────────────┤
│  领域层 — 实体 · 仓储接口 · 能力契约                                │
├────────────────────────────────────────────────────────────────────┤
│  基础设施 — TypeORM · OV Client · 凭证加密 · Metrics · Prometheus  │
├────────────────────────────────────────────────────────────────────┤
│  OpenViking 引擎 — 语义索引 · 向量召回 · 阶梯加载 · 目录检索       │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心企业能力

| 能力域 | 说明 |
|--------|------|
| **多租户隔离** | 三级物理隔离：字段级（Small）→ Schema 级（Medium）→ 独立数据库（Large） |
| **高精准检索** | 二阶段语义检索：向量召回 + BGE-Rerank 重排序，前置 ACL 过滤 |
| **知识导入流水线** | 对接飞书、钉钉、GitHub/GitLab、本地文件、URL，自动解析并注入引擎 |
| **SSO 集成** | 飞书、钉钉、OIDC、LDAP，统一换证链路 |
| **端到端可观测** | traceId 贯穿全链路，Prometheus 指标，审计事件 |
| **知识节点 ACL** | 资源树 + URI scope 交集过滤，防止越权访问 |
| **WebDAV 同步** | 支持 Obsidian 等知识管理客户端双向同步 |

### 3.3 检索链路

```text
用户查询 / Agent 调用
    ↓
ACL 前置过滤（获取当前身份可见 URI）
    ↓
Stage 1: OpenViking 向量召回（L0 → L1 → L2 阶梯加载）
    ↓
Stage 2: BGE-Rerank 重排序（可选）
    ↓
scope ∩ allowedUris 交集收敛
    ↓
返回 Top K 结果 + 写入搜索日志 + 透传 traceId
```

---

## 4. 与传统 RAG 的对比

| 维度 | 传统 RAG | OpenViking |
|------|----------|------------|
| 数据组织 | 扁平向量碎片 | 虚拟文件系统目录树 |
| 检索方式 | Top-K 最近邻 | 目录定位 + 递归探查 |
| 上下文加载 | 全量灌入 | L0/L1/L2 阶梯按需加载 |
| Token 效率 | 高浪费 | 减少 ~43% |
| 可调试性 | 黑盒 | 检索轨迹可视化 |
| 关联完整性 | 容易丢失同模块上下文 | 目录级完整覆盖 |
| 权限控制 | 通常后置或缺失 | URI scope + ACL 前置过滤 |

---

## 5. 快速体验

### 5.1 语义搜索

```bash
# CLI
ova knowledge search --query "多租户数据隔离" --limit 5

# HTTP
curl -X POST http://localhost:6001/api/v1/knowledge/search \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "多租户数据隔离", "limit": 5}'

# MCP (tools/call)
{ "name": "knowledge.search", "arguments": { "query": "多租户数据隔离", "limit": 5 } }
```

### 5.2 资源目录导航

```bash
# 列出资源树
ova resources tree

# 按目录浏览
ova resources list --uri "viking://resources/acme/product-docs/"
```

### 5.3 知识导入

```bash
# 从 URL 导入文档
ova documents import --kb <kbId> --source url --url "https://example.com/api-spec.md"

# 上传本地文件
ova documents import --kb <kbId> --source local --file ./architecture.pdf
```

---

## 6. 技术栈

| 层 | 技术选型 |
|----|---------|
| 前端 | Next.js · React · TailwindCSS · Radix UI |
| 后端 | NestJS · TypeORM · PostgreSQL · Redis |
| 引擎 | OpenViking (语义索引 / 向量检索 / 阶梯加载) |
| 协议 | MCP (Model Context Protocol) · WebDAV · REST |
| 观测 | Prometheus · 结构化审计日志 · traceId 链路 |
| 部署 | Docker Compose · 支持 K8s 扩展 |

---

## 7. 项目结构

```text
openviking-knowdge/
├── apps/
│   ├── server/          # NestJS 后端（洋葱架构）
│   └── web/             # Next.js 前端控制台
├── packages/
│   └── ova-cli/         # 独立 CLI 工具
├── skills/
│   └── openviking-admin/ # Agent Skill 模板
├── scripts/             # 构建与校验脚本
├── docs/                # 架构、安全、部署等完整文档
└── examples/            # HTTP / CLI / MCP / Skill 调用示例
```

---

## 8. 设计哲学

1. **文件系统即认知**：`viking://` 协议让 Agent 像使用操作系统一样操作知识。
2. **按需而非贪婪**：L0/L1/L2 分层让 Agent 只为真正需要的深度付费。
3. **确定性优于概率**：目录递归检索消除了"碰运气式"的碎片拼凑。
4. **可审计即可信赖**：检索轨迹可视化让 Agent 的决策路径透明可追溯。
5. **能力即契约**：一次定义，四种入口，统一认证与限流。
6. **安全即默认**：多租户隔离 + URI scope + ACL 前置过滤，越权访问在协议层被拦截。

---

## 9. 适用场景

- **企业私域知识问答**：把散落的文档、代码、Wiki 沉淀为可治理的 AI 知识底座。
- **AI Agent 长期记忆**：为 Agent 提供跨会话持久化的用户画像和操作经验。
- **多模态知识管理**：统一管理 PDF、Markdown、代码、API 规范等异构资源。
- **合规审计场景**：金融级租户隔离 + 全链路追踪，满足数据安全合规要求。
- **开发者知识平台**：通过 CLI / MCP / Skill 无缝接入 IDE 和 CI/CD 工作流。

---

## 10. 开源协议

MIT License — 详见 [LICENSE](../LICENSE)。

---

> 📖 更多细节请参阅 [架构文档](./ARCHITECTURE.md) · [能力平台](./CAPABILITIES.md) · [MCP 指南](./MCP_GUIDE.md) · [CLI 指南](./CLI_GUIDE.md) · [安全策略](./SECURITY.md)
