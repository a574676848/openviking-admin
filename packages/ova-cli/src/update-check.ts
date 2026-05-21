import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { printText } from './output';

const OVA_CLI_CONFIG_DIR = '.ova_cli';
const UPDATE_CHECK_FILE = 'update-check.json';
const NPM_REGISTRY_BASE_URL = 'https://registry.npmjs.org';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 1500;
const DISABLE_UPDATE_CHECK_VALUE = '0';
const TEST_ENV_NAME = 'test';

export interface PackageMetadata {
    name: string;
    version: string;
}

interface UpdateCheckCache {
    checkedAt: string;
    latestVersion?: string;
}

interface LatestPackageMetadata {
    version?: unknown;
}

export async function notifyCliUpdateIfAvailable(
    packageMetadata: PackageMetadata,
    options: Record<string, string | boolean>,
) {
    if (!shouldCheckForUpdates(options)) {
        return;
    }

    const cachePath = getUpdateCheckPath();
    const cache = readUpdateCheckCache(cachePath);
    if (!isUpdateCheckDue(cache)) {
        return;
    }

    const latestVersion = await fetchLatestPackageVersion(packageMetadata.name);
    writeUpdateCheckCache(cachePath, {
        checkedAt: new Date().toISOString(),
        latestVersion,
    });

    if (!latestVersion || !isVersionGreater(latestVersion, packageMetadata.version)) {
        return;
    }

    printText([
        `发现新版本：${packageMetadata.name} ${latestVersion}，当前版本：${packageMetadata.version}`,
        `更新命令：npm update -g ${packageMetadata.name}`,
    ].join('\n'));
}

function shouldCheckForUpdates(options: Record<string, string | boolean>) {
    if (process.env.OVA_CLI_UPDATE_CHECK === DISABLE_UPDATE_CHECK_VALUE) {
        return false;
    }
    if (process.env.NODE_ENV === TEST_ENV_NAME && process.env.OVA_CLI_UPDATE_CHECK !== '1') {
        return false;
    }
    return !options.output || options.output === 'text';
}

function getUpdateCheckPath() {
    return join(homedir(), OVA_CLI_CONFIG_DIR, UPDATE_CHECK_FILE);
}

function readUpdateCheckCache(filePath: string): UpdateCheckCache | undefined {
    if (!existsSync(filePath)) {
        return undefined;
    }

    try {
        const payload = JSON.parse(readFileSync(filePath, 'utf8')) as UpdateCheckCache;
        if (typeof payload.checkedAt !== 'string') {
            return undefined;
        }
        return payload;
    } catch {
        return undefined;
    }
}

function writeUpdateCheckCache(filePath: string, cache: UpdateCheckCache) {
    mkdirSync(join(homedir(), OVA_CLI_CONFIG_DIR), { recursive: true });
    writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8');
}

function isUpdateCheckDue(cache: UpdateCheckCache | undefined) {
    if (!cache) {
        return true;
    }

    const checkedAt = Date.parse(cache.checkedAt);
    if (Number.isNaN(checkedAt)) {
        return true;
    }

    return Date.now() - checkedAt >= UPDATE_CHECK_INTERVAL_MS;
}

async function fetchLatestPackageVersion(packageName: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

    try {
        const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@');
        const response = await fetch(`${NPM_REGISTRY_BASE_URL}/${encodedName}/latest`, {
            signal: controller.signal,
        });
        if (!response.ok) {
            return undefined;
        }

        const payload = await response.json() as LatestPackageMetadata;
        return typeof payload.version === 'string' ? payload.version : undefined;
    } catch {
        return undefined;
    } finally {
        clearTimeout(timeout);
    }
}

function isVersionGreater(candidate: string, current: string) {
    const candidateParts = parseVersion(candidate);
    const currentParts = parseVersion(current);

    for (let index = 0; index < candidateParts.length; index += 1) {
        if (candidateParts[index] > currentParts[index]) {
            return true;
        }
        if (candidateParts[index] < currentParts[index]) {
            return false;
        }
    }

    return false;
}

function parseVersion(version: string): [number, number, number] {
    const [major = '0', minor = '0', patch = '0'] = version.split('-', 1)[0].split('.');
    return [
        Number.parseInt(major, 10) || 0,
        Number.parseInt(minor, 10) || 0,
        Number.parseInt(patch, 10) || 0,
    ];
}
