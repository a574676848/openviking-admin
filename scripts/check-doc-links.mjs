import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const markdownFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue;
    }
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(nextPath);
      continue;
    }
    if (entry.isFile() && nextPath.endsWith('.md')) {
      markdownFiles.push(nextPath);
    }
  }
}

walk(path.join(root, 'docs'));
markdownFiles.push(path.join(root, 'README.md'));

const broken = [];
const markdownLinkPattern = /\[[^\]]+\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/g;

for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const rawTarget = match[1].replace(/^<|>$/g, '');
    const target = rawTarget.split('#')[0];
    if (!target) {
      continue;
    }
    const absoluteTarget = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(absoluteTarget)) {
      broken.push(`${path.relative(root, file)} -> ${rawTarget}`);
    }
  }
}

if (broken.length > 0) {
  console.error('发现失效文档链接:');
  for (const item of broken) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`文档链接检查通过，共扫描 ${markdownFiles.length} 个 Markdown 文件。`);
