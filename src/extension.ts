/**
 * DevFlow Pro - Extension Entry Point
 * Activates the extension and wires up all commands and systems
 */

import * as vscode from 'vscode';
import { UpdateManager } from './updates/updateManager';

let updateManager: UpdateManager | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('DevFlow Pro is now active!');

    // ─────────────────────────────────────────────────────────
    // AUTO-UPDATE SYSTEM
    // ─────────────────────────────────────────────────────────

    updateManager = UpdateManager.getInstance(context);
    await updateManager.initialize();

    // Command: manually check for updates
    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.checkForUpdates', async () => {
            await updateManager!.checkForUpdates(true);
        })
    );

    // Command: rollback to previous version
    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.rollbackVersion', async () => {
            await updateManager!.rollback();
        })
    );

    // Command: switch update channel
    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.switchUpdateChannel', async () => {
            const config = vscode.workspace.getConfiguration('devflow');
            const current = config.get<string>('updates.channel', 'stable');

            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'stable', description: 'Production-ready releases (recommended)', picked: current === 'stable' },
                    { label: 'beta', description: 'Early access — may contain bugs', picked: current === 'beta' }
                ],
                { placeHolder: `Current channel: ${current}` }
            );

            if (choice && choice.label !== current) {
                await config.update('updates.channel', choice.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(
                    `DevFlow Pro: switched to ${choice.label} update channel.`
                );
            }
        })
    );

    // Status bar button
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99
    );
    statusBarItem.text = '$(cloud-download) DevFlow';
    statusBarItem.command = 'devflow.checkForUpdates';
    statusBarItem.tooltip = 'Check for DevFlow Pro updates';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ─────────────────────────────────────────────────────────
    // FUTURE: BUG DASHBOARD, GITHUB INTEGRATION, AI FIXES
    // ─────────────────────────────────────────────────────────
}

export function deactivate(): void {
    if (updateManager) {
        updateManager.dispose();
        updateManager = null;
    }
}
