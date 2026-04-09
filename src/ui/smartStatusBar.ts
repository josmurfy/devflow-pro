/**
 * DevFlow Pro - Smart Status Bar
 * Status bar item that reflects the current state of the extension
 */

import * as vscode from 'vscode';

export type StatusBarState = 'idle' | 'checking' | 'update-available' | 'downloading' | 'installing' | 'up-to-date' | 'error';

interface StateConfig {
    icon: string;
    text: string;
    tooltip: string;
    color?: string;
}

const STATE_MAP: Record<StatusBarState, StateConfig> = {
    'idle': {
        icon: '$(extensions)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Click to check for updates'
    },
    'checking': {
        icon: '$(sync~spin)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Checking for updates...'
    },
    'update-available': {
        icon: '$(arrow-up)',
        text: 'DevFlow ↑',
        tooltip: 'DevFlow Pro — Update available! Click to update.',
        color: 'statusBarItem.warningBackground'
    },
    'downloading': {
        icon: '$(cloud-download)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Downloading update...'
    },
    'installing': {
        icon: '$(loading~spin)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Installing update...'
    },
    'up-to-date': {
        icon: '$(check)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Up to date ✓'
    },
    'error': {
        icon: '$(warning)',
        text: 'DevFlow',
        tooltip: 'DevFlow Pro — Error during last check',
        color: 'statusBarItem.errorBackground'
    }
};

export class SmartStatusBar {
    private item: vscode.StatusBarItem;
    private currentState: StatusBarState = 'idle';
    private resetTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99
        );
        this.item.command = 'devflow.checkForUpdates';
        this.setState('idle');
        this.item.show();
    }

    setState(state: StatusBarState, extra?: string): void {
        this.currentState = state;
        const config = STATE_MAP[state];
        this.item.text = `${config.icon} ${config.text}`;
        this.item.tooltip = extra ? `${config.tooltip}\n${extra}` : config.tooltip;

        if (config.color) {
            this.item.backgroundColor = new vscode.ThemeColor(config.color);
        } else {
            this.item.backgroundColor = undefined;
        }

        // Auto-reset "up-to-date" and "error" to idle after 30s
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        if (state === 'up-to-date' || state === 'error') {
            this.resetTimer = setTimeout(() => this.setState('idle'), 30_000);
        }
    }

    getState(): StatusBarState {
        return this.currentState;
    }

    getItem(): vscode.StatusBarItem {
        return this.item;
    }

    dispose(): void {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.item.dispose();
    }
}
