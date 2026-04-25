import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('OpenViking skill smoke', () => {
  const root = resolve(__dirname, '../../../..');
  const skillPaths = [
    resolve(root, '.agents/skills/openviking-knowledge-tools/SKILL.md'),
    resolve(root, '.claude/skills/openviking-knowledge-tools/SKILL.md'),
    resolve(root, 'examples/skill/README.md'),
  ];

  it('should keep skill artifacts aligned with capability-first usage', () => {
    const contents = skillPaths.map((filePath) => readFileSync(filePath, 'utf8'));

    for (const [index, content] of contents.entries()) {
      expect(content).toContain('/api/capabilities');
      expect(content).toMatch(/HTTP|CLI/);
      if (index < 2) {
        expect(content).toContain('不要在 skill 中模拟 MCP JSON-RPC');
      } else {
        expect(content).toContain('traceId');
      }
    }
  });
});
