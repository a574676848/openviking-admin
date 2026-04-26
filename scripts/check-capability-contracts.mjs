import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'apps/server/src/capabilities/application/capability-registry.ts');
const cliPath = path.join(root, 'packages/ova-cli/src/index.ts');
const apiDocPath = path.join(root, 'docs/API_REFERENCE.md');
const readmePath = path.join(root, 'README.md');
const capabilitiesDocPath = path.join(root, 'docs/CAPABILITIES.md');
const skillGuidePath = path.join(root, 'docs/SKILL_GUIDE.md');
const mcpGuidePath = path.join(root, 'docs/MCP_GUIDE.md');
const skillExampleReadmePath = path.join(root, 'examples/skill/README.md');
const skillExamplePath = path.join(root, 'examples/skill/SKILL.md');
const httpSearchExamplePath = path.join(root, 'examples/http/login-and-search.sh');
const httpResourcesTreeExamplePath = path.join(root, 'examples/http/resources-tree.sh');
const cliSearchExamplePath = path.join(root, 'examples/cli/search.sh');
const mcpSearchExamplePath = path.join(root, 'examples/mcp/tools-call-search.json');

const registrySource = fs.readFileSync(registryPath, 'utf8');
const cliSource = fs.readFileSync(cliPath, 'utf8');
const apiDocSource = fs.readFileSync(apiDocPath, 'utf8');
const readmeSource = fs.readFileSync(readmePath, 'utf8');
const capabilitiesDocSource = fs.readFileSync(capabilitiesDocPath, 'utf8');
const skillGuideSource = fs.readFileSync(skillGuidePath, 'utf8');
const mcpGuideSource = fs.readFileSync(mcpGuidePath, 'utf8');
const skillExampleReadmeSource = fs.readFileSync(skillExampleReadmePath, 'utf8');
const skillExampleSource = fs.readFileSync(skillExamplePath, 'utf8');
const httpSearchExampleSource = fs.readFileSync(httpSearchExamplePath, 'utf8');
const httpResourcesTreeExampleSource = fs.readFileSync(httpResourcesTreeExamplePath, 'utf8');
const cliSearchExampleSource = fs.readFileSync(cliSearchExamplePath, 'utf8');
const mcpSearchExampleSource = fs.readFileSync(mcpSearchExamplePath, 'utf8');

const registryEntries = [...registrySource.matchAll(/'([^']+)':\s*{[\s\S]*?id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'[\s\S]*?command:\s*'([^']+)'/g)].map(
  (item) => ({
    key: item[1],
    capabilityId: item[2],
    httpPath: item[3],
    cliCommand: item[4],
  }),
);

const httpDocsToCheck = [
  { label: 'README', source: readmeSource },
  { label: 'API_REFERENCE', source: apiDocSource },
  { label: 'CAPABILITIES', source: capabilitiesDocSource },
];

const capabilityDocsToCheck = [
  { label: 'README', source: readmeSource },
  { label: 'CAPABILITIES', source: capabilitiesDocSource },
  { label: 'MCP_GUIDE', source: mcpGuideSource },
];

const skillDocsToCheck = [
  { label: 'SKILL_GUIDE', source: skillGuideSource },
  { label: 'examples/skill/README', source: skillExampleReadmeSource },
  { label: 'examples/skill/SKILL', source: skillExampleSource },
];

const failures = [];

for (const entry of registryEntries) {
  if (entry.key !== entry.capabilityId) {
    failures.push(
      `capabilityRegistry key 与 contract.id 不一致: ${entry.key} != ${entry.capabilityId}`,
    );
  }

  for (const doc of capabilityDocsToCheck) {
    if (!doc.source.includes(entry.capabilityId)) {
      failures.push(`${doc.label} 未同步 capability: ${entry.capabilityId}`);
    }
  }

  for (const doc of httpDocsToCheck) {
    if (!doc.source.includes(entry.httpPath)) {
      failures.push(`${doc.label} 未同步 HTTP path: ${entry.httpPath}`);
    }
  }

  for (const doc of skillDocsToCheck) {
    if (!doc.source.includes(entry.capabilityId)) {
      failures.push(`${doc.label} 未同步 capability: ${entry.capabilityId}`);
    }
    if (!doc.source.includes(entry.httpPath)) {
      failures.push(`${doc.label} 未同步 capability path: ${entry.httpPath}`);
    }
    if (!doc.source.includes(entry.cliCommand)) {
      failures.push(`${doc.label} 未同步 CLI command: ${entry.cliCommand}`);
    }
  }

  if (!entry.httpPath.startsWith('/api/v1/')) {
    failures.push(`HTTP path 未使用 /api/v1 前缀: ${entry.httpPath}`);
  }

  if (!cliSource.includes(entry.cliCommand) || !readmeSource.includes(entry.cliCommand)) {
    failures.push(`CLI 命令未同步: ${entry.cliCommand}`);
  }
}

const exampleExpectations = [
  {
    label: 'examples/http/login-and-search.sh',
    source: httpSearchExampleSource,
    expected: ['/api/v1/knowledge/search'],
  },
  {
    label: 'examples/http/resources-tree.sh',
    source: httpResourcesTreeExampleSource,
    expected: ['/api/v1/resources/tree'],
  },
  {
    label: 'examples/cli/search.sh',
    source: cliSearchExampleSource,
    expected: ['ova knowledge search'],
  },
  {
    label: 'examples/mcp/tools-call-search.json',
    source: mcpSearchExampleSource,
    expected: ['knowledge.search'],
  },
];

for (const expectation of exampleExpectations) {
  for (const item of expectation.expected) {
    if (!expectation.source.includes(item)) {
      failures.push(`${expectation.label} 未同步示例: ${item}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Capability 契约检查失败:');
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Capability 契约检查通过，共校验 ${registryEntries.length} 个能力及文档示例映射。`);
