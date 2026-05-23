/**
 * OpenViking 文档萃取规范（V2）
 *
 * 纯萃取方法论：说明 OpenViking 检索链路特性，以及如何撰写/切分文档
 * 以最大化语义召回、精确匹配和 Rerank 排序质量。不含任何产品实现细节。
 */
export type DocumentExtractionScenario =
  | 'general'
  | 'api'
  | 'runbook'
  | 'faq'
  | 'repository'
  | 'mechanism-reference'
  | 'knowledge-base-index';

export interface ExtractionExample {
  scenario: DocumentExtractionScenario;
  title: string;
  source: string;
  problems: string[];
  extractionSample: {
    title: string;
    frontmatter: Record<string, unknown>;
    summary: string;
    keywords: string[];
    chunks: Array<Record<string, unknown>>;
  };
}

// ─── OpenViking 召回链路特性 ───
// 每条特性说明"OpenViking 怎么检索"，以及"文档该怎么写才能被正确召回"。

const OPENVIKING_FEATURES = [
  {
    id: 'semantic_recall',
    feature: '语义召回优先',
    implication:
      '每个切片都要自包含主题、对象、动作、范围和约束。用"概念名: 一句话解释"格式写入 key_concepts，让 embedding 在摘要层即可命中，不依赖标题精确匹配。',
  },
  {
    id: 'acl_scope',
    feature: 'ACL 与 URI scope 过滤',
    implication:
      '文档首段必须显式写清适用场景、技术栈和不适用场景。多技术栈知识库需在 frontmatter 中用 applicable_scenarios 标注适用域，避免跨栈误召回后再被 scope 收窄成噪声。',
  },
  {
    id: 'exact_match',
    feature: '文本匹配链路共存',
    implication:
      '类名、方法名、注解、配置键、错误码、命令参数等精确标识符必须原样保留在正文中。tags 里同时放中文术语和英文标识符，保证 grep 精确匹配和语义模糊匹配双通道命中。',
  },
  {
    id: 'rerank',
    feature: 'Rerank 放大标题与摘要质量',
    implication:
      '标题直接写"主题 + 对象 + 动作"。YAML frontmatter 中的 title、tags、key_concepts 是 Rerank 的核心排序信号，必须精确概括文档内容。摘要 2~4 句覆盖用途、适用范围和输入输出。',
  },
  {
    id: 'cross_kb',
    feature: '跨知识库引用',
    implication:
      '多知识库场景下必须用 cross_refs 显式声明关联文档。检索路由索引文档负责将用户问题意图映射到具体机制文档，形成可遍历的知识图谱。',
  },
  {
    id: 'tiered_retrieval',
    feature: '分层摘要检索',
    implication:
      'key_concepts 用于召回初筛，H2/H3 摘要段用于语义匹配，正文用于精读回答。每一层都要能独立回答"是什么、何时用、怎么做、有什么限制"，不能只写"详见下文"。',
  },
  {
    id: 'traceability',
    feature: '可审计可追踪',
    implication:
      '保留来源、更新时间、适用范围和版本信息。涉及配置或命令必须附带最小可运行示例，不能只有解释性描述。检索异常时可回溯到源文档定位问题。',
  },
  {
    id: 'draft_index_split',
    feature: '草稿与索引解耦',
    implication:
      '文档修改后索引不会自动刷新。发布流程中必须明确写清"何时需要重建索引"，否则检索将持续命中过期内容。',
  },
] as const;

// ─── 萃取规范 ───

