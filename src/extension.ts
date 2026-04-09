/**
 * DevFlow Pro - Extension Entry Point
 * Activates the extension and wires up all commands and systems
 */

import * as vscode from 'vscode';
import { UpdateManager } from './updates/updateManager';
import { OutputLogger } from './ui/outputLogger';
import { SmartStatusBar } from './ui/smartStatusBar';
import { DevFlowTreeProvider } from './ui/devFlowTreeProvider';
import { DatabaseConnection } from './database/connection';
import { DebugLoggerQueries } from './database/queries';
import { TicketTreeProvider } from './views/ticketTreeProvider';
import { TicketDetailView } from './views/ticketDetailView';
import { CopilotProvider } from './views/copilotProvider';
import { SettingsView } from './views/settingsView';

let updateManager: UpdateManager | null = null;
let outputLogger: OutputLogger | null = null;
let statusBar: SmartStatusBar | null = null;
let treeProvider: DevFlowTreeProvider | null = null;
let dbConnection: DatabaseConnection | null = null;
let ticketTree: TicketTreeProvider | null = null;
let ticketDetail: TicketDetailView | null = null;
let copilotProvider: CopilotProvider | null = null;
let settingsView: SettingsView | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // ─────────────────────────────────────────────────────────
    // UI COMPONENTS (existing)
    // ─────────────────────────────────────────────────────────

    outputLogger = OutputLogger.getInstance();
    outputLogger.info('DevFlow Pro is activating...');

    statusBar = new SmartStatusBar();
    context.subscriptions.push(statusBar.getItem());

    treeProvider = new DevFlowTreeProvider();
    const devflowTreeView = vscode.window.createTreeView('devflow.statusView', {
        treeDataProvider: treeProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(devflowTreeView);

    // ─────────────────────────────────────────────────────────
    // AUTO-UPDATE SYSTEM (existing)
    // ─────────────────────────────────────────────────────────

    updateManager = UpdateManager.getInstance(context, outputLogger, statusBar, treeProvider);
    await updateManager.initialize();

    const config = vscode.workspace.getConfiguration('devflow');
    const manifest = context.extension.packageJSON as { version: string };
    treeProvider.updateStatus({
        currentVersion: manifest.version,
        channel: config.get<'stable' | 'beta'>('updates.channel', 'stable'),
        autoCheck: config.get<boolean>('updates.autoCheck', true),
        checkInterval: config.get<number>('updates.checkInterval', 6),
        extensionActive: true
    });

    // ─────────────────────────────────────────────────────────
    // DEBUG LOGGER SYSTEM
    // ─────────────────────────────────────────────────────────

    dbConnection = new DatabaseConnection(context);
    ticketTree = new TicketTreeProvider();

    const ticketTreeView = vscode.window.createTreeView('debugLogger.ticketList', {
        treeDataProvider: ticketTree,
        showCollapseAll: true
    });
    context.subscriptions.push(ticketTreeView);

    // Helper: called when DB connects successfully
    const onDbConnected = async () => {
        const pool = dbConnection!.getPool();
        const prefix = dbConnection!.getPrefix();
        const queries = new DebugLoggerQueries(pool, prefix);

        // Ensure history table exists
        try { await queries.ensureHistoryTable(); } catch { /* ok */ }

        ticketTree!.setQueries(queries);
        copilotProvider = new CopilotProvider(queries);
        ticketDetail = new TicketDetailView(queries, copilotProvider, () => ticketTree!.refresh());

        outputLogger!.success('Connected to OpenCart database');
        outputLogger!.info(`Table prefix: ${prefix}`);

        const stats = await queries.getStats();
        outputLogger!.info(`Tickets: ${stats.open} open (${stats.bugs} bugs, ${stats.warnings} warnings, ${stats.infos} info) — ${stats.closed} closed`);
    };

    settingsView = new SettingsView(dbConnection, onDbConnected);

    // Auto-connect if config exists
    try {
        const existingConfig = await dbConnection.loadConfig();
        if (existingConfig) {
            outputLogger.info('Found saved DB config, connecting...');
            await dbConnection.connect(existingConfig);
            await onDbConnected();
        } else {
            outputLogger.info('No database configured yet. Use "Debug Logger: Configure Database" to get started.');
        }
    } catch (err: any) {
        outputLogger.warn(`Auto-connect failed: ${err.message}`);
    }

    // ─────────────────────────────────────────────────────────
    // COMMANDS — Update system
    // ─────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.checkForUpdates', async () => {
            await updateManager!.checkForUpdates(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.rollbackVersion', async () => {
            await updateManager!.rollback();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.switchUpdateChannel', async () => {
            const cfg = vscode.workspace.getConfiguration('devflow');
            const current = cfg.get<string>('updates.channel', 'stable');

            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'stable', description: 'Production-ready releases (recommended)', picked: current === 'stable' },
                    { label: 'beta', description: 'Early access — may contain bugs', picked: current === 'beta' }
                ],
                { placeHolder: `Current channel: ${current}` }
            );

            if (choice && choice.label !== current) {
                await cfg.update('updates.channel', choice.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(
                    `DevFlow Pro: switched to ${choice.label} update channel.`
                );
                outputLogger!.info(`Channel switched to: ${choice.label}`);
                treeProvider!.updateStatus({ channel: choice.label as 'stable' | 'beta' });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.showOutput', () => {
            outputLogger!.show();
        })
    );

    // ─────────────────────────────────────────────────────────
    // COMMANDS — Debug Logger
    // ─────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.configure', () => {
            settingsView!.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.refresh', () => {
            ticketTree!.refresh();
            outputLogger!.info('Ticket list refreshed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.showTicket', async (ticketId: number) => {
            if (!ticketDetail) {
                vscode.window.showWarningMessage('Connect to database first: Debug Logger → Configure Database');
                return;
            }
            await ticketDetail.show(ticketId);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.sendToCopilot', async (item: any) => {
            if (!copilotProvider) {
                vscode.window.showWarningMessage('Connect to database first.');
                return;
            }
            const ticketId = item?.ticket?.id;
            if (ticketId) {
                await copilotProvider.sendTicketToCopilot(ticketId);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.closeTicket', async (item: any) => {
            if (!ticketDetail) { return; }
            const ticketId = item?.ticket?.id;
            if (ticketId) {
                const queries = new DebugLoggerQueries(dbConnection!.getPool(), dbConnection!.getPrefix());
                await queries.closeTicket(ticketId);
                ticketTree!.refresh();
                vscode.window.showInformationMessage(`Ticket #${ticketId} closed.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.reopenTicket', async (item: any) => {
            const ticketId = item?.ticket?.id;
            if (ticketId && dbConnection?.isConnected()) {
                const queries = new DebugLoggerQueries(dbConnection.getPool(), dbConnection.getPrefix());
                await queries.reopenTicket(ticketId);
                ticketTree!.refresh();
                vscode.window.showInformationMessage(`Ticket #${ticketId} reopened.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.deleteTicket', async (item: any) => {
            const ticketId = item?.ticket?.id;
            if (ticketId && dbConnection?.isConnected()) {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete ticket #${ticketId}?`, { modal: true }, 'Delete', 'Cancel'
                );
                if (confirm === 'Delete') {
                    const queries = new DebugLoggerQueries(dbConnection.getPool(), dbConnection.getPrefix());
                    await queries.deleteTicket(ticketId);
                    ticketTree!.refresh();
                    vscode.window.showInformationMessage(`Ticket #${ticketId} deleted.`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.openRelatedFiles', async (item: any) => {
            if (!copilotProvider) { return; }
            const ticketId = item?.ticket?.id;
            if (ticketId) {
                const queries = new DebugLoggerQueries(dbConnection!.getPool(), dbConnection!.getPrefix());
                const ticket = await queries.getTicketById(ticketId);
                if (ticket) {
                    const files = copilotProvider.detectRelatedFiles(ticket);
                    if (files.length === 0) {
                        vscode.window.showInformationMessage('No related files detected.');
                        return;
                    }
                    for (const f of files) {
                        const wf = vscode.workspace.workspaceFolders;
                        if (wf) {
                            const uri = vscode.Uri.joinPath(wf[0].uri, f);
                            try {
                                await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
                            } catch { /* file may not exist */ }
                        }
                    }
                }
            }
        })
    );

    outputLogger.success(`DevFlow Pro v${manifest.version} activated successfully`);
}

export function deactivate(): void {
    if (updateManager) { updateManager.dispose(); updateManager = null; }
    if (statusBar) { statusBar.dispose(); statusBar = null; }
    if (treeProvider) { treeProvider.dispose(); treeProvider = null; }
    if (ticketTree) { ticketTree.dispose(); ticketTree = null; }
    if (ticketDetail) { ticketDetail.dispose(); ticketDetail = null; }
    if (dbConnection) { dbConnection.disconnect(); dbConnection = null; }
    if (outputLogger) { outputLogger.dispose(); outputLogger = null; }
}
