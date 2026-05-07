import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { callApi } from './api';
import { emitOutput, resolveOutputMode } from './output';
import {
    CliProfile,
    CredentialStore,
    persistIssuedCredential,
    readProfile,
    saveProfile,
} from './state-store';
import { isExpired } from './token';

const OPENVIKING_SERVER_NAME = 'openviking';
const OPENVIKING_SECTION_START = '<!-- openviking:start -->';
const OPENVIKING_SECTION_END = '<!-- openviking:end -->';
const DEFAULT_CLIENT_KEY_NAME = 'ova-mcp';
const DEFAULT_CREDENTIAL_KIND = 'api-key';
const DEFAULT_OUTPUT_PATH = '.openviking/capabilities.json';
const SUPPORTED_EDITORS = ['claude', 'cursor', 'codex'] as const;
const LOCAL_SKILL_TARGETS = [
    '.claude/skills/openviking-admin/SKILL.md',
    '.agents/skills/openviking-admin/SKILL.md',
];

type SupportedEditor = (typeof SUPPORTED_EDITORS)[number];
type CredentialKind = 'api-key' | 'session-key';
type FileMutation = 'created' | 'updated' | 'appended';

interface ResolvedCredential {
    kind: CredentialKind;
    value: string;
    source: 'option' | 'profile' | 'issued';
}

interface EditorWriteResult {
    editor: SupportedEditor;
    configPath: string;
    skillPath: string;
}

export interface SetupSummary {
    profile: string;
    serverUrl: string;
    credentialType: CredentialKind;
    credentialSource: ResolvedCredential['source'];
    mcpUrl: string;
    editors: EditorWriteResult[];
}

export interface InitSummary {
    repoPath: string;
    repoName: string;
    capabilityCount: number;
    snapshotPath: string | null;
    updatedFiles: string[];
    warnings: string[];
}

export interface BootstrapSummary {
    setup: SetupSummary | null;
    init: InitSummary | null;
}

interface CapabilitySnapshotItem {
    id: string;
    description?: string;
    minimumRole?: string;
    http?: {
        method?: string;
        path?: string;
    };
    cli?: string;
    mcpTool: string;
}

interface CapabilitySnapshot {
    generatedAt: string;
    profile: string;
    serverUrl: string;
    capabilities: CapabilitySnapshotItem[];
}

export function emitSetupSummary(modeOptions: Record<string, string | boolean>, summary: SetupSummary) {
    const output = resolveOutputMode(modeOptions);
    emitOutput(
        output,
        summary,
        () =>
            [
                `profile: ${summary.profile}`,
                `serverUrl: ${summary.serverUrl}`,
                `credentialType: ${summary.credentialType}`,
                `credentialSource: ${summary.credentialSource}`,
                `mcpUrl: ${summary.mcpUrl}`,
                'configuredEditors:',
                ...summary.editors.map(
                    (item) => `- ${item.editor}: ${item.configPath} | skill=${item.skillPath}`,
                ),
            ].join('\n'),
        summary.editors.map((item) => ({
            profile: summary.profile,
            serverUrl: summary.serverUrl,
            credentialType: summary.credentialType,
            credentialSource: summary.credentialSource,
            mcpUrl: summary.mcpUrl,
            ...item,
        })),
    );
}

export function emitInitSummary(modeOptions: Record<string, string | boolean>, summary: InitSummary) {
    const output = resolveOutputMode(modeOptions);
    emitOutput(
        output,
        summary,
        () =>
            [
                `repoPath: ${summary.repoPath}`,
                `repoName: ${summary.repoName}`,
                `capabilityCount: ${summary.capabilityCount}`,
                `snapshotPath: ${summary.snapshotPath ?? '-'}`,
                'updatedFiles:',
                ...summary.updatedFiles.map((item) => `- ${item}`),
                ...(summary.warnings.length > 0
                    ? ['warnings:', ...summary.warnings.map((item) => `- ${item}`)]
                    : []),
            ].join('\n'),
        summary.updatedFiles.map((item) => ({
            repoPath: summary.repoPath,
            repoName: summary.repoName,
            capabilityCount: summary.capabilityCount,
            snapshotPath: summary.snapshotPath,
            file: item,
        })),
    );
}

