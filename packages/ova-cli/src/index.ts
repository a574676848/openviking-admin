#!/usr/bin/env node

import { FileCredentialStore } from './state-store';
import { formatRuntimeError } from './api';
import { parseOptions } from './parse';
import { printText } from './output';
import { handleAuth } from './commands/auth';
import { handleCapabilities } from './commands/capabilities';
import { handleKnowledge } from './commands/knowledge';
import { handleResources } from './commands/resources';
import { handleKnowledgeBases } from './commands/knowledge-bases';
import { handleKnowledgeTree } from './commands/knowledge-tree';
import { handleDocuments } from './commands/documents';
import { handleConfig } from './commands/config';
import { handleDoctor } from './commands/doctor';
import { handleConfigure } from './commands/configure';
import { handleSetup } from './commands/setup';
import { handleInit } from './commands/init';
import { handleBootstrap } from './commands/bootstrap';

const credentialStore = new FileCredentialStore();

function printUsage() {
    printText(`OVA CLI

用法:
  ova auth login --server http://localhost:6001 --username admin --password admin123 --tenant-code acme [--profile dev]
  ova auth sso --ticket sso-ticket [--profile dev]
  ova auth whoami [--profile dev] [--output json|jsonl]
  ova auth status [--profile dev] [--output json|jsonl]
  ova auth credential-options [--profile dev] [--output json|jsonl]
  ova auth token-exchange [--profile dev] [--save] [--output json|jsonl]
  ova auth session-exchange [--profile dev] [--save] [--output json|jsonl]
  ova auth client-credentials [--name cli-client] [--profile dev] [--save] [--output json|jsonl]
  ova auth logout [--profile dev] [--output json|jsonl]
  ova configure [--server http://localhost:6001] [--api-key ov-sk-...] [--oauth-url https://...] [--open-browser] [--profile dev]
  ova capabilities list [--profile dev] [--output json|jsonl]
  ova capabilities inspect --id knowledge.search [--profile dev] [--output json|jsonl]
  ova knowledge search --query "多租户隔离" [--limit 5] [--profile dev] [--output json|jsonl]
  ova knowledge grep --pattern "tenant" [--uri viking://resources/tenants/acme/] [--profile dev] [--output json|jsonl]
  ova resources list [--uri viking://resources/tenants/acme/] [--profile dev] [--output json|jsonl]
  ova resources tree [--uri viking://resources/tenants/acme/] [--depth 2] [--profile dev] [--output json|jsonl]
  ova kb list [--profile dev] [--output json|jsonl]
  ova kb detail --id <kbId> [--profile dev] [--output json|jsonl]
  ova tree list --kb <kbId> [--profile dev] [--output json|jsonl]
  ova tree detail --id <nodeId> [--profile dev] [--output json|jsonl]
  ova documents import <url> --kb <kbId> [--type url|manifest|local] [--parent <nodeId>] [--profile dev] [--output json|jsonl]
  ova documents import status --task <taskId> [--watch] [--profile dev] [--output json|jsonl]
  ova documents import status --watch --task <taskId> [--profile dev] [--output json|jsonl]
  ova documents import list [--profile dev] [--output json|jsonl]
  ova documents import cancel --task <taskId> [--profile dev] [--output json|jsonl]
  ova documents import retry --task <taskId> [--profile dev] [--output json|jsonl]
  ova config show [--profile dev] [--output json|jsonl]
  ova config set --server http://localhost:6001 [--profile dev] [--output json|jsonl]
  ova config use --profile dev [--output json|jsonl]
    ova doctor [--profile dev] [--output json|jsonl]
    ova setup [--profile dev] [--server http://localhost:6001] [--credential api-key|session-key] [--editor claude,cursor,codex] [--output json|jsonl]
    ova init [--path <repoPath>] [--profile dev] [--output json|jsonl]
    ova bootstrap [--path <repoPath>] [--profile dev] [--editor claude,cursor,codex] [--skip-setup] [--skip-init] [--output json|jsonl]`);
}

export async function bootstrap(argv = process.argv.slice(2)) {
    const { group, command, options } = parseOptions(argv);

    if (!group) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    switch (group) {
        case 'auth':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleAuth(command, options, credentialStore);
            return;
        case 'capabilities':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleCapabilities(command, options, credentialStore);
            return;
        case 'knowledge':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleKnowledge(command, options, credentialStore);
            return;
        case 'resources':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleResources(command, options, credentialStore);
            return;
        case 'kb':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleKnowledgeBases(command, options, credentialStore);
            return;
        case 'tree':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleKnowledgeTree(command, options, credentialStore);
            return;
        case 'documents':
            await handleDocuments(command, options, credentialStore);
            return;
        case 'config':
            if (!command) {
                printUsage();
                process.exitCode = 1;
                return;
            }
            await handleConfig(command, options, credentialStore);
            return;
        case 'configure':
            await handleConfigure(options, credentialStore);
            return;
        case 'doctor':
            await handleDoctor(options, credentialStore);
            return;
        case 'setup':
            await handleSetup(options, credentialStore);
            return;
        case 'init':
            await handleInit(options, credentialStore);
            return;
        case 'bootstrap':
            await handleBootstrap(options, credentialStore);
            return;
        default:
            printUsage();
            process.exitCode = 1;
    }
}

if (require.main === module) {
    void bootstrap().catch((error) => {
        process.stderr.write(`${formatRuntimeError(error)}\n`);
        process.exitCode = 1;
    });
}
