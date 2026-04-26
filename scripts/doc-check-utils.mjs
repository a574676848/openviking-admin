import fs from 'node:fs';
import path from 'node:path';

export function getRepoRoot() {
  return process.cwd();
}

export function walkFiles(dir, predicate, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist', 'coverage'].includes(entry.name)) {
      continue;
    }

    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, predicate, files);
      continue;
    }

    if (entry.isFile() && predicate(nextPath)) {
      files.push(nextPath);
    }
  }

  return files;
}

function normalizeRoutePath(rawPath) {
  const trimmed = rawPath.trim().replace(/^['"`]|['"`]$/g, '');
  if (!trimmed) {
    return '/api/v1';
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `/api/v1${normalized}`.replace(/\/+/g, '/');
}

export function collectControllerRoutes(root) {
  const controllerFiles = walkFiles(
    path.join(root, 'apps/server/src'),
    (filePath) => filePath.endsWith('.controller.ts'),
  );
  const routes = [];

  for (const file of controllerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const controllerMatch = source.match(/@Controller\(([^)]*)\)/);
    const controllerArg = controllerMatch?.[1]?.trim() ?? '';
    const controllerPrefix = controllerArg
      ? controllerArg.replace(/^['"`]|['"`]$/g, '')
      : '';

    for (const match of source.matchAll(/@(Get|Post|Patch|Delete|Sse)\(([^)]*)\)/g)) {
      const decorator = match[1];
      const method = decorator === 'Sse' ? 'GET' : decorator.toUpperCase();
      const methodArg = match[2]?.trim() ?? '';
      const methodPath = methodArg ? methodArg.replace(/^['"`]|['"`]$/g, '') : '';
      const joinedPath = [controllerPrefix, methodPath].filter(Boolean).join('/');
      routes.push({
        file: path.relative(root, file).replace(/\\/g, '/'),
        method,
        path: normalizeRoutePath(joinedPath),
      });
    }
  }

  return routes;
}

export function collectDocumentedRoutes(root) {
  const apiReferencePath = path.join(root, 'docs/API_REFERENCE.md');
  const source = fs.readFileSync(apiReferencePath, 'utf8');
  const routes = new Set();

  for (const match of source.matchAll(/###\s+(GET|POST|PATCH|DELETE)\s+(\/api\/v1\/[^\s`]+)/g)) {
    routes.add(`${match[1]} ${match[2]}`);
  }

  for (const match of source.matchAll(/\|\s*`(GET|POST|PATCH|DELETE)`\s*\|\s*`(\/api\/v1\/[^`]+)`\s*\|/g)) {
    routes.add(`${match[1]} ${match[2]}`);
  }

  return Array.from(routes).sort();
}

export function collectCliCommands(root) {
  const cliUsagePath = path.join(root, 'packages/ova-cli/src/index.ts');
  const source = fs.readFileSync(cliUsagePath, 'utf8');
  const commands = new Set();

  for (const match of source.matchAll(/^\s*ova\s+([a-z-]+(?:\s+[a-z-]+)?)/gm)) {
    commands.add(match[1].trim());
  }

  return Array.from(commands).sort();
}

export function extractRoutesFromText(source) {
  const routes = new Set();
  for (const match of source.matchAll(/\/api\/v1\/[A-Za-z0-9\-/_:?&.=]+/g)) {
    const route = match[0].split('?')[0];
    routes.add(route);
  }
  return Array.from(routes).sort();
}

export function extractCliInvocations(source) {
  const commands = new Set();

  for (const line of source.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized.includes('ova')) {
      continue;
    }

    const tokens = normalized.split(/\s+/);
    const ovaIndex = tokens.findIndex((token) => token === 'ova');
    if (ovaIndex >= 0) {
      const commandTokens = tokens.slice(ovaIndex + 1).filter(Boolean);
      const [group, maybeCommand] = commandTokens;
      if (!group || group.startsWith('--')) {
        continue;
      }
      if (!maybeCommand || maybeCommand.startsWith('--')) {
        commands.add(group);
        continue;
      }
      commands.add(`${group} ${maybeCommand}`);
      continue;
    }

    const npmRunOvaIndex = tokens.findIndex(
      (token, index) =>
        token === 'ova' && index > 0 && ['run', 'exec'].includes(tokens[index - 1] ?? ''),
    );
    if (npmRunOvaIndex >= 0) {
      const afterOva = tokens.slice(npmRunOvaIndex + 1).filter(Boolean);
      const commandTokens =
        afterOva[0] === '--' ? afterOva.slice(1) : afterOva;
      const [group, maybeCommand] = commandTokens;
      if (!group || group.startsWith('--')) {
        continue;
      }
      if (!maybeCommand || maybeCommand.startsWith('--')) {
        commands.add(group);
        continue;
      }
      commands.add(`${group} ${maybeCommand}`);
    }
  }
  return Array.from(commands).sort();
}
