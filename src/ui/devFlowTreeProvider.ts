/**
 * DevFlow Pro - Status TreeView Provider
 * Sidebar panel showing extension status, version info, and actions
 */

import * as vscode from 'vscode';

export interface DevFlowStatus {
    currentVersion: string;
    channel: 'stable' | 'beta';
    autoCheck: boolean;
    checkInterval: number;
    lastCheckTime: string | null;
    lastCheckResult: 'up-to-date' | 'update-available' | 'error' | 'never';
    availableVersion: string | null;
    extensionActive: boolean;
}

type TreeItemType = 'header' | 'info' | 'action';

class DevFlowTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly itemType: TreeItemType,
        options?: {
            description?: string;
            icon?: string;
            command?: vscode.Command;
            tooltip?: string;
        }
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        if (options?.description) {
            this.description = options.description;
        }
        if (options?.icon) {
            this.iconPath = new vscode.ThemeIcon(options.icon);
        }
        if (options?.command) {
            this.command = options.command;
        }
        if (options?.tooltip) {
            this.tooltip = options.tooltip;
        }

        // Style headers differently
        if (itemType === 'header') {
            this.contextValue = 'header';
        } else if (itemType === 'action') {
            this.contextValue = 'action';
        }
    }
}

export class DevFlowTreeProvider implements vscode.TreeDataProvider<DevFlowTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DevFlowTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private status: DevFlowStatus = {
        currentVersion: '?',
        channel: 'stable',
        autoCheck: true,
        checkInterval: 6,
        lastCheckTime: null,
        lastCheckResult: 'never',
        availableVersion: null,
        extensionActive: true
    };

    updateStatus(partial: Partial<DevFlowStatus>): void {
        Object.assign(this.status, partial);
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: DevFlowTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): DevFlowTreeItem[] {
        const items: DevFlowTreeItem[] = [];

        // ── STATUS ──
        const statusIcon = this.getStatusIcon();
        const statusLabel = this.getStatusLabel();
        items.push(new DevFlowTreeItem(statusLabel, 'info', {
            icon: statusIcon,
            tooltip: 'Current extension status'
        }));

        // ── VERSION INFO ──
        items.push(new DevFlowTreeItem('Version', 'info', {
            description: `v${this.status.currentVersion}`,
            icon: 'tag'
        }));

        items.push(new DevFlowTreeItem('Channel', 'info', {
            description: this.status.channel,
            icon: this.status.channel === 'beta' ? 'beaker' : 'verified'
        }));

        if (this.status.availableVersion) {
            items.push(new DevFlowTreeItem('Update Available', 'info', {
                description: `v${this.status.availableVersion}`,
                icon: 'arrow-up',
                tooltip: `Version ${this.status.availableVersion} is available`
            }));
        }

        // ── LAST CHECK ──
        const lastCheck = this.status.lastCheckTime
            ? this.formatRelativeTime(this.status.lastCheckTime)
            : 'Never';
        items.push(new DevFlowTreeItem('Last Check', 'info', {
            description: lastCheck,
            icon: 'history'
        }));

        // ── SETTINGS ──
        items.push(new DevFlowTreeItem('Auto-Check', 'info', {
            description: this.status.autoCheck
                ? `Every ${this.status.checkInterval}h`
                : 'Disabled',
            icon: this.status.autoCheck ? 'clock' : 'circle-slash'
        }));

        // ── SEPARATOR + ACTIONS ──
        items.push(new DevFlowTreeItem('─────────', 'header'));

        items.push(new DevFlowTreeItem('Check for Updates', 'action', {
            icon: 'cloud-download',
            command: { command: 'devflow.checkForUpdates', title: 'Check for Updates' }
        }));

        items.push(new DevFlowTreeItem('Switch Channel', 'action', {
            icon: 'arrow-swap',
            command: { command: 'devflow.switchUpdateChannel', title: 'Switch Channel' }
        }));

        items.push(new DevFlowTreeItem('Rollback Version', 'action', {
            icon: 'history',
            command: { command: 'devflow.rollbackVersion', title: 'Rollback' }
        }));

        items.push(new DevFlowTreeItem('Show Logs', 'action', {
            icon: 'output',
            command: { command: 'devflow.showOutput', title: 'Show Output' }
        }));

        return items;
    }

    private getStatusIcon(): string {
        switch (this.status.lastCheckResult) {
            case 'up-to-date': return 'pass';
            case 'update-available': return 'arrow-up';
            case 'error': return 'error';
            default: return 'circle-large-outline';
        }
    }

    private getStatusLabel(): string {
        switch (this.status.lastCheckResult) {
            case 'up-to-date': return 'Up to Date';
            case 'update-available': return 'Update Available';
            case 'error': return 'Check Failed';
            default: return 'Ready';
        }
    }

    private formatRelativeTime(isoDate: string): string {
        const now = Date.now();
        const then = new Date(isoDate).getTime();
        const diffMs = now - then;

        if (diffMs < 60_000) { return 'Just now'; }
        if (diffMs < 3600_000) { return `${Math.floor(diffMs / 60_000)}m ago`; }
        if (diffMs < 86400_000) { return `${Math.floor(diffMs / 3600_000)}h ago`; }
        return `${Math.floor(diffMs / 86400_000)}d ago`;
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
