import fs from 'node:fs';
import path from 'node:path';
import {
  collectCliCommands,
  collectControllerRoutes,
  extractCliInvocations,
  extractRoutesFromText,
  getRepoRoot,
  walkFiles,
} from './doc-check-utils.mjs';

const root = getRepoRoot();
const exampleFiles = walkFiles(
  path.join(root, 'examples'),
  (filePath) => /\.(sh|json|md)$/i.test(filePath),
);
const routeSet = new Set(
  collectControllerRoutes(root).map((route) => route.path),
);
const cliCommandSet = new Set(collectCliCommands(root));
const failures = [];

for (const file of exampleFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relativeFile = path.relative(root, file).replace(/\\/g, '/');

  for (const route of extractRoutesFromText(source)) {
    if (!routeSet.has(route)) {
      failures.push(`${relativeFile} 引用了不存在的 API 路径: ${route}`);
    }
  }

  for (const cliCommand of extractCliInvocations(source)) {
    if (!cliCommandSet.has(cliCommand)) {
      failures.push(`${relativeFile} 引用了不存在的 CLI 命令: ova ${cliCommand}`);
    }
  }

  if (file.endsWith('.sh') && !source.includes('set -euo pipefail')) {
    failures.push(`${relativeFile} 缺少 set -euo pipefail`);
  }
}

if (failures.length > 0) {
  console.error('examples smoke check 失败:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`examples smoke check 通过，共校验 ${exampleFiles.length} 个示例文件。`);
