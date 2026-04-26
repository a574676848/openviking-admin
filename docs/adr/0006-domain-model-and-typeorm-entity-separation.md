# ADR 0006: Domain Model 与 TypeORM Entity 分离

## 状态

拟采纳

## 背景

当前多个 repository interface 直接暴露 TypeORM entity 与宽泛查询参数，导致 Domain 层契约间接依赖 Infrastructure 细节，不利于单元测试与后续替换持久化实现。

## 决策

- Domain 层只暴露纯业务 model 与业务查询参数对象。
- TypeORM entity 仅存在于 Infrastructure 层。
- Repository interface 不再泄漏 TypeORM `FindOptions` 和 `any`。
- 映射逻辑由 infrastructure repository 负责。

## 取舍

- 优点：依赖方向更清晰，领域逻辑可脱离 NestJS/TypeORM 单测。
- 成本：需要补一层 model/entity mapper，并逐步收敛既有 repository 接口。

## 后续影响

- 优先从知识库、用户、搜索日志三条链路开始试点。
- 所有新 repository 接口默认采用 query object，而不是 ORM 原生参数。
