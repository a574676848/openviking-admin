import fs from 'node:fs';
import path from 'node:path';
import { collectCliCommands, getRepoRoot } from './doc-check-utils.mjs';

const root = getRepoRoot();
const readmePath = path.join(root, 'README.md');
const examplesReadmePath = path.join(root, 'examples/README.md');
const packageJsonPath = path.join(root, 'package.json');
const serverPackageJsonPath = path.join(root, 'apps/server/package.json');

const readmeSource = fs.readFileSync(readmePath, 'utf8');
const examplesReadmeSource = fs.readFileSync(examplesReadmePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const serverPackageJson = JSON.parse(fs.readFileSync(serverPackageJsonPath, 'utf8'));

const failures = [];

const requiredReadmeCommands = [
  'pnpm install',
  'pnpm migration:run',
  'pnpm start:dev',
  'pnpm server:migration:run',
  'pnpm server:dev',
  'npm run ova -- auth login',
  'npm run ova -- capabilities list',
  'npm run ova -- knowledge search',
  'npm install -g @openviking-admin/ova-cli',
  'ova doctor',
];

for (const command of requiredReadmeCommands) {
  if (!readmeSource.includes(command) && !examplesReadmeSource.includes(command)) {
    failures.push(`README/examples 未包含核心命令: ${command}`);
  }
}

const requiredRootScripts = ['docs:check', 'env:check', 'server:dev', 'server:migration:run', 'ova'];
for (const scriptName of requiredRootScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`根 package.json 缺少脚本: ${scriptName}`);
  }
}

const requiredServerScripts = ['start:dev', 'migration:run', 'migration:show'];
for (const scriptName of requiredServerScripts) {
  if (!serverPackageJson.scripts?.[scriptName]) {
    failures.push(`apps/server/package.json 缺少脚本: ${scriptName}`);
  }
}

const cliCommands = new Set(collectCliCommands(root));

const requiredCliUsageSnippets = [
  'auth login',
  'capabilities list',
  'knowledge search',
  'resources tree',
  'doctor',
];

for (const snippet of requiredCliUsageSnippets) {
  if (!cliCommands.has(snippet)) {
    failures.push(`CLI 源码未暴露核心命令: ova ${snippet}`);
  }
}

if (failures.length > 0) {
  console.error('README 核心命令 smoke check 失败:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`README 核心命令 smoke check 通过，共校验 ${requiredReadmeCommands.length} 条命令与脚本入口。`);