export function emitBootstrapSummary(modeOptions: Record<string, string | boolean>, summary: BootstrapSummary) {
    const output = resolveOutputMode(modeOptions);
    emitOutput(
        output,
        summary,
        () => {
            const lines = ['OpenViking bootstrap 完成'];
            if (summary.setup) {
                lines.push(`setup: ${summary.setup.serverUrl} via ${summary.setup.credentialType}`);
            }
            if (summary.init) {
                lines.push(`init: ${summary.init.repoPath} (${summary.init.capabilityCount} capabilities)`);
            }
            return lines.join('\n');
        },
        [
            {
                setup: summary.setup,
                init: summary.init,
            },
        ],
    );
}

export async function runSetup(
    options: Record<string, string | boolean>,
    store: CredentialStore,
): Promise<SetupSummary> {
    const profileContext = persistSetupOptions(options, store);
    const credential = await resolveMcpCredential(options, store, profileContext.profile);
    const mcpUrl = buildMcpUrl(profileContext.profile.serverUrl, credential);
    const editors = resolveEditors(options).map((editor) => configureEditor(editor, mcpUrl));

    return {
        profile: profileContext.profileName,
        serverUrl: profileContext.profile.serverUrl,
        credentialType: credential.kind,
        credentialSource: credential.source,
        mcpUrl: redactMcpUrl(mcpUrl),
        editors,
    };
}

export async function runInit(
    options: Record<string, string | boolean>,
    store: CredentialStore,
): Promise<InitSummary> {
    const repoPath = resolve(String(options.path ?? process.cwd()));
    const repoName = basename(repoPath);
    const warnings: string[] = [];
    const updatedFiles: string[] = [];
    const profileContext = readProfile(store, options);
    const skillFiles = writeRepoSkills(repoPath);
    updatedFiles.push(...skillFiles);

    let capabilitySnapshot: CapabilitySnapshot | null = null;
    let snapshotPath: string | null = null;

    try {
        capabilitySnapshot = await fetchCapabilitySnapshot(options, store);
        snapshotPath = writeCapabilitySnapshot(repoPath, capabilitySnapshot);
        updatedFiles.push(snapshotPath);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'capability snapshot 生成失败');
    }

    const promptBlock = renderPromptBlock({
        repoName,
        profileName: profileContext.profileName,
        serverUrl: profileContext.profile.serverUrl,
        snapshotPath,
        snapshot: capabilitySnapshot,
    });

    updatedFiles.push(`${join(repoPath, 'AGENTS.md')} (${upsertMarkedSection(join(repoPath, 'AGENTS.md'), promptBlock)})`);
    updatedFiles.push(`${join(repoPath, 'CLAUDE.md')} (${upsertMarkedSection(join(repoPath, 'CLAUDE.md'), promptBlock)})`);

    return {
        repoPath,
        repoName,
        capabilityCount: capabilitySnapshot?.capabilities.length ?? 0,
        snapshotPath,
        updatedFiles,
        warnings,
    };
}

export function shouldRunSetup(options: Record<string, string | boolean>) {
    return options['skip-setup'] !== true && options['skip-setup'] !== 'true';
}

export function shouldRunInit(options: Record<string, string | boolean>) {
    return options['skip-init'] !== true && options['skip-init'] !== 'true';
}

export function profileHasBootstrapCredential(profile: CliProfile) {
    return Boolean(profile.apiKey || profile.sessionKey || profile.accessToken || profile.refreshToken);
}

function persistSetupOptions(options: Record<string, string | boolean>, store: CredentialStore) {
    const profileContext = readProfile(store, options);
    const nextProfile: CliProfile = { ...profileContext.profile };
    let changed = false;

    if (typeof options.server === 'string' && options.server.trim()) {
        nextProfile.serverUrl = options.server.trim();
        changed = true;
    }
    if (typeof options['api-key'] === 'string' && options['api-key'].trim()) {
        nextProfile.apiKey = options['api-key'].trim();
        changed = true;
    }
    if (typeof options['session-key'] === 'string' && options['session-key'].trim()) {
        nextProfile.sessionKey = options['session-key'].trim();
        changed = true;
    }
    if (!changed) {
        return profileContext;
    }

    saveProfile(store, profileContext.profileName, nextProfile, profileContext.stateFile);
    return readProfile(store, options);
}

