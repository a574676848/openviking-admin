import type { CredentialStore } from '../state-store';
import { getDefaultProfile, readProfile, saveProfile } from '../state-store';
import { emitOutput, resolveOutputMode } from '../output';

export async function handleConfig(
    command: string,
    options: Record<string, string | boolean>,
    store: CredentialStore,
) {
    const output = resolveOutputMode(options);
    const { stateFile, profileName, profile } = readProfile(store, options);

    if (command === 'show') {
        const payload = {
            currentProfile: stateFile.currentProfile,
            profile: profileName,
            serverUrl: profile.serverUrl,
            statePath: store.getStatePath(),
            profiles: Object.keys(stateFile.profiles),
        };

        emitOutput(
            output,
            payload,
            () =>
                [
                    `currentProfile: ${payload.currentProfile}`,
                    `profile: ${payload.profile}`,
                    `serverUrl: ${payload.serverUrl}`,
                    `statePath: ${payload.statePath}`,
                    `profiles: ${payload.profiles.join(', ')}`,
                ].join('\n'),
            [payload],
        );
        return;
    }

    if (command === 'set') {
        const nextProfile = {
            ...profile,
            serverUrl: String(options.server ?? profile.serverUrl),
        };
        saveProfile(store, profileName, nextProfile, stateFile);
        const payload = {
            profile: profileName,
            serverUrl: nextProfile.serverUrl,
        };

        emitOutput(output, payload, () => `已更新 profile=${profileName} serverUrl=${nextProfile.serverUrl}`, [payload]);
        return;
    }

    if (command === 'use') {
        const nextProfileName = String(options.profile ?? '');
        if (!nextProfileName) {
            throw new Error('config use 需要 --profile');
        }

        const nextState = {
            version: 2 as const,
            currentProfile: nextProfileName,
            profiles: {
                ...stateFile.profiles,
                [nextProfileName]: stateFile.profiles[nextProfileName] ?? getDefaultProfile(),
            },
        };
        store.saveStateFile(nextState);

        const payload = {
            currentProfile: nextProfileName,
            statePath: store.getStatePath(),
        };
        emitOutput(output, payload, () => `已切换 currentProfile=${nextProfileName}`, [payload]);
        return;
    }

    throw new Error(`未知 config 子命令: ${command}`);
}
