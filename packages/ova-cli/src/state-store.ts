import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface CliProfile {
    serverUrl: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
    capabilityAccessToken?: string;
    capabilityAccessTokenExpiresAt?: string;
    sessionKey?: string;
    sessionKeyExpiresAt?: string;
    apiKey?: string;
}

export interface CliStateFile {
    version: 2;
    currentProfile: string;
    profiles: Record<string, CliProfile>;
}

interface LegacyCliState {
    serverUrl: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
}

export interface CredentialStore {
    getStatePath(): string;
    readStateFile(): CliStateFile;
    saveStateFile(state: CliStateFile): void;
}

export class FileCredentialStore implements CredentialStore {
    getStatePath() {
        return join(homedir(), '.openviking', 'ova', 'auth.json');
    }

    readStateFile(): CliStateFile {
        const filePath = this.getStatePath();
        if (!existsSync(filePath)) {
            return migrateLegacyState(undefined);
        }

        const raw = JSON.parse(readFileSync(filePath, 'utf8')) as CliStateFile | LegacyCliState;
        if (isStateFile(raw)) {
            return raw;
        }

        return migrateLegacyState(raw);
    }

    saveStateFile(state: CliStateFile) {
        mkdirSync(join(homedir(), '.openviking', 'ova'), { recursive: true });
        writeFileSync(this.getStatePath(), JSON.stringify(state, null, 2), 'utf8');
    }
}

export function getDefaultProfile(): CliProfile {
    return { serverUrl: 'http://localhost:6001' };
}

export function resolveProfileName(
    options: Record<string, string | boolean>,
    stateFile: CliStateFile,
) {
    return String(options.profile ?? stateFile.currentProfile ?? 'default');
}

export function readProfile(
    store: CredentialStore,
    options: Record<string, string | boolean>,
) {
    const stateFile = store.readStateFile();
    const profileName = resolveProfileName(options, stateFile);
    const profile = stateFile.profiles[profileName] ?? getDefaultProfile();

    return {
        stateFile,
        profileName,
        profile,
    };
}

export function saveProfile(
    store: CredentialStore,
    profileName: string,
    profile: CliProfile,
    stateFile: CliStateFile,
) {
    const nextState: CliStateFile = {
        version: 2,
        currentProfile: stateFile.currentProfile || profileName,
        profiles: {
            ...stateFile.profiles,
            [profileName]: profile,
        },
    };

    if (!nextState.currentProfile) {
        nextState.currentProfile = profileName;
    }

    store.saveStateFile(nextState);
    return nextState;
}

export function removeProfileCredentials(
    store: CredentialStore,
    profileName: string,
    stateFile: CliStateFile,
) {
    const current = stateFile.profiles[profileName] ?? getDefaultProfile();
    const nextProfile: CliProfile = {
        serverUrl: current.serverUrl,
    };

    return saveProfile(store, profileName, nextProfile, stateFile);
}

export function persistIssuedCredential(
    store: CredentialStore,
    profileName: string,
    profile: CliProfile,
    stateFile: CliStateFile,
    credential: { type: 'capability_access_token' | 'session_key' | 'api_key'; value: string; expiresAt?: string },
) {
    const nextProfile: CliProfile = {
        ...profile,
    };

    if (credential.type === 'capability_access_token') {
        nextProfile.capabilityAccessToken = credential.value;
        nextProfile.capabilityAccessTokenExpiresAt = credential.expiresAt;
    }

    if (credential.type === 'session_key') {
        nextProfile.sessionKey = credential.value;
        nextProfile.sessionKeyExpiresAt = credential.expiresAt;
    }

    if (credential.type === 'api_key') {
        nextProfile.apiKey = credential.value;
    }

    saveProfile(store, profileName, nextProfile, stateFile);
}

function isStateFile(payload: unknown): payload is CliStateFile {
    return Boolean(
        payload &&
            typeof payload === 'object' &&
            (payload as CliStateFile).version === 2 &&
            typeof (payload as CliStateFile).currentProfile === 'string' &&
            typeof (payload as CliStateFile).profiles === 'object',
    );
}

function migrateLegacyState(payload: LegacyCliState | undefined): CliStateFile {
    return {
        version: 2,
        currentProfile: 'default',
        profiles: {
            default: payload?.serverUrl ? payload : getDefaultProfile(),
        },
    };
}
