/**
 * DevFlow Pro - Update Manager
 * Core orchestrator for the auto-update system.
 * Handles version detection, user notifications, download, install, and rollback.
 */

import * as vscode from 'vscode';
import * as semver from 'semver';
import { VersionChecker } from './versionChecker';
import { DownloadManager } from './downloadManager';
import { InstallManager } from './installManager';
import { ChangelogParser } from './changelogParser';
import { UpdateInfo, BackupInfo } from './models';

const EXTENSION_ID = 'phoenixdepot.devflow-pro';
const BACKUP_STATE_KEY = 'lastVersionBackup';
const SNOOZE_STATE_KEY = 'updateSnoozedUntil';

export class UpdateManager {
    private static instance: UpdateManager | null = null;
    private currentVersion: string;
    private updateChannel: 'stable' | 'beta';
    private autoCheckEnabled: boolean;
    private checkIntervalHours: number;
    private checkIntervalHandle: ReturnType<typeof setInterval> | null = null;

    private constructor(private context: vscode.ExtensionContext) {
        const manifest = context.extension.packageJSON as { version: string };
        this.currentVersion = manifest.version;

        const config = vscode.workspace.getConfiguration('devflow');
        this.updateChannel = config.get<'stable' | 'beta'>('updates.channel', 'stable');
        this.autoCheckEnabled = config.get<boolean>('updates.autoCheck', true);
        this.checkIntervalHours = config.get<number>('updates.checkInterval', 6);
    }

    static getInstance(context: vscode.ExtensionContext): UpdateManager {
        if (!UpdateManager.instance) {
            UpdateManager.instance = new UpdateManager(context);
        }
        return UpdateManager.instance;
    }