const EXTRACTION_SPECIFICATION = {
  objective:
    '让文档在语义召回、精确匹配、Rerank 排序三个环节都具备高命中率，同时支持跨知识库引用和分层检索。',
  frontmatter: {
    description:
      '每篇萃取文档必须以 YAML frontmatter 开头，作为语义索引的核心元数据层。OpenViking 会利用这些结构化字段辅助 chunk 切分和检索路由。',
    required: [
      'title — 主题 + 对象 + 动作，例如"EQL 数据查询使用指南"',
      'category — 分层分类，如：数据层 | 平台核心 | 业务机制 | 基础设施 | 知识库索引',
      'tags — 类名、方法名、注解、配置键、中文术语，双语文备',
      'key_concepts — "概念名: 一句话解释"的 YAML 列表，作为第一层摘要',
    ],
    recommended: [
      'cross_refs — 关联的其他文档标题列表，用于构建知识图谱',
      'applicable_scenarios — 适用场景标签列表，用于多技术栈过滤',
      'applicable_to — 适用系统的一句话描述',
    ],
    example: `---
title: EQL 数据查询使用指南
category: 数据层
tags: [EQL, QueryCondition, 查询条件, subIn, permIn, filterSub]
key_concepts:
  - EQL: 基于业务模型的增强型数据查询语言，在标准 SQL 之上封装业务特性函数
  - QueryCondition: 链式调用构造查询条件的 API
  - subIn: 树形结构包含子级的数据过滤函数
cross_refs:
  - DataRecord 数据结构
  - 应用开发指南
---`,
  },
  documentLevel: [
    '第一段（适用场景标注）：用 blockquote 写清适用范围、技术栈、机制定位和不适用场景。这是 scope 过滤和 Rerank 的关键信号。',
    '术语首次出现时同时保留规范名称与常见别名，例如"数据管理器 / ORM / DataRecordManager"。',
    '每个 H2 节开头用 1~2 句话概括本节解决什么问题、何时用、有什么限制。',
    '代码块必须有语言标注（```java / ```python / ```yaml），且紧跟前置条件说明。',
    '表格必须保留表头，并与上下文解释段落放在同一节内。',
    '去掉：目录、页眉页脚、版本历史表、截图占位符、"详见XX章节"的纯导航锚点、空模板章节。',
  ],
  chunkLevel: {
    targetCharacters: { min: 400, preferred: 800, max: 1400 },
    overlapCharacters: { min: 80, preferred: 120, max: 180 },
    splitOrder: [
      '优先按 H2/H3 语义节切分。',
      'API/方法类内容按"用途 → 签名 → 参数表 → 示例 → 限制"切分。',
      '步骤型内容按"前置条件 → 步骤 → 校验 → 失败处理"切分。',
      '表格保留表头并与解释段落同块。',
      '代码块与解释、适用版本、关键参数在同一块或相邻块。',
    ],
    hardRules: [
      '不要把类/方法的定义、参数、返回值、示例拆到不同 chunk。',
      '不要把故障排查的症状、原因、处理步骤、验证方式拆散。',
      '不要生成只有"见上文/如下图/参考前节"的悬空 chunk。',
      'key_concepts 中的每个概念必须在正文中有对应展开，不能只有标题。',
    ],
  },
  qualityGate: [
    '任一 chunk 脱离原文后，仍能独立回答"是什么、何时用、怎么做、有什么限制"。',
    '同时保留语义词（中文术语）和精确词（类名/方法名/配置键/命令）。',
    '涉及配置或命令，必须包含最小可执行示例。',
    '涉及多个技术栈的文档，必须显式标注每种用法的适用场景。',
  ],
};

// ─── 萃取检查清单 ───

const CHECKLIST = [
  '【前置元数据】是否写了 YAML frontmatter（title / category / tags / key_concepts）？',
  '【适用场景】第一段是否用 blockquote 标注了适用范围和技术栈？',
  '【术语双语文备】tags 中是否同时包含中文术语和英文标识符（类名/方法名/注解）？',
  '【概念锚点】key_concepts 是否用"概念名: 一句话解释"覆盖了文档核心机制？',
  '【交叉引用】cross_refs 是否列出了本文档依赖或关联的其他文档？',
  '【分层标题】H2 标题是否直接写主题 + 对象（而非"第一章/概述"这种无信息量标题）？',
  '【示例可执行】代码块是否包含最小可运行示例而不仅是解释？',
  '【排查链路】故障排查内容是否覆盖症状→原因→步骤→验证的完整链路？',
  '【噪声清除】是否去掉了目录、版本历史、截图占位、空章节、"详见XX"导航锚点？',
  '【跨库标注】多技术栈文档是否用 applicable_scenarios 标注了适用场景？',
  '【索引刷新】草稿更新后是否确认了索引刷新动作和触发时机？',
];

// ─── 反模式 ───

const ANTI_PATTERNS = [
  '整页只抽"第一章 / 第二章"这种目录标题，没有正文结论。',
  '把类名、方法签名、错误码都放进截图，正文里没有可检索文本。',
  '大块复制 changelog 或版本历史表，缺少当前稳定结论和适用版本。',
  '一个 chunk 混入多个不相关主题，导致 Rerank 无法判断主问题。',
  '文档改了草稿但没有重建索引，检索仍命中过期内容。',
  'YAML frontmatter 的 tags 只有中文标签没有英文标识符，或反之，导致单通道召回缺失。',
  'key_concepts 写成段落而非"概念: 解释"列表，导致摘要层无法提取独立概念。',
  '跨知识库文档没有 cross_refs，导致关联机制无法被联合检索。',
  '技术栈混写：同一篇文档混入多种技术栈内容但没有 applicable_scenarios 标注区分。',
];