async function resolveMcpCredential(
    options: Record<string, string | boolean>,
    store: CredentialStore,
    profile: CliProfile,
): Promise<ResolvedCredential> {
    const preferredKind = resolveCredentialKind(options);

    if (typeof options['api-key'] === 'string' && options['api-key'].trim()) {
        return { kind: 'api-key', value: options['api-key'].trim(), source: 'option' };
    }
    if (typeof options['session-key'] === 'string' && options['session-key'].trim()) {
        return { kind: 'session-key', value: options['session-key'].trim(), source: 'option' };
    }
    if (preferredKind === 'api-key' && profile.apiKey) {
        return { kind: 'api-key', value: profile.apiKey, source: 'profile' };
    }
    if (preferredKind === 'session-key' && profile.sessionKey && !isExpired(profile.sessionKeyExpiresAt, 0)) {
        return { kind: 'session-key', value: profile.sessionKey, source: 'profile' };
    }
    if (profileHasJwt(profile)) {
        return preferredKind === 'api-key'
            ? issueApiKey(options, store)
            : issueSessionKey(options, store);
    }
    if (profile.apiKey) {
        return { kind: 'api-key', value: profile.apiKey, source: 'profile' };
    }
    if (profile.sessionKey && !isExpired(profile.sessionKeyExpiresAt, 0)) {
        return { kind: 'session-key', value: profile.sessionKey, source: 'profile' };
    }

    throw new Error('setup 需要 API key、session key，或已登录的 ova profile。可先运行 ova configure / ova auth login。');
}

function resolveCredentialKind(options: Record<string, string | boolean>): CredentialKind {
    if (typeof options.credential !== 'string' || options.credential.trim() === '') {
        return DEFAULT_CREDENTIAL_KIND as CredentialKind;
    }
    if (options.credential === 'api-key' || options.credential === 'session-key') {
        return options.credential;
    }
    throw new Error('--credential 仅支持 api-key 或 session-key');
}

function profileHasJwt(profile: CliProfile) {
    return Boolean(profile.accessToken || profile.refreshToken);
}

async function issueApiKey(
    options: Record<string, string | boolean>,
    store: CredentialStore,
): Promise<ResolvedCredential> {
    const profileContext = readProfile(store, options);
    const response = await callApi(
        '/api/v1/auth/client-credentials',
        {
            method: 'POST',
            body: JSON.stringify({
                name: typeof options.name === 'string' && options.name.trim() ? options.name.trim() : DEFAULT_CLIENT_KEY_NAME,
            }),
        },
        options,
        store,
    );
    const data = response.data as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? '');
    if (!apiKey) {
        throw new Error('client-credentials 未返回可用 apiKey');
    }

    persistIssuedCredential(store, profileContext.profileName, profileContext.profile, profileContext.stateFile, {
        type: 'api_key',
        value: apiKey,
    });
    return { kind: 'api-key', value: apiKey, source: 'issued' };
}

async function issueSessionKey(
    options: Record<string, string | boolean>,
    store: CredentialStore,
): Promise<ResolvedCredential> {
    const profileContext = readProfile(store, options);
    const response = await callApi('/api/v1/auth/session/exchange', { method: 'POST' }, options, store);
    const data = response.data as Record<string, unknown>;
    const sessionKey = String(data.sessionKey ?? '');
    const expiresInSeconds = Number(data.expiresInSeconds ?? 0);
    const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : undefined;
    if (!sessionKey) {
        throw new Error('session-exchange 未返回可用 sessionKey');
    }

    persistIssuedCredential(store, profileContext.profileName, profileContext.profile, profileContext.stateFile, {
        type: 'session_key',
        value: sessionKey,
        expiresAt,
    });
    return { kind: 'session-key', value: sessionKey, source: 'issued' };
}

function buildMcpUrl(serverUrl: string, credential: ResolvedCredential) {
    const url = new URL('/api/v1/mcp/sse', serverUrl);
    url.searchParams.set(credential.kind === 'api-key' ? 'key' : 'sessionKey', credential.value);
    return url.toString();
}

function redactMcpUrl(url: string) {
    const parsed = new URL(url);
    for (const [key] of parsed.searchParams.entries()) {
        parsed.searchParams.set(key, '***');
    }
    return parsed.toString();
}

function resolveEditors(options: Record<string, string | boolean>): SupportedEditor[] {
    if (typeof options.editor !== 'string' || options.editor.trim() === '') {
        return [...SUPPORTED_EDITORS];
    }
    const values = options.editor
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean) as SupportedEditor[];
    const invalid = values.find((item) => !SUPPORTED_EDITORS.includes(item));
    if (invalid) {
        throw new Error(`不支持的 editor: ${invalid}`);
    }
    return values;
}