    /**
     * Initialize the update system — call once in extension.ts activate()
     */
    async initialize(): Promise<void> {
        if (this.autoCheckEnabled) {
            // Startup silent check
            await this.checkForUpdates(false);
        }

        // Schedule recurring checks
        this.schedulePeriodicChecks();

        // React to settings changes
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('devflow.updates')) {
                    this.onConfigChanged();
                }
            })
        );
    }

    /**
     * Check for available updates.
     * @param showNoUpdateMessage Show a message if already on latest version
     */
    async checkForUpdates(showNoUpdateMessage = true): Promise<UpdateInfo | null> {
        // Respect user snooze
        const snoozedUntil = this.context.globalState.get<number>(SNOOZE_STATE_KEY);
        if (snoozedUntil && Date.now() < snoozedUntil && !showNoUpdateMessage) {
            return null;
        }

        try {
            const checker = new VersionChecker(this.updateChannel);
            const latest = await checker.getLatestVersion();

            if (!latest) {
                if (showNoUpdateMessage) {
                    vscode.window.showInformationMessage('DevFlow Pro: Could not reach the update server.');
                }
                return null;
            }

            // Check VS Code minimum version compatibility
            const vsCodeVersion = vscode.version;
            const minRequired = latest.minVSCodeVersion.replace(/^\^/, '');
            if (semver.lt(vsCodeVersion, minRequired)) {
                if (showNoUpdateMessage) {
                    vscode.window.showWarningMessage(
                        `DevFlow Pro v${latest.version} requires VS Code ${latest.minVSCodeVersion}. Please update VS Code first.`
                    );
                }
                return null;
            }

            if (semver.gt(latest.version, this.currentVersion)) {
                await this.showUpdateNotification(latest);
                return latest;
            } else {
                if (showNoUpdateMessage) {
                    vscode.window.showInformationMessage(
                        `DevFlow Pro is up to date (v${this.currentVersion}).`
                    );
                }
                return null;
            }
        } catch (error) {
            console.error('DevFlow Pro: update check failed', error);
            if (showNoUpdateMessage) {
                vscode.window.showErrorMessage(`DevFlow Pro: update check failed — ${error}`);
            }
            return null;
        }
    }

    /**
     * Show the update notification with action buttons
     */
    private async showUpdateNotification(updateInfo: UpdateInfo): Promise<void> {
        const parser = new ChangelogParser();
        const changelogSection = parser.extractVersion(updateInfo.changelog, updateInfo.version);
        const summary = parser.generateSummary(changelogSection);

        const message = updateInfo.breaking
            ? `🚨 DevFlow Pro v${updateInfo.version} available (Breaking Changes)`
            : `🎉 DevFlow Pro v${updateInfo.version} available${summary ? ' — ' + summary : ''}`;

        const choice = await vscode.window.showInformationMessage(
            message,
            { modal: false },
            'Update Now',
            'View Changelog',
            'Remind in 24h',
            'Skip'
        );

        switch (choice) {
            case 'Update Now':
                await this.performUpdate(updateInfo);
                break;

            case 'View Changelog':
                await this.showChangelog(changelogSection || updateInfo.changelog);
                break;

            case 'Remind in 24h':
                await this.context.globalState.update(
                    SNOOZE_STATE_KEY,
                    Date.now() + 24 * 60 * 60 * 1000
                );
                break;

            case 'Skip':
                // Do nothing — user will be reminded next check cycle
                break;
        }
    }

    /**
     * Download and install the update with a progress notification
     */
    private async performUpdate(updateInfo: UpdateInfo): Promise<void> {
        const downloader = new DownloadManager();
        const installer = new InstallManager();

        const success = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `DevFlow Pro: updating to v${updateInfo.version}`,
                cancellable: false
            },
            async (progress) => {
                try {
                    await this.createBackup();

                    progress.report({ message: 'Downloading...', increment: 20 });
                    const vsixPath = await downloader.download(
                        updateInfo.downloadUrl,
                        updateInfo.version,
                        updateInfo.sha256
                    );

                    progress.report({ message: 'Installing...', increment: 60 });
                    await installer.install(vsixPath);

                    progress.report({ message: 'Cleaning up...', increment: 20 });
                    await downloader.cleanup(vsixPath);

                    return true;
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `DevFlow Pro: update failed — ${error}. Use "Rollback" if needed.`
                    );
                    return false;
                }
            }
        );

        if (success) {
            const reload = await vscode.window.showInformationMessage(
                `DevFlow Pro v${updateInfo.version} installed! Reload window to activate.`,
                'Reload Now',
                'Later'
            );

            if (reload === 'Reload Now') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }
    }

    /**
     * Open the changelog text in a read-only editor beside the current file
     */
    private async showChangelog(changelog: string): Promise<void> {
        const doc = await vscode.workspace.openTextDocument({
            content: changelog || '(No changelog available)',
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });
    }

    /**
     * Store the current version in global state so a rollback is possible
     */
    private async createBackup(): Promise<void> {
        const backup: BackupInfo = {
            version: this.currentVersion,
            date: new Date().toISOString()
        };
        await this.context.globalState.update(BACKUP_STATE_KEY, backup);
    }

    /**
     * Rollback to the version saved in global state
     */
    async rollback(): Promise<void> {
        const backup = this.context.globalState.get<BackupInfo>(BACKUP_STATE_KEY);

        if (!backup) {
            vscode.window.showWarningMessage('DevFlow Pro: no backup found to roll back to.');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Roll back DevFlow Pro to v${backup.version} (installed on ${backup.date})?`,
            { modal: true },
            'Rollback',
            'Cancel'
        );

        if (confirm !== 'Rollback') {
            return;
        }

        vscode.window.showInformationMessage(
            `DevFlow Pro: to roll back, reinstall v${backup.version} from ` +
            `https://github.com/josmurfy/devflow-pro/releases/tag/v${backup.version}`
        );
    }

    /**
     * Start the periodic background check timer
     */
    private schedulePeriodicChecks(): void {
        if (this.checkIntervalHandle) {
            clearInterval(this.checkIntervalHandle);
            this.checkIntervalHandle = null;
        }

        if (!this.autoCheckEnabled) {
            return;
        }

        const intervalMs = this.checkIntervalHours * 60 * 60 * 1000;
        this.checkIntervalHandle = setInterval(
            () => this.checkForUpdates(false),
            intervalMs
        );
    }

    /**
     * Called when VS Code configuration changes
     */
    private onConfigChanged(): void {
        const config = vscode.workspace.getConfiguration('devflow');
        this.updateChannel = config.get<'stable' | 'beta'>('updates.channel', 'stable');
        this.autoCheckEnabled = config.get<boolean>('updates.autoCheck', true);
        this.checkIntervalHours = config.get<number>('updates.checkInterval', 6);

        this.schedulePeriodicChecks();
    }

    /**
     * Clean up timers when the extension deactivates
     */
    dispose(): void {
        if (this.checkIntervalHandle) {
            clearInterval(this.checkIntervalHandle);
            this.checkIntervalHandle = null;
        }
        UpdateManager.instance = null;
    }
}
