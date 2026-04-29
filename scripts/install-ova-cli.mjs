#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const PACKAGE_NAME = '@openviking-admin/ova-cli';
const PACKAGE_SPEC = `${PACKAGE_NAME}@latest`;
const SKIP_CONFIG_FLAG = '--skip-config';
const YES_FLAG = '--yes';

const args = new Set(process.argv.slice(2));

run('npm', ['install', '-g', PACKAGE_SPEC]);

if (args.has(SKIP_CONFIG_FLAG)) {
    process.exit(0);
}

const shouldConfigure = args.has(YES_FLAG) || (await askConfigure());
if (shouldConfigure) {
    run('ova', ['configure'], { inherit: true });
}

async function askConfigure() {
    if (!input.isTTY) {
        return false;
    }

    const rl = createInterface({ input, output });
    try {
        const answer = await rl.question('是否现在进入 ova 配置？(Y/n): ');
        return answer.trim().toLowerCase() !== 'n';
    } finally {
        rl.close();
    }
}

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        stdio: options.inherit ? 'inherit' : 'pipe',
        shell: process.platform === 'win32',
        encoding: 'utf8',
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        const stderr = result.stderr ? `\n${result.stderr}` : '';
        throw new Error(`${command} ${commandArgs.join(' ')} 执行失败${stderr}`);
    }
}
