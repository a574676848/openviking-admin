import { IntegrationType } from '../../common/constants/system.enum';
import { GitIntegrator } from './git.integrator';
import type { PlatformInjectConfig } from './platform-integrator.interface';

class FallbackOnlyGitIntegrator extends GitIntegrator {
  protected async resolveByArchiveApi(): Promise<PlatformInjectConfig | null> {
    throw new Error('api failed');
  }

  protected async resolveByArchiveCli(): Promise<PlatformInjectConfig | null> {
    throw new Error('cli failed');
  }
}

class CliSuccessGitIntegrator extends GitIntegrator {
  protected async resolveByArchiveApi(): Promise<PlatformInjectConfig | null> {
    throw new Error('api failed');
  }

  protected async resolveByArchiveCli(): Promise<PlatformInjectConfig | null> {
    return {
      tempFile: {
        fileName: 'repo.zip',
        buffer: Buffer.from('cli-zip'),
        mimeType: 'application/zip',
      },
      waitForCompletion: true,
    };
  }
}

class GitLabApiSuccessGitIntegrator extends GitIntegrator {
  public archiveUrl?: string;
  public archiveHeaders?: Record<string, string>;

  protected async downloadGitLabArchiveBuffer(
    archiveUrl: string,
    headers: Record<string, string>,
  ): Promise<Buffer> {
    this.archiveUrl = archiveUrl;
    this.archiveHeaders = headers;
    return Buffer.from('gitlab-api-zip');
  }
}

describe('GitIntegrator', () => {
  const integrator = new FallbackOnlyGitIntegrator();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GitHub 应优先通过 API 下载 archive', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('api-zip'), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    );

    const result = await new GitIntegrator().resolveConfig(
      {
        type: IntegrationType.GITHUB,
        credentials: { token: 'gh-token' },
        config: { branch: 'main' },
      } as never,
      'https://github.com/openviking/openviking-knowdge',
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/openviking/openviking-knowdge/zipball/main',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gh-token',
        }),
      }),
    );
    expect(result.tempFile).toEqual({
      fileName: 'openviking-knowdge-main.zip',
      buffer: Buffer.from('api-zip'),
      mimeType: 'application/zip',
    });
    expect(result.waitForCompletion).toBe(false);
  });

  it('GitLab 应通过 API archive 下载 zip 并注入 tempFile', async () => {
    const gitlabIntegrator = new GitLabApiSuccessGitIntegrator();

    const result = await gitlabIntegrator.resolveConfig(
      {
        type: IntegrationType.GITLAB,
        credentials: { token: 'gl-token' },
        config: { branch: 'main' },
      } as never,
      'https://git.example.com/group/repo',
    );

    expect(gitlabIntegrator.archiveUrl).toBe(
      'https://git.example.com/api/v4/projects/group%2Frepo/repository/archive.zip?sha=main',
    );
    expect(gitlabIntegrator.archiveHeaders).toEqual(
      expect.objectContaining({
        Accept: 'application/zip',
        'PRIVATE-TOKEN': 'gl-token',
      }),
    );
    expect(result.tempFile).toEqual({
      fileName: 'repo-main.zip',
      buffer: Buffer.from('gitlab-api-zip'),
      mimeType: 'application/zip',
    });
    expect(result.waitForCompletion).toBe(false);
  });

  it('API 失败后应尝试 CLI archive', async () => {
    const result = await new CliSuccessGitIntegrator().resolveConfig(
      {
        type: IntegrationType.GITLAB,
        credentials: { token: 'gl-token' },
      } as never,
      'https://git.example.com/group/repo',
    );

    expect(result.tempFile).toEqual({
      fileName: 'repo.zip',
      buffer: Buffer.from('cli-zip'),
      mimeType: 'application/zip',
    });
    expect(result.waitForCompletion).toBe(true);
  });

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
      fallbackPaths: ['https://oauth2:gl-token@git.example.com/group/repo'],
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

    expect(result.fallbackPaths).toContain(
      'http://admin:gl-token@git.example.com/group/repo',
    );
    expect(result.fallbackPaths).toContain(
      'https://admin:gl-token@git.example.com/group/repo',
    );
  });

  it('GitLab 凭证不应生成 token-only URL', async () => {
    const result = await integrator.resolveConfig(
      {
        type: IntegrationType.GITLAB,
        credentials: { token: 'gl-token', username: 'admin' },
      } as never,
      'https://git.example.com/group/repo',
    );

    const paths = [result.path, ...(result.fallbackPaths ?? [])];
    expect(paths).not.toContain('http://gl-token@git.example.com/group/repo');
    expect(paths).not.toContain('https://gl-token@git.example.com/group/repo');
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
      'http://oauth2:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
    );
    expect(result.fallbackPaths).toEqual([
      'http://admin:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'https://oauth2:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'https://admin:git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      'https://git-token@git.exexm.com/epaas-product/exe-cloud-business-center',
    ]);
  });
});