function configureEditor(editor: SupportedEditor, mcpUrl: string): EditorWriteResult {
    if (editor === 'claude') {
        const configPath = join(homedir(), '.claude.json');
        upsertJsonMcpConfig(configPath, buildMcpEntry(mcpUrl));
        const skillPath = join(homedir(), '.claude', 'skills', 'openviking-admin', 'SKILL.md');
        writeSkillAsset(skillPath);
        return { editor, configPath, skillPath };
    }
    if (editor === 'cursor') {
        const configPath = join(homedir(), '.cursor', 'mcp.json');
        upsertJsonMcpConfig(configPath, buildMcpEntry(mcpUrl));
        const skillPath = join(homedir(), '.cursor', 'skills', 'openviking-admin', 'SKILL.md');
        writeSkillAsset(skillPath);
        return { editor, configPath, skillPath };
    }

    const configPath = join(homedir(), '.codex', 'config.toml');
    upsertTomlMcpConfig(configPath, mcpUrl);
    const skillPath = join(homedir(), '.agents', 'skills', 'openviking-admin', 'SKILL.md');
    writeSkillAsset(skillPath);
    return { editor, configPath, skillPath };
}

function buildMcpEntry(mcpUrl: string) {
    return {
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-remote', '--url', mcpUrl],
    };
}

function upsertJsonMcpConfig(filePath: string, mcpEntry: { command: string; args: string[] }) {
    const current = readJsonObject(filePath);
    const mcpServers = getRecord(current, 'mcpServers');
    mcpServers[OPENVIKING_SERVER_NAME] = mcpEntry;
    current.mcpServers = mcpServers;
    writeJson(filePath, current);
}