// ─── 知识库索引文档模式 ───

const KNOWLEDGE_BASE_INDEX_PATTERN = {
  description:
    '每个知识库应有一篇总览与检索路由文档，作为知识检索的"路由器"。它不包含具体技术细节，而是将用户问题意图映射到应检索的具体文档。',
  structure: [
    '一、使用方式 — 说明索引文档的用途和知识库覆盖范围。',
    '二、按问题意图路由 — 核心路由表，列为"用户问题意图 | 应检索文档 | 典型关键词"。',
    '三、核心术语同义词 — 将用户可能使用的非规范表达映射到规范术语和对应文档。',
    '四、优先检索策略 — 基于关键词特征的优先级规则（如"出现类名→优先命中数据层文档"）。',
    '五、常见组合检索 — 跨机制的复合问题路由（如"保存后发消息 → SaveHook + 消息机制"）。',
    '（可选）核心技术栈区分 — 多技术栈场景下的对比表。',
  ],
};

// ─── 发布工作流 ───

const PUBLISHING_WORKFLOW = [
  '1. 文档归一化：补充 YAML frontmatter（title / category / tags / key_concepts / cross_refs）。',
  '2. 适用场景标注：文档首段写清适用范围、技术栈、机制定位。',
  '3. 语义切块：按 H2/H3 语义节切分，确保每个 chunk 自包含。',
  '4. 上传到知识库对应节点，确认导入任务正常完成。',
  '5. 用精确词和自然语言各做一次抽样检索验证召回效果。',
  '6. 文档草稿更新后，确认索引已刷新，避免检索命中过期内容。',
  '7. 多知识库场景：在各知识库的索引文档中维护交叉引用关系。',
];

// ─── 萃取示例 ───

const EXAMPLES: ExtractionExample[] = [
  {
    scenario: 'mechanism-reference',
    title: '机制参考手册萃取示例',
    source: [
      '## 查询方法',
      '提供了一些查询数据的方法。',
      '参数见上文。',
      '详细说明请联系开发人员。',
    ].join('\n'),
    problems: [
      '没有保留类名和方法签名，无法被精确匹配命中。',
      '"查询方法"太泛化，语义召回无法区分是哪种查询。',
      '"详见上文/联系开发人员"是死胡同，chunk 无法独立回答问题。',
      '缺少适用场景和技术栈标注。',
    ],
    extractionSample: {
      title: '数据查询使用指南（萃取后）',
      frontmatter: {
        title: '数据查询使用指南',
        category: '数据层',
        tags: ['QueryCondition', '链式查询', '条件构造', 'subIn', 'permIn'],
        key_concepts: [
          '查询引擎: 基于业务模型的增强型数据查询语言',
          'QueryCondition: 链式调用构造查询条件的 API',
          '链式查询: query() → condition() → select() → find()',
        ],
        cross_refs: ['数据结构参考', '应用开发指南'],
      },
      summary:
        '基于业务模型的增强型数据查询语言，在标准 SQL 之上封装了加密字段、JSON 数组、关联穿透、数据权限等业务特性函数。',
      keywords: ['QueryCondition', '链式查询', '条件构造', 'subIn', 'permIn'],
      chunks: [
        {
          heading: '查询引擎是什么',
          content:
            '基于业务模型的增强型数据查询语言。核心约束：不支持手动写 JOIN。它自动处理 SQL 方言适配、参数化查询、加密字段、JSON 数组、关联字段穿透、数据权限过滤。',
        },
        {
          heading: '链式查询最小示例',
          content: [
            '```java',
            'DataRecordManager.getInstance().query("user")',
            '    .condition(cond -> cond.eq("f1", "1"))',
            '    .select("f1", "f2", "f3$code")',
            '    .record().find();',
            '```',
            '链式流程：query(model) → .condition(...) → .select(...) → .record() → .findOne()/.find()',
          ].join('\n'),
        },
      ],
    },
  },
  {
    scenario: 'knowledge-base-index',
    title: '知识库索引文档萃取示例',
    source: [
      '# 知识库文档',
      '本知识库包含多个文档。',
      '- 文档A',
      '- 文档B',
      '- 文档C',
    ].join('\n'),
    problems: [
      '没有将问题意图映射到具体文档，检索系统无法路由。',
      '缺少同义词映射，用户用不同表达方式无法命中。',
      '缺少优先检索策略，无法根据关键词特征做智能路由。',
    ],
    extractionSample: {
      title: '知识库总览与检索路由',
      frontmatter: {
        title: '知识库总览与检索路由',
        category: '知识库索引',
        tags: ['检索路由', '知识库索引', 'DataRecord', 'EQL', 'EventAction'],
        key_concepts: [
          '检索路由: 根据用户问题中的关键词和意图路由到对应机制文档',
          '分层摘要: 每个机制的一句话定位，适合召回初筛',
          '知识分层: 数据层 → 事件与流程 → 业务机制 → 基础设施',
        ],
      },
      summary:
        '本索引用于知识库的精准召回。通过同义词、类名、API、配置项、问题现象将用户问题路由到对应机制文档。',
      keywords: ['检索路由', '知识库索引', '同义词映射'],
      chunks: [
        {
          heading: '按问题意图路由',
          content: [
            '| 用户问题意图 | 应检索文档 | 典型关键词 |',
            '|--------------|------------|------------|',
            '| 如何查询数据 | 数据结构 + 查询指南 | DataRecordManager, QueryCondition, selectPage |',
            '| 查询条件怎么写 | 查询指南 | eq, in, filterSub, subIn, permIn |',
            '| 标准接口开发 | 应用开发指南 + 事件机制 | @EventService, @EventAction, SaveHook |',
          ].join('\n'),
        },
        {
          heading: '核心术语同义词',
          content: [
            '| 用户表达 | 规范术语 | 应检索文档 |',
            '|----------|----------|-----------|',
            '| 单据数据/ORM/CRUD | DataRecord | 数据结构参考 |',
            '| 查询DSL/where JSON | EQL | 查询指南 |',
            '| 找人规则/人员规则 | DataLookup | 对象查找指南 |',
          ].join('\n'),
        },
      ],
    },
  },
  {
    scenario: 'api',
    title: 'API 文档萃取示例',
    source: [
      '## Search API',
      '搜索知识。',
      '参数：q、n。',
      '更多说明见上文。',
    ].join('\n'),
    problems: [
      '缺少适用范围、鉴权方式和返回语义。',
      'q、n 这种缩写无法支撑语义召回。',
      '没有保留精确 path 和方法签名。',
    ],
    extractionSample: {
      title: '知识搜索接口（萃取后）',
      frontmatter: {
        title: '知识搜索接口',
        category: '平台核心',
        tags: ['knowledge.search', 'API', '语义搜索', 'POST'],
        key_concepts: [
          'knowledge.search: 在知识域内执行语义搜索',
          'ACL 过滤: 服务端自动叠加的访问控制过滤',
        ],
      },
      summary:
        '用于在知识域内执行语义搜索。支持 HTTP、CLI、SDK 等多种调用入口，统一复用 ACL、scope 与 Rerank 链路。',
      keywords: ['knowledge.search', '/api/v1/knowledge/search', '语义搜索'],
      chunks: [
        {
          heading: '用途与范围',
          content:
            '在知识域内执行语义搜索，服务端会叠加 ACL 过滤、scope 收敛和 Rerank 重排序。适合查询制度、产品文档、运维手册等非结构化知识。需要有效的访问凭证。',
        },
        {
          heading: '最小调用示例',
          content: [
            'HTTP: POST /api/v1/knowledge/search',
            '  Body: { "query": "多租户隔离", "limit": 5 }',
            '响应: { "items": [...], "scores": [...] }',
          ].join('\n'),
        },
      ],
    },
  },
  {
    scenario: 'runbook',
    title: '运维手册萃取示例',
    source: [
      '索引有问题时重试一下。',
      '如果还是不行找管理员。',
    ].join('\n'),
    problems: [
      '没有症状、前置条件和验证方式。',
      '"重试一下"无法回答具体执行什么操作。',
      '没有区分草稿未同步还是引擎异常。',
    ],
    extractionSample: {
      title: '索引未同步排查手册（萃取后）',
      frontmatter: {
        title: '索引未同步排查手册',
        category: '基础设施',
        tags: ['索引同步', '排查', 'draft', 'indexStatus'],
        key_concepts: [
          'indexStatus: 索引状态标记，dirty 表示草稿与索引不一致',
          '索引重建: 强制将最新草稿内容同步到检索索引的操作',
        ],
      },
      summary:
        '用于定位草稿已更新但检索结果仍旧命中过期内容的场景。核心检查点是索引状态、版本号差异和操作审计标识。',
      keywords: ['索引状态', '索引重建', 'indexStatus dirty', '草稿未同步'],
      chunks: [
        {
          heading: '症状与前置条件',
          content:
            '症状：文档编辑后草稿已更新，但搜索结果仍返回旧内容。前置条件：拥有管理权限，且已定位到目标文档。',
        },
        {
          heading: '处理步骤',
          content: [
            '1. 检查索引状态，对比草稿版本与索引版本号。',
            '2. 如果草稿版本 > 索引版本或状态为不一致，执行索引重建。',
            '3. 重建完成后用原查询条件重新检索验证。',
            '4. 记录操作审计标识，便于问题回溯。',
          ].join('\n'),
        },
      ],
    },
  },
  {
    scenario: 'repository',
    title: '仓库说明萃取示例',
    source: [
      '# Project',
      '一个很强大的知识平台。',
      '详见代码。',
    ].join('\n'),
    problems: [
      '没有给出模块边界、入口方式和稳定命令。',
      '"很强大"这类营销语对检索没有帮助。',
      '读者无法从单块内容推断功能对应关系。',
    ],
    extractionSample: {
      title: '知识平台摘要（萃取后）',
      frontmatter: {
        title: '知识平台摘要',
        category: '知识库索引',
        tags: ['capability catalog', 'HTTP', 'CLI', 'SDK'],
        key_concepts: [
          'capability catalog: 单一事实源，同一能力投影到多种调用入口',
        ],
      },
      summary:
        '以能力目录为单一事实源，把同一能力投影到 HTTP、CLI、SDK 等多种入口。适用于多租户私域知识检索与导入场景。',
      keywords: ['capability catalog', 'HTTP', 'CLI', 'SDK'],
      chunks: [
        {
          heading: '能力入口映射',
          content:
            '同一能力同时映射到 HTTP 路径、CLI 命令和 SDK 方法，新增能力必须先注册到能力目录，再由适配层投影到各入口。',
        },
        {
          heading: '检索质量关键点',
          content:
            '检索链路不是单纯 embedding 匹配，同一查询还会经过 ACL 过滤、scope 收敛、精确文本匹配和 Rerank 重排序。因此文档需要同时保留语义描述和精确标识符。',
        },
      ],
    },
  },
];

