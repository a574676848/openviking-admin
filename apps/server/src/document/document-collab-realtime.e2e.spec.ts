import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DOCUMENT_COLLAB_PATH } from './constants';

const execFileAsync = promisify(execFile);
const REALTIME_RUNNER_FILE = 'document-collab-realtime.e2e-runner.mjs';
const REALTIME_SUCCESS_MARKER = 'P4_S9_REALTIME_OK';
const REALTIME_DOCUMENT_NAME = 'document:tenant-a:node-realtime';
const REALTIME_RUNNER_TIMEOUT_MS = 30_000;
const REALTIME_TEST_TIMEOUT_PADDING_MS = 5_000;
const REALTIME_TEST_TIMEOUT_MS =
  REALTIME_RUNNER_TIMEOUT_MS + REALTIME_TEST_TIMEOUT_PADDING_MS;

describe('P4-S9 文档协作实时链路验证', () => {
  it('应该通过 Nest upgrade 挂载点让两个 HocuspocusProvider 客户端实时同步', async () => {
    const runnerPath = join(__dirname, REALTIME_RUNNER_FILE);
    const { stdout } = await execFileAsync(
      process.execPath,
      [runnerPath, DOCUMENT_COLLAB_PATH],
      {
        timeout: REALTIME_RUNNER_TIMEOUT_MS,
      },
    );

    expect(stdout).toContain(REALTIME_SUCCESS_MARKER);
    expect(stdout).toContain(`name=${REALTIME_DOCUMENT_NAME}`);
  }, REALTIME_TEST_TIMEOUT_MS);
});
