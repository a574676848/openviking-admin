type DocumentExtractionScenario =
  | 'general'
  | 'api'
  | 'runbook'
  | 'faq'
  | 'repository';

interface ExtractionExample {
  scenario: DocumentExtractionScenario;
  title: string;
  source: string;
  problems: string[];
  extractionSample: {
    title: string;
    summary: string;
    keywords: string[];
    metadata: Record<string, unknown>;
    chunks: Array<Record<string, unknown>>;
  };
}

const OPENVIKING_FEATURES = [
  {
    id: 'semantic_recall',
    feature: '语义召回优先',
    implication:
      '每个切片都要自包含主题、对象、动作、范围和约束，避免只剩标题或上下文残片。',
  },
  {
    id: 'acl_scope',
    feature: 'ACL 与 URI scope 过滤',
    implication:
      '文档必须显式写清所属产品、模块、租户域、知识库路径和适用范围，避免召回后再被 scope 收窄成噪声。',
  },
  {
    id: 'exact_match',
    feature: '文本匹配链路共存',
    implication:
      '接口路径、字段名、枚举值、错误码、配置键、脚本名和命令行参数必须原样保留，方便 grep 命中。',
  },
  {
    id: 'rerank',
    feature: 'Rerank 会放大标题与摘要质量',
    implication:
      '标题、摘要、关键词和首段要直接回答“这段文档解决什么问题”，不要依赖读者先通读整页。',
  },
  {
    id: 'traceability',
    feature: '调用可审计可追踪',
    implication:
      '规范里应保留来源、更新时间、owner、版本、稳定 URI 和相关 capability，便于检索异常时回溯。',
  },
  {
    id: 'draft_index_split',
    feature: '草稿与索引解耦',
    implication:
      '文档修改后要把“何时需要执行 documents.index.rebuild”写入发布流程，否则检索会命中过期内容。',
  },
] as const;

const EXTRACTION_SPECIFICATION = {
  objective:
    '让文档既能被语义召回，也能被精确 grep 和 rerank 正确排序，同时保留多租户和 ACL 场景下的范围线索。',
  documentLevel: [
    '每篇文档先归一化 title、summary、docType、owner、updatedAt、sourceUri、kbPath。',
    '第一屏必须写清适用范围、目标对象、前置条件和不适用场景。',
    '术语首次出现时同时保留 canonical term 与常见别名，例如 capability access token / API key / session key。',
    '去掉目录、页眉页脚、宣传语、重复版权和纯导航锚点，只保留可回答问题的正文。',
  ],
  chunkLevel: {
    targetCharacters: { min: 400, preferred: 800, max: 1400 },
    overlapCharacters: { min: 80, preferred: 120, max: 180 },
    splitOrder: [
      '优先按 H2/H3 语义节切分',
      '步骤型内容按“前置条件 -> 步骤 -> 校验 -> 回滚”切分',
      '表格保留表头并与解释段落同块',
      '代码块必须与解释、适用版本和关键参数在同一块或相邻块',
    ],
    hardRules: [
      '不要把一个接口的 path、method、请求体、返回码拆到不同 chunk。',
      '不要把一条 runbook 的症状、处理步骤、验证方式拆散。',
      '不要生成只有“见上文/如下图/继续下一节”这种悬空表述的 chunk。',
    ],
  },
  metadata: {
    required: [
      'title',
      'summary',
      'docType',
      'sourceUri',
      'updatedAt',
      'owner',
      'kbPath',
      'canonicalTerms',
    ],
    recommended: [
      'product',
      'module',
      'capabilities',
      'httpPaths',
      'cliCommands',
      'mcpTools',
      'aliases',
      'version',
      'tags',
    ],
  },
  qualityGate: [
    '任一 chunk 脱离原文后，仍能回答“是什么、何时用、怎么做、有什么限制”。',
    '必须同时保留语义词和精确词，例如“检索规范”“documents.extract.guide”“/api/v1/capability/documents/extract/guide”。',
    '如果文档涉及配置或命令，必须包含最小可执行示例，而不只是解释性描述。',
    '如果内容会因编辑器草稿变更而失效，必须明确索引刷新动作和触发时机。',
  ],
};

const CHECKLIST = [
  '标题直接写主题 + 对象 + 动作，例如“OpenViking 文档萃取规范”。',
  '摘要 2 到 4 句内覆盖用途、适用范围、输入产物和输出产物。',
  '显式补齐产品名、模块名、能力名、HTTP path、CLI 命令、MCP tool。',
  '步骤块保留前置条件、步骤、校验、失败处理和回滚。',
  '保留错误码、字段名、配置键、版本号、脚本名等可 grep 锚点。',
  '为专有名词补别名与中文解释，降低 query 表达差异带来的召回损失。',
  '清理页面噪声、重复导航、截图文字未转录内容。',
  '发布后对变更文档执行索引刷新，保证检索看到的是最新正文。',
];

const ANTI_PATTERNS = [
  '整页只抽“第 1 章 / 第 2 章”这种目录标题，没有正文结论。',
  '把 API path、字段、错误码都放进截图或附件，正文里没有可检索文本。',
  '大块复制 changelog，缺少当前稳定结论和适用版本。',
  '一个 chunk 同时混入多个主题，导致 rerank 无法判断主问题。',
  '文档已经改了草稿但没有 rebuild 索引，线上检索仍命中过期内容。',
];

