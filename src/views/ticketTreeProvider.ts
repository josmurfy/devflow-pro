/**
 * DevFlow Pro - Ticket TreeView Provider
 * Sidebar panel showing debug tickets grouped by severity/status
 */

import * as vscode from 'vscode';
import { DebugLoggerQueries } from '../database/queries';
import { DebugReport, TicketStats } from '../database/models';

type NodeType = 'category' | 'ticket';

class TicketTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly nodeType: NodeType,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly ticket?: DebugReport,
        public readonly categoryKey?: string
    ) {
        super(label, collapsible);
    }
}

export class TicketTreeProvider implements vscode.TreeDataProvider<TicketTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TicketTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private queries: DebugLoggerQueries | null = null;
    private connected = false;
    private cachedTickets: DebugReport[] = [];
    private cachedStats: TicketStats | null = null;

    setQueries(queries: DebugLoggerQueries): void {
        this.queries = queries;
        this.connected = true;
        this.refresh();
    }

    setDisconnected(): void {
        this.queries = null;
        this.connected = false;
        this.cachedTickets = [];
        this.cachedStats = null;
        this._onDidChangeTreeData.fire(null);
    }

    refresh(): void {
        this.cachedTickets = [];
        this.cachedStats = null;
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: TicketTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TicketTreeItem): Promise<TicketTreeItem[]> {
        if (!this.connected || !this.queries) {
            return [
                new TicketTreeItem(
                    'Not connected — Configure Database',
                    'category',
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined
                )
            ];
        }

        // Root level — categories
        if (!element) {
            return this.getRootCategories();
        }

        // Children of a category
        if (element.nodeType === 'category' && element.categoryKey) {
            return this.getCategoryTickets(element.categoryKey);
        }

        return [];
    }

    private async getRootCategories(): Promise<TicketTreeItem[]> {
        try {
            if (!this.cachedStats) {
                this.cachedStats = await this.queries!.getStats();
            }
            const s = this.cachedStats;

            const items: TicketTreeItem[] = [];

            if (s.bugs > 0) {
                const item = new TicketTreeItem(
                    `Bugs (${s.bugs})`, 'category',
                    vscode.TreeItemCollapsibleState.Expanded,
                    undefined, 'bugs'
                );
                item.iconPath = new vscode.ThemeIcon('bug', new vscode.ThemeColor('errorForeground'));
                items.push(item);
            }

            if (s.warnings > 0) {
                const item = new TicketTreeItem(
                    `Warnings (${s.warnings})`, 'category',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined, 'warnings'
                );
                item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                items.push(item);
            }

            if (s.infos > 0) {
                const item = new TicketTreeItem(
                    `Info (${s.infos})`, 'category',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined, 'infos'
                );
                item.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
                items.push(item);
            }

            if (s.closed > 0) {
                const item = new TicketTreeItem(
                    `Closed (${s.closed})`, 'category',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined, 'closed'
                );
                item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
                items.push(item);
            }

            if (items.length === 0) {
                return [new TicketTreeItem('No tickets found', 'category', vscode.TreeItemCollapsibleState.None)];
            }

            return items;
        } catch (err: any) {
            return [new TicketTreeItem(`Error: ${err.message}`, 'category', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private async getCategoryTickets(key: string): Promise<TicketTreeItem[]> {
        try {
            let tickets: DebugReport[];
            switch (key) {
                case 'bugs':
                    tickets = await this.queries!.getTickets({ status: 0, severity: 'bug', limit: 50 });
                    break;
                case 'warnings':
                    tickets = await this.queries!.getTickets({ status: 0, severity: 'warning', limit: 50 });
                    break;
                case 'infos':
                    tickets = await this.queries!.getTickets({ status: 0, severity: 'info', limit: 50 });
                    break;
                case 'closed':
                    tickets = await this.queries!.getTickets({ status: 1, limit: 30 });
                    break;
                default:
                    tickets = [];
            }

            return tickets.map(t => {
                const shortComment = (t.comment || '').substring(0, 60).replace(/\n/g, ' ');
                const item = new TicketTreeItem(
                    `#${t.id}`,
                    'ticket',
                    vscode.TreeItemCollapsibleState.None,
                    t
                );
                item.description = shortComment || t.url.substring(0, 50);
                item.tooltip = new vscode.MarkdownString(
                    `**#${t.id}** — ${t.severity.toUpperCase()}\n\n` +
                    `**URL:** ${t.url}\n\n` +
                    `**Comment:** ${t.comment || '(none)'}\n\n` +
                    `**By:** ${t.admin_user} — ${t.date_added}\n\n` +
                    (t.tags ? `**Tags:** ${t.tags}` : '')
                );
                item.command = {
                    command: 'debugLogger.showTicket',
                    title: 'View Ticket',
                    arguments: [t.id]
                };
                item.contextValue = t.status === 0 ? 'ticket-open' : 'ticket-closed';
                item.iconPath = this.getSeverityIcon(t.severity);
                return item;
            });
        } catch (err: any) {
            return [new TicketTreeItem(`Error: ${err.message}`, 'category', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private getSeverityIcon(severity: string): vscode.ThemeIcon {
        switch (severity) {
            case 'bug': return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('errorForeground'));
            case 'warning': return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('editorWarning.foreground'));
            case 'info': return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('editorInfo.foreground'));
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
