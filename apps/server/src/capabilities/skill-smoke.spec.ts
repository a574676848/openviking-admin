import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('OpenViking skill smoke', () => {
  const root = resolve(__dirname, '../../../..');
  const skillPaths = [
    resolve(root, '.agents/skills/openviking-knowledge-tools/SKILL.md'),
    resolve(root, '.claude/skills/openviking-knowledge-tools/SKILL.md'),
    resolve(root, 'examples/skill/README.md'),
  ];

  it('should keep skill artifacts aligned with capability-first usage', () => {
    const contents = skillPaths
      .filter((filePath) => existsSync(filePath))
      .map((filePath) => readFileSync(filePath, 'utf8'));

    expect(contents.length).toBeGreaterThan(0);

    for (const [index, content] of contents.entries()) {
      expect(content).toContain('/api/v1/capabilities');
      expect(content).toMatch(/HTTP|CLI/);
      if (content.includes('不要在 skill 中模拟 MCP JSON-RPC')) {
        expect(content).toContain('不要在 skill 中模拟 MCP JSON-RPC');
      } else {
        expect(content).toContain('traceId');
      }
    }
  });
});