const EXAMPLES: ExtractionExample[] = [
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
      '没有保留精确 path、capability、CLI 和 MCP 锚点。',
    ],
    extractionSample: {
      title: 'OpenViking capability 知识搜索接口',
      summary:
        '用于在租户知识域内执行语义搜索。适用于 HTTP、CLI、MCP 和 Skill 四种入口，统一复用 ACL、URI scope 与 rerank 链路。',
      keywords: [
        'knowledge.search',
        '/api/v1/knowledge/search',
        'ova knowledge search',
        'MCP tool',
      ],
      metadata: {
        docType: 'api',
        httpPath: '/api/v1/knowledge/search',
        cliCommand: 'ova knowledge search',
        mcpTool: 'knowledge.search',
        auth: ['capability_access_token', 'api_key', 'session_key'],
      },
      chunks: [
        {
          heading: '用途与范围',
          content:
            '在租户知识域内执行语义搜索，服务端会叠加 ACL 过滤、URI scope 收敛和 rerank。适合查询制度、产品文档、运行手册等非结构化知识。',
        },
        {
          heading: '最小调用示例',
          content: [
            'HTTP: POST /api/v1/knowledge/search',
            'CLI: ova knowledge search --query "多租户隔离" --limit 5',
            'MCP: knowledge.search { query: "多租户隔离", limit: 5 }',
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
      '“重试一下”无法回答具体执行什么命令。',
      '没有区分草稿未同步还是引擎异常。',
    ],
    extractionSample: {
      title: '文档索引未同步排查 Runbook',
      summary:
        '用于定位 Admin 草稿已更新但检索结果仍旧命中过期内容的场景。核心检查点是 documents.index.status、documents.index.rebuild 和 traceId。',
      keywords: [
        'documents.index.status',
        'documents.index.rebuild',
        'indexStatus dirty',
        'traceId',
      ],
      metadata: {
        docType: 'runbook',
        relatedCapabilities: [
          'documents.index.status',
          'documents.index.rebuild',
        ],
        owner: 'platform-ops',
      },
      chunks: [
        {
          heading: '症状与前置条件',
          content:
            '症状：文档编辑后控制台草稿已更新，但 knowledge.search 或 MCP 问答返回旧内容。前置条件：拥有 tenant_operator 权限，且已拿到目标 nodeId。',
        },
        {
          heading: '处理步骤',
          content: [
            '1. 调用 documents.index.status 检查 indexStatus、draftVersion、indexedVersion。',
            '2. 如果 draftVersion > indexedVersion 或 indexStatus=dirty，执行 documents.index.rebuild。',
            '3. 重新检索并记录 traceId，用于审计与问题回溯。',
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
      '“很强大”这类营销语对检索没有帮助。',
      '仓库读者无法从单块内容推断 capability 对应关系。',
    ],
    extractionSample: {
      title: 'OpenViking Admin 能力平台摘要',
      summary:
        'OpenViking Admin 以 capability catalog 为单一事实源，把同一能力投影到 HTTP、CLI、MCP 和 Skill。适用于多租户私域知识检索与导入。',
      keywords: [
        'capability catalog',
        'HTTP',
        'CLI',
        'MCP',
        'Skill',
      ],
      metadata: {
        docType: 'repository',
        product: 'OpenViking Admin',
        module: 'capability-platform',
      },
      chunks: [
        {
          heading: '能力入口映射',
          content:
            '同一 capability 同时映射到 HTTP path、ova CLI 命令和 MCP tool，新增能力必须先进入 capability registry，再由 adapter 投影出去。',
        },
        {
          heading: '检索质量关键点',
          content:
            '检索链路不是单纯 embedding，相同 query 还会经过 ACL、URI scope、文本匹配和 rerank，因此文档需要同时保留语义描述和精确标识符。',
        },
      ],
    },
  },
];

function normalizeScenario(value: unknown): DocumentExtractionScenario {
  if (typeof value !== 'string') {
    return 'general';
  }

  switch (value) {
    case 'api':
    case 'runbook':
    case 'faq':
    case 'repository':
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

export function buildDocumentExtractionGuide(input: Record<string, unknown>) {
  const scenario = normalizeScenario(input.scenario);

  return {
    item: {
      title: 'OpenViking 文档萃取规范',
      version: 'v1',
      scenario,
      openvikingFeatures: OPENVIKING_FEATURES,
      extractionSpecification: EXTRACTION_SPECIFICATION,
      checklist: CHECKLIST,
      antiPatterns: ANTI_PATTERNS,
      publishingWorkflow: [
        '先做文档归一化：标题、摘要、元数据、术语别名。',
        '再做语义切块：按主题而不是按页面或视觉布局切分。',
        '导入到知识库后，用精确词和自然语言各做一次抽样检索。',
        '文档草稿更新后，按需要执行 documents.index.rebuild，确保索引新鲜度。',
      ],
      examples: selectExamples(scenario),
      relatedCapabilities: [
        'documents.extract.guide',
        'knowledge.search',
        'knowledge.grep',
        'documents.index.rebuild',
      ],
    },
  };
}