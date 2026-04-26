import { getRepoRoot, collectControllerRoutes, collectDocumentedRoutes } from './doc-check-utils.mjs';

const root = getRepoRoot();
const controllerRoutes = collectControllerRoutes(root);
const documentedRoutes = new Set(collectDocumentedRoutes(root));
const actualRoutes = new Set(
  controllerRoutes.map((route) => `${route.method} ${route.path}`),
);

const ignoredRoutes = new Set([
  'GET /api/v1',
]);

const undocumented = Array.from(actualRoutes)
  .filter((route) => !ignoredRoutes.has(route) && !documentedRoutes.has(route))
  .sort();
const staleDocs = Array.from(documentedRoutes)
  .filter((route) => !actualRoutes.has(route))
  .sort();

if (undocumented.length > 0 || staleDocs.length > 0) {
  console.error('API 文档与 NestJS 路由对照失败:');
  if (undocumented.length > 0) {
    console.error('未文档化路由:');
    for (const route of undocumented) {
      console.error(`- ${route}`);
    }
  }
  if (staleDocs.length > 0) {
    console.error('文档存在但源码不存在的路由:');
    for (const route of staleDocs) {
      console.error(`- ${route}`);
    }
  }
  process.exit(1);
}

console.log(`API 文档路由对照通过，共校验 ${actualRoutes.size - ignoredRoutes.size} 条源码路由。`);
