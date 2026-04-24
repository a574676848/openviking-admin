# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 初始项目脚手架，包含完整的后端 (NestJS) 和前端 (Next.js) 架构
- 多租户三级隔离架构 (Small/Medium/Large)
- JWT 认证 + SSO 集成 (飞书/钉钉/OIDC/LDAP)
- 知识库管理、知识树/图谱可视化
- 二阶段语义检索 (向量召回 + BGE-Rerank)
- 导入任务流水线 (飞书/钉钉/Git 集成)
- MCP 协议支持 (SSE + JSON-RPC)
- 审计日志系统
- 系统监控仪表盘
- 前端双色主题系统 (Neo-Brutalism / Swiss)
- VikingWatcher 交互组件

### Changed
- 移除临时重构脚本

### Fixed
- 修复数据库迁移中的 schema 不一致问题
- 修复 SSO ticket 服务缺少 crypto 导入的问题

---

## [0.1.0] - 2024-04-17

### Added
- 初始数据库迁移 (InitSchema, AddMissingTables, FixSchemaInconsistencies)
- 基础认证模块
- 项目基础架构搭建
