# 🛡️ OpenViking Admin

> **下一代企业级私域 AI 认知中枢 (Private AI Knowledge OS)**  
> 本项目是基于 OpenViking 核心能力的增强版管理平台，专为对数据安全与检索精度有极致追求的企业级场景设计。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Maintainer](https://img.shields.io/badge/Maintainer-%40a574676848-orange.svg)](https://github.com/a574676848)
[![Node.js Version](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org/)

---

## 🌟 项目愿景 (Vision)

在 AI 时代，企业最核心的资产是**私域知识**。**OpenViking Admin** 致力于构建一个**零信任、高精准、全自动化**的知识底座。我们通过代码层面的物理隔离与二阶重排算法，让企业在享受大语言模型（LLM）能力的增长时，无需担心私域数据泄露与 AI 幻觉问题。

---

## 🏗️ 核心架构全景 (Architecture)

### 1. 全栈产品架构
本项目采用高度模块化的"私域代理"架构，支持从 AI 算力端点到物理存储层的全链路私有化挂载。

![项目全景架构图](./docs/images/architecture_full_view.png)
*(图 1：展示了系统从 SSO 接入到 S/M/L 隔离存储的全路径逻辑)*

### 2. 金融级多租户安全矩阵
我们提供了业内领先的三级物理隔离方案（Small/Medium/Large），通过动态 Schema 切换与独立数据库连接池满足不同合规标准的业务场景。

![安全隔离矩阵图](./docs/images/security_matrix.png)
*(图 2：展示了如何通过 DDL 自动克隆与动态连接池实现租户间的物理绝缘)*

---

## 📚 文档导航 (Documentation)

| 文档 | 说明 |
|------|------|
| [架构深度解析](./docs/ARCHITECTURE.md) | 洋葱架构、动态寻址、连接回收机制 |
| [多租户隔离战略](./docs/TENANT_ISOLATION.md) | Small/Medium/Large 三级隔离方案 |
| [API 参考手册](./docs/API_REFERENCE.md) | 46 个端点的完整请求/响应 schema |
| [配置参考](./docs/CONFIGURATION.md) | 所有环境变量和系统配置项 |
| [SSO 集成指南](./docs/SSO_INTEGRATION.md) | 飞书/钉钉/OIDC/LDAP 四种 SSO 配置 |
| [MCP 协议手册](./docs/MCP_GUIDE.md) | AI 客户端接入私域知识工具 |
| [部署指南](./docs/DEPLOYMENT.md) | 本地开发、Docker、Nginx 反向代理 |
| [数据库 Schema](./docs/DATABASE_SCHEMA.md) | 10 张表的完整结构和关系图 |
| [安全策略](./docs/SECURITY.md) | 威胁模型、防御机制、最佳实践 |
| [检索配置指南](./docs/SEARCH_CONFIGURATION.md) | 二阶段检索参数调优 |
| [知识导入流水线](./docs/IMPORT_PIPELINE.md) | 飞书/钉钉/Git 集成导入步骤 |
| [测试指南](./docs/TESTING.md) | 测试策略、覆盖率目标、示例代码 |
| [故障排查](./docs/TROUBLESHOOTING.md) | 常见问题和解决方案 |
| [前端 UI/UX 设计规范](./docs/DESIGN.md) | 双色主题、交互系统、模块 UX 拆解 |
| [开发者指南](./docs/DEVELOPMENT.md) | 本地开发流程、代码规范、提交规范 |
| [变更日志](./CHANGELOG.md) | 版本演进记录 |
| [行为准则](./CODE_OF_CONDUCT.md) | 社区参与标准 |

---

## 🚀 核心特性 (Key Features)

### 🔐 零信任多维度隔离
- **三级存储模式**：支持基于字段 (Small)、Schema (Medium) 以及 独立数据库 (Large) 的分级隔离。
- **算力私有化**：租户可绑定专属的 OpenViking 算力节点，确保推理与向量化过程在私域内完成。
- **URI 级 ACL**：基于 `viking://` 协议的细粒度权限控制，AI 检索通过代码层逻辑实现强越权拦截。

### 🎯 工业级精准检索 (Dual-Stage Retrieval)
- **向量召回 (Stage 1)**：秒级锁定关联上下文。
- **BGE-Rerank 重排序 (Stage 2)**：引入高精度语义二阶重排引擎，像专家一样逐字甄别，彻底消除 AI 幻觉，提供确定性结论。

### 🔄 全渠道知识收割流水线
- **多源集成**：原生适配飞书文档、钉钉知识库、GitHub/GitLab 代码仓库。
- **自动化萃取**：支持任务自愈与高并发加工，将非结构化死数据自动转化为高维 AI 资产。

### 🤖 原生支持 MCP 协议
- **AI 外脑级接入**：标准 Model Context Protocol 适配，让 Claude、Cursor、IDE 直接调用企业私域知识工具。

---

## 🛠️ 技术实现精髓 (Technical Highlights)

- **Request-Scoped Repository**：仓储层随请求动态实例化，在内存层面实现租户连接切换，确保数据绝对隔离。
- **JIT Provisioning**：通过企业 SSO (OIDC/LDAP) 登录时，系统自动完成账号同步、权限分配与租户空间初始化。
- **Cleanup Interceptor**：生产级资源回收机制，利用拦截器确保在高并发检索下数据库连接池的稳健释放。
- **2D Knowledge Graph**：基于力导向图的知识脉络可视化，实现企业资产的直观呈现。

---

## 🚦 快速开始 (Quick Start)

### 1. 前置依赖

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | v20+ | 运行时环境 |
| pnpm | v8+ | 包管理器 |
| PostgreSQL | v14+ | 数据库 (需 uuid-ossp 扩展) |
| OpenViking | 最新版 | 向量检索引擎 (独立部署) |

### 2. 安装部署

```bash
# 克隆项目
git clone https://github.com/a574676848/openviking-admin.git
cd openviking-admin

# 安装依赖
pnpm install
```

### 3. 数据库准备

```sql
CREATE DATABASE openviking_admin;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

### 4. 配置环境变量

```bash
cd apps/server
cp .env.example .env
# 编辑 .env 填写数据库连接信息和 OV 引擎地址
```

### 5. 执行数据库迁移

```bash
cd apps/server
pnpm typeorm migration:run -d src/data-source.ts
```

### 6. 创建初始管理员

```bash
cd apps/server
node seed-admin.js
# 默认账号: admin / admin123
```

### 7. 启动开发服务

```bash
# 在项目根目录同时启动
pnpm dev

# 或分别启动
cd apps/server && pnpm start:dev   # 后端 (端口 6001)
cd apps/web && pnpm dev            # 前端 (端口 6002)
```

访问 `http://localhost:6002` 即可使用。

> 详细部署步骤（含 Docker、Nginx 反向代理）请参考 [部署指南](./docs/DEPLOYMENT.md)。

---

## 🤝 致谢 (Acknowledgments)

本项目深度致敬并感谢 **[OpenViking](https://github.com/openviking)** 开源项目。我们继承了 OpenViking 优秀的语义索引与算力引擎能力，并在此基础上构建了更贴合企业级管理需求的 Admin 平台。

---

## 📄 开源协议 (License)

本项目遵循 **GNU General Public License v3.0 (GPL v3)** 协议。

### 协议核心条款深度解读：
1. **强制开源 (Copyleft)**：如果您修改了本项目代码并进行了分发（无论是以 SaaS 形式还是私有化交付），您**必须**向接收者提供修改后的完整源代码。这确保了知识的持续流动。
2. **商业使用**：GPL v3 并不禁止商业收费。您可以对软件的安装、运维、支持或云服务收取费用，但不能通过协议限制用户获取源码的权利。
3. **专利保护**：协议包含自动的专利授权条款。任何贡献者在提交代码的同时，即视为授予用户其相关专利的免费使用权，有效防御了"专利流氓"。
4. **无担保声明**：软件按"原样"提供。开发者不承担因使用本软件导致的任何直接或间接法律责任。

> 详情请参阅项目根目录下的 [LICENSE](./LICENSE) 文件。

---

## 📞 联系与支持

- **维护者**: [@a574676848](https://github.com/a574676848)
- **邮箱**: devnexus.chat@gmail.com
- **问题反馈**: [Issue Tracker](https://github.com/a574676848/openviking-admin/issues)

---
*"OpenViking Admin - 让每一家企业都拥有安全、精准的 AI 灵魂。"*