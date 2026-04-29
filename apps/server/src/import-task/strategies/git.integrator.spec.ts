import { IntegrationType } from '../../common/constants/system.enum';
import { GitIntegrator } from './git.integrator';

describe('GitIntegrator', () => {
  const integrator = new GitIntegrator();

  it('GitLab 凭证应生成 OpenViking 可 clone 的 oauth2 URL', async () => {
    const result = await integrator.resolveConfig(
      {
        type: IntegrationType.GITLAB,
        credentials: { token: 'gl-token' },
      } as never,
      'https://git.example.com/group/repo',
    );

    expect(result).toEqual({
      path: 'http://oauth2:gl-token@git.example.com/group/repo',
      fallbackPaths: [
        'https://oauth2:gl-token@git.example.com/group/repo',
        'http://gl-token@git.example.com/group/repo',
        'https://gl-token@git.example.com/group/repo',
      ],
    });
  });

  it('GitLab 凭证应优先尝试配置中的用户名', async () => {
    const result = await integrator.resolveConfig(
      {
        type: IntegrationType.GITLAB,
        credentials: { token: 'gl-token', username: 'admin' },
      } as never,
      'https://git.example.com/group/repo',
    );

    expect(result.fallbackPaths).toContain('http://admin:gl-token@git.example.com/group/repo');
    expect(result.fallbackPaths).toContain('https://admin:gl-token@git.example.com/group/repo');
  });

  it('GitHub 凭证保持 token 用户名格式', async () => {
    const result = await integrator.resolveConfig(
      {
        type: IntegrationType.GITHUB,
        credentials: { token: 'gh-token' },
      } as never,
      'https://github.com/group/repo',
    );

    expect(result).toEqual({
      path: 'https://gh-token@github.com/group/repo',
    });
  });

  it('自托管 GitHub 类型应补充同主机 GitLab 兼容 fallback', async () => {
    const result = await integrator.resolveConfig(
      {
        type: IntegrationType.GITHUB,
        credentials: { token: 'git-token', username: 'admin' },
      } as never,
      'https://git.exexm.com/epaas-product/exe-cloud-business-center',
    );

    expect(result.path).toBe(
      'https://git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
    );
    expect(result.fallbackPaths).toEqual([
      'http://oauth2:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'http://admin:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'https://oauth2:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'https://admin:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'http://git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
    ]);
  });
});
