import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CommonModule } from './common.module';
import { DocumentSessionRegistry } from './document-session-registry';

describe('DocumentSessionRegistry', () => {
  let registry: DocumentSessionRegistry;

  beforeEach(() => {
    registry = new DocumentSessionRegistry();
  });

  it('应该登记只读会话并维护知识库活跃索引', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'readonly');

    expect(registry.hasActiveSession('node-1')).toBe(true);
    expect(registry.hasActiveWriteSession('node-1')).toBe(false);
    expect(registry.hasActiveSessionInKb('kb-1')).toBe(true);
  });

  it('应该区分可写会话与只读会话', () => {
    registry.register('kb-1', 'node-1', 'conn-read', 'readonly');
    registry.register('kb-1', 'node-1', 'conn-write', 'write');

    expect(registry.hasActiveSession('node-1')).toBe(true);
    expect(registry.hasActiveWriteSession('node-1')).toBe(true);

    registry.unregister('kb-1', 'node-1', 'conn-write');

    expect(registry.hasActiveSession('node-1')).toBe(true);
    expect(registry.hasActiveWriteSession('node-1')).toBe(false);
  });

  it('应该在最后一个连接注销后释放节点和知识库索引', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'readonly');
    registry.register('kb-1', 'node-1', 'conn-2', 'write');

    registry.unregister('kb-1', 'node-1', 'conn-1');

    expect(registry.hasActiveSession('node-1')).toBe(true);
    expect(registry.hasActiveSessionInKb('kb-1')).toBe(true);

    registry.unregister('kb-1', 'node-1', 'conn-2');

    expect(registry.hasActiveSession('node-1')).toBe(false);
    expect(registry.hasActiveWriteSession('node-1')).toBe(false);
    expect(registry.hasActiveSessionInKb('kb-1')).toBe(false);
  });

  it('同一知识库下仍有其他节点会话时不应清空知识库索引', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'readonly');
    registry.register('kb-1', 'node-2', 'conn-2', 'readonly');

    registry.unregister('kb-1', 'node-1', 'conn-1');

    expect(registry.hasActiveSession('node-1')).toBe(false);
    expect(registry.hasActiveSession('node-2')).toBe(true);
    expect(registry.hasActiveSessionInKb('kb-1')).toBe(true);
  });

  it('注销不存在的连接应该保持幂等', () => {
    expect(() =>
      registry.unregister('kb-1', 'node-missing', 'conn-missing'),
    ).not.toThrow();
  });

  it('可写会话存在时 assertNoActiveWriteSession 应抛出 423', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'write');

    expect(() => registry.assertNoActiveWriteSession('node-1')).toThrow(
      HttpException,
    );

    try {
      registry.assertNoActiveWriteSession('node-1');
    } catch (error) {
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.LOCKED);
      expect(exception.message).toBe('目标节点正在被协作编辑');
    }
  });

  it('只有只读会话时 assertNoActiveWriteSession 应放行', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'readonly');

    expect(() => registry.assertNoActiveWriteSession('node-1')).not.toThrow();
  });

  it('节点集合内存在任意会话时 assertNoActiveSessionInNodes 应抛出 423', () => {
    registry.register('kb-1', 'child-1', 'conn-1', 'readonly');

    try {
      registry.assertNoActiveSessionInNodes(['parent-1', 'child-1']);
    } catch (error) {
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.LOCKED);
      expect(exception.message).toBe('目标节点或子节点正在被协作编辑');
      return;
    }

    throw new Error('预期应该抛出协作会话锁异常');
  });

  it('节点集合没有活跃会话时 assertNoActiveSessionInNodes 应放行', () => {
    registry.register('kb-1', 'node-1', 'conn-1', 'readonly');

    expect(() =>
      registry.assertNoActiveSessionInNodes(['node-2', 'node-3']),
    ).not.toThrow();
  });

  it('CommonModule 应导出 DocumentSessionRegistry provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule],
    }).compile();

    expect(moduleRef.get(DocumentSessionRegistry)).toBeInstanceOf(
      DocumentSessionRegistry,
    );

    await moduleRef.close();
  });
});
