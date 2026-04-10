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
    // STEP 1: UI COMPONENTS — synchronous, always succeed
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

    dbConnection = new DatabaseConnection(context);
    ticketTree = new TicketTreeProvider();

    const ticketTreeView = vscode.window.createTreeView('debugLogger.ticketList', {
        treeDataProvider: ticketTree,
        showCollapseAll: true
    });
    context.subscriptions.push(ticketTreeView);

    // ─────────────────────────────────────────────────────────
    // STEP 2: COMMANDS DEBUG LOGGER — toujours disponibles
    // ─────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.configure', () => {
            if (!settingsView) {
                vscode.window.showWarningMessage('DevFlow Pro: not fully initialized yet.');
                return;
            }
            settingsView.show();
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
                vscode.window.showWarningMessage('Connectez d\'abord la base de données : Debug Logger → Configure Database');
                return;
            }
            await ticketDetail.show(ticketId);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.sendToCopilot', async (item: any) => {
            if (!copilotProvider) {
                vscode.window.showWarningMessage('Connectez d\'abord la base de données.');
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
            if (!ticketDetail || !dbConnection?.isConnected()) { return; }
            const ticketId = item?.ticket?.id;
            if (ticketId) {
                const queries = new DebugLoggerQueries(dbConnection.getPool(), dbConnection.getPrefix());
                await queries.closeTicket(ticketId);
                ticketTree!.refresh();
                vscode.window.showInformationMessage(`Ticket #${ticketId} fermé.`);
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
                vscode.window.showInformationMessage(`Ticket #${ticketId} réouvert.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.deleteTicket', async (item: any) => {
            const ticketId = item?.ticket?.id;
            if (ticketId && dbConnection?.isConnected()) {
                const confirm = await vscode.window.showWarningMessage(
                    `Supprimer le ticket #${ticketId}?`, { modal: true }, 'Supprimer', 'Annuler'
                );
                if (confirm === 'Supprimer') {
                    const queries = new DebugLoggerQueries(dbConnection.getPool(), dbConnection.getPrefix());
                    await queries.deleteTicket(ticketId);
                    ticketTree!.refresh();
                    vscode.window.showInformationMessage(`Ticket #${ticketId} supprimé.`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugLogger.openRelatedFiles', async (item: any) => {
            if (!copilotProvider || !dbConnection?.isConnected()) { return; }
            const ticketId = item?.ticket?.id;
            if (ticketId) {
                const queries = new DebugLoggerQueries(dbConnection.getPool(), dbConnection.getPrefix());
                const ticket = await queries.getTicketById(ticketId);
                if (ticket) {
                    const files = copilotProvider.detectRelatedFiles(ticket);
                    if (files.length === 0) {
                        vscode.window.showInformationMessage('Aucun fichier lié détecté.');
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

    // ─────────────────────────────────────────────────────────
    // STEP 3: COMMANDS DEVFLOW (mise à jour) — à la fin
    // ─────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.checkForUpdates', async () => {
            if (!updateManager) {
                vscode.window.showWarningMessage('DevFlow Pro: update system not ready yet.');
                return;
            }
            await updateManager.checkForUpdates(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.rollbackVersion', async () => {
            await updateManager?.rollback();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('devflow.switchUpdateChannel', async () => {
            const cfg = vscode.workspace.getConfiguration('devflow');
            const current = cfg.get<string>('updates.channel', 'stable');
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'stable', description: 'Version stable (recommandé)', picked: current === 'stable' },
                    { label: 'beta', description: 'Accès anticipé — peut contenir des bugs', picked: current === 'beta' }
                ],
                { placeHolder: `Canal actuel: ${current}` }
            );
            if (choice && choice.label !== current) {
                await cfg.update('updates.channel', choice.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`DevFlow Pro: canal changé vers ${choice.label}.`);
                outputLogger!.info(`Canal: ${choice.label}`);
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
    // STEP 4: ASYNC INIT — en arrière-plan, ne bloque rien
    // ─────────────────────────────────────────────────────────

    const manifest = context.extension.packageJSON as { version: string };
    outputLogger.success(`DevFlow Pro v${manifest.version} — commandes prêtes`);

    // Init async sans bloquer l'activation
    (async () => {
        try {
            // Update system
            updateManager = UpdateManager.getInstance(context, outputLogger!, statusBar!, treeProvider!);
            const config = vscode.workspace.getConfiguration('devflow');
            treeProvider!.updateStatus({
                currentVersion: manifest.version,
                channel: config.get<'stable' | 'beta'>('updates.channel', 'stable'),
                autoCheck: config.get<boolean>('updates.autoCheck', true),
                checkInterval: config.get<number>('updates.checkInterval', 6),
                extensionActive: true
            });
            await updateManager.initialize();
        } catch (err: any) {
            outputLogger!.warn(`Update system init failed: ${err.message}`);
        }

        try {
            // DB auto-connect
            const onDbConnected = async () => {
                const pool = dbConnection!.getPool();
                const prefix = dbConnection!.getPrefix();
                const queries = new DebugLoggerQueries(pool, prefix);
                try { await queries.ensureHistoryTable(); } catch { /* ok */ }
                ticketTree!.setQueries(queries);
                copilotProvider = new CopilotProvider(queries);
                ticketDetail = new TicketDetailView(queries, copilotProvider, () => ticketTree!.refresh());
                outputLogger!.success('Connecté à la base OpenCart');
                outputLogger!.info(`Préfixe: ${prefix}`);
                const stats = await queries.getStats();
                outputLogger!.info(`Tickets: ${stats.open} ouverts (${stats.bugs} bugs, ${stats.warnings} warnings, ${stats.infos} info) — ${stats.closed} fermés`);
            };

            settingsView = new SettingsView(dbConnection!, onDbConnected);

            const existingConfig = await dbConnection!.loadConfig();
            if (existingConfig) {
                outputLogger!.info('Config DB trouvée, connexion...');
                await dbConnection!.connect(existingConfig);
                await onDbConnected();
            } else {
                outputLogger!.info('Aucune DB configurée. Utilisez "Debug Logger: Configure Database".');
            }
        } catch (err: any) {
            outputLogger!.warn(`Auto-connect DB échoué: ${err.message}`);
        }
    })();
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