// ─── 辅助函数 ───

function normalizeScenario(value: unknown): DocumentExtractionScenario {
  if (typeof value !== 'string') {
    return 'general';
  }

  switch (value) {
    case 'api':
    case 'runbook':
    case 'faq':
    case 'repository':
    case 'mechanism-reference':
    case 'knowledge-base-index':
      return value;
    default:
      return 'general';
  }
}

function selectExamples(scenario: DocumentExtractionScenario) {
  if (scenario === 'general') {
    return EXAMPLES;
  }

  return EXAMPLES.filter((item) => item.scenario === scenario);
}

// ─── 对外导出 ───

export function buildDocumentExtractionGuide(input: Record<string, unknown>) {
  const scenario = normalizeScenario(input.scenario);

  return {
    item: {
      title: 'OpenViking 文档萃取规范',
      version: 'v2',
      scenario,
      changelog: [
        'v2: 新增 mechanism-reference 和 knowledge-base-index 场景类型。',
        'v2: 新增 YAML frontmatter 规范（title/category/tags/key_concepts/cross_refs）。',
        'v2: 新增知识库索引文档模式（检索路由）。',
        'v2: 新增跨知识库引用机制和 applicable_scenarios 多技术栈标注。',
        'v2: 新增 category 分类体系和同义词映射规范。',
        'v2: 新增 5 个萃取场景示例。',
      ],
      openvikingFeatures: OPENVIKING_FEATURES,
      extractionSpecification: EXTRACTION_SPECIFICATION,
      knowledgeBaseIndexPattern: KNOWLEDGE_BASE_INDEX_PATTERN,
      checklist: CHECKLIST,
      antiPatterns: ANTI_PATTERNS,
      publishingWorkflow: PUBLISHING_WORKFLOW,
      examples: selectExamples(scenario),
    },
  };
}