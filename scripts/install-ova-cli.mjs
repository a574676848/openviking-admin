#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@openviking-admin/ova-cli';
const PACKAGE_SPEC = `${PACKAGE_NAME}@latest`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);

run('npm', ['install', '-g', PACKAGE_SPEC], { inherit: true });
run('ova', buildBootstrapArgs(rawArgs), { inherit: true });

function buildBootstrapArgs(args) {
    const nextArgs = ['bootstrap'];
    if (!args.includes('--path')) {
        nextArgs.push('--path', REPO_ROOT);
    }
    nextArgs.push(...args);
    return nextArgs;
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
