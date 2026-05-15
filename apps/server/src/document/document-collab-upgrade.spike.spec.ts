import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DOCUMENT_COLLAB_PATH } from './constants';

const execFileAsync = promisify(execFile);
const SPIKE_RUNNER_FILE = 'document-collab-upgrade.spike-runner.mjs';
const SPIKE_SUCCESS_MARKER = 'P3-0_OK';
const SPIKE_TIMEOUT_MS = 15_000;
const SPIKE_TEST_TIMEOUT_PADDING_MS = 5_000;
const SPIKE_TEST_TIMEOUT_MS = SPIKE_TIMEOUT_MS + SPIKE_TEST_TIMEOUT_PADDING_MS;

describe('P3-0 Hocuspocus 与 Nest HTTP server upgrade 集成验证', () => {
  it(
    '应该在独立 Node ESM 进程中验证 /collab WebSocket 握手',
    async () => {
      const runnerPath = join(__dirname, SPIKE_RUNNER_FILE);
      const { stdout } = await execFileAsync(
        process.execPath,
        [runnerPath, DOCUMENT_COLLAB_PATH],
        {
          timeout: SPIKE_TIMEOUT_MS,
        },
      );

      expect(stdout).toContain(SPIKE_SUCCESS_MARKER);
    },
    SPIKE_TEST_TIMEOUT_MS,
  );
});