function upsertTomlMcpConfig(filePath: string, mcpUrl: string) {
    const section = [
        '[mcp_servers.openviking]',
        'command = "npx"',
        `args = ["-y", "@anthropic-ai/mcp-remote", "--url", ${JSON.stringify(mcpUrl)}]`,
    ].join('\n');
    const raw = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
    const nextContent = /\[mcp_servers\.openviking\][\s\S]*?(?=\n\[|$)/m.test(raw)
        ? raw.replace(/\[mcp_servers\.openviking\][\s\S]*?(?=\n\[|$)/m, section)
        : raw.trim().length > 0
          ? `${raw.trimEnd()}\n\n${section}\n`
          : `${section}\n`;
    ensureDir(dirname(filePath));
    writeFileSync(filePath, nextContent, 'utf8');
}

function readJsonObject(filePath: string): Record<string, unknown> {
    if (!existsSync(filePath)) {
        return {};
    }
    const raw = readFileSync(filePath, 'utf8').trim();
    if (!raw) {
        return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${filePath} 不是有效 JSON object`);
    }
    return parsed as Record<string, unknown>;
}

function writeJson(filePath: string, payload: Record<string, unknown>) {
    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function getRecord(payload: Record<string, unknown>, key: string) {
    const candidate = payload[key];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return {} as Record<string, unknown>;
    }
    return { ...(candidate as Record<string, unknown>) };
}

function writeSkillAsset(filePath: string) {
    ensureDir(dirname(filePath));
    writeFileSync(filePath, readSkillAsset(), 'utf8');
}

function readSkillAsset() {
    const assetPath = join(__dirname, '..', 'assets', 'skills', 'openviking-admin', 'SKILL.md');
    if (existsSync(assetPath)) {
        return readFileSync(assetPath, 'utf8');
    }

    return [
        '---',
        'name: openviking-admin',
        'description: 使用 OpenViking Admin 的标准 Skill。',
        '---',
        '',
        '# OpenViking Admin',
        '',
        '优先顺序：MCP -> OVA CLI -> 配置指引',
    ].join('\n');
}

function writeRepoSkills(repoPath: string) {
    return LOCAL_SKILL_TARGETS.map((relativePath) => {
        const filePath = join(repoPath, relativePath);
        writeSkillAsset(filePath);
        return filePath;
    });
}

async function fetchCapabilitySnapshot(
    options: Record<string, string | boolean>,
    store: CredentialStore,
): Promise<CapabilitySnapshot> {
    const profileContext = readProfile(store, options);
    const response = await callApi('/api/v1/capabilities', {}, options, store);
    const items = (response.data ?? []) as Array<Record<string, unknown>>;

    return {
        generatedAt: new Date().toISOString(),
        profile: profileContext.profileName,
        serverUrl: profileContext.profile.serverUrl,
        capabilities: items.map((item) => ({
            id: String(item.id ?? ''),
            description: item.description ? String(item.description) : undefined,
            minimumRole: item.minimumRole ? String(item.minimumRole) : undefined,
            http: item.http && typeof item.http === 'object'
                ? {
                      method: String((item.http as Record<string, unknown>).method ?? ''),
                      path: String((item.http as Record<string, unknown>).path ?? ''),
                  }
                : undefined,
            cli: resolveCliText(item.cli),
            mcpTool: String(item.id ?? ''),
        })),
    };
}

function resolveCliText(candidate: unknown) {
    if (!candidate) {
        return undefined;
    }
    if (typeof candidate === 'string') {
        return candidate;
    }
    if (typeof candidate === 'object' && candidate && 'command' in (candidate as Record<string, unknown>)) {
        return String((candidate as Record<string, unknown>).command ?? '');
    }
    return String(candidate);
}

function writeCapabilitySnapshot(repoPath: string, snapshot: CapabilitySnapshot) {
    const filePath = join(repoPath, DEFAULT_OUTPUT_PATH);
    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return filePath;
}

function renderPromptBlock(input: {
    repoName: string;
    profileName: string;
    serverUrl: string;
    snapshotPath: string | null;
    snapshot: CapabilitySnapshot | null;
}) {
    const capabilityLines = input.snapshot
        ? input.snapshot.capabilities.map((item) => {
              const commandSuffix = item.cli ? ` -> ${item.cli}` : '';
              return `- \`${item.id}\`${commandSuffix}`;
          })
        : ['- 运行 `ova capabilities list --output json` 获取最新 capability catalog。'];

    return [
        OPENVIKING_SECTION_START,
        '# OpenViking — Workspace Access',
        '',
        `当前仓库已配置 OpenViking 初始化上下文，仓库名：${input.repoName}。优先使用 OpenViking MCP；仅在 MCP 不可用时回退到 OVA CLI。`,
        '',
        '## 首选流程',
        '',
        '1. 先检查当前运行环境是否已暴露 OpenViking MCP tools。',
        '2. 如果 MCP 可用，直接使用对应 tool，并在结果中保留 traceId。',
        '3. 如果 MCP 不可用，先执行 `ova doctor --output json`。',
        '4. 再执行 `ova capabilities list --output json`，以 capability catalog 为单一事实源。',
        '5. 处理知识与导入任务前，先读取 `.claude/skills/openviking-admin/SKILL.md`。',
        '',
        '## 必须遵守',
        '',
        '- 不要编造 capability id、CLI 命令或 MCP tool 名称。',
        '- 不要绕过 capability 平台直接访问数据库或私有后端路径。',
        '- 不要在对话中输出完整 API key、session key 或 JWT。',
        '- 所有能力调用结果都应保留 traceId。',
        '',
        '## 本地上下文',
        '',
        `- profile: ${input.profileName}`,
        `- serverUrl: ${input.serverUrl}`,
        `- skill: .claude/skills/openviking-admin/SKILL.md`,
        `- capabilitySnapshot: ${input.snapshotPath ?? '未生成；请运行 ova init --path <repo>'}`,
        '',
        '## 当前 capability 快照',
        '',
        ...capabilityLines,
        OPENVIKING_SECTION_END,
    ].join('\n');
}

function upsertMarkedSection(filePath: string, content: string): FileMutation {
    ensureDir(dirname(filePath));
    if (!existsSync(filePath)) {
        writeFileSync(filePath, `${content.trim()}\n`, 'utf8');
        return 'created';
    }

    const current = readFileSync(filePath, 'utf8');
    const startIndex = current.indexOf(OPENVIKING_SECTION_START);
    const endIndex = current.indexOf(OPENVIKING_SECTION_END);
    if (startIndex >= 0 && endIndex > startIndex) {
        const before = current.slice(0, startIndex).trimEnd();
        const after = current.slice(endIndex + OPENVIKING_SECTION_END.length).trimStart();
        const next = [before, content.trim(), after].filter(Boolean).join('\n\n');
        writeFileSync(filePath, `${next.trim()}\n`, 'utf8');
        return 'updated';
    }

    const separator = current.trim().length > 0 ? '\n\n' : '';
    writeFileSync(filePath, `${current.trimEnd()}${separator}${content.trim()}\n`, 'utf8');
    return 'appended';
}

function ensureDir(dirPath: string) {
    mkdirSync(dirPath, { recursive: true });
}