/**
 * DevFlow Pro - Update System Models
 * TypeScript interfaces for the auto-update system
 */

export interface UpdateInfo {
    version: string;
    downloadUrl: string;
    releaseDate: string;
    changelog: string;
    minVSCodeVersion: string;
    breaking: boolean;
    sha256?: string;
    size?: number;
}

export interface UpdateManifest extends UpdateInfo {
    // Alias for server manifest format
}

export interface UpdateChannel {
    stable: UpdateManifest;
    beta?: UpdateManifest;
}

export interface UpdateConfig {
    autoCheck: boolean;
    autoDownload: boolean;
    autoInstall: boolean;
    channel: 'stable' | 'beta';
    checkInterval: number; // in hours
}

export interface BackupInfo {
    version: string;
    date: string;
    path?: string;
}
