/**
 * DevFlow Pro - Ticket Detail Webview
 * Full-featured panel showing all ticket info with edit/action capabilities
 */

import * as vscode from 'vscode';
import { DebugLoggerQueries } from '../database/queries';
import { DebugReport, HistoryEntry } from '../database/models';
import { CopilotProvider } from './copilotProvider';

export class TicketDetailView {
    private panel: vscode.WebviewPanel | null = null;
    private currentTicketId: number | null = null;

    constructor(
        private queries: DebugLoggerQueries,
        private copilot: CopilotProvider,
        private onTicketChanged: () => void
    ) {}

    async show(ticketId: number): Promise<void> {
        const ticket = await this.queries.getTicketById(ticketId);
        if (!ticket) {
            vscode.window.showErrorMessage(`Ticket #${ticketId} not found.`);
            return;
        }

        this.currentTicketId = ticketId;

        let history: HistoryEntry[] = [];
        try { history = await this.queries.getHistory(ticketId); } catch { /* table may not exist */ }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'debugLoggerDetail',
                `Ticket #${ticketId}`,
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.title = `#${ticket.id} — ${ticket.severity.toUpperCase()}`;
        this.panel.webview.html = this.getHtml(ticket, history);
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    private async handleMessage(msg: any): Promise<void> {
        if (!this.currentTicketId) { return; }

        switch (msg.command) {
            case 'close':
                await this.queries.closeTicket(this.currentTicketId);
                this.onTicketChanged();
                await this.show(this.currentTicketId);
                vscode.window.showInformationMessage(`Ticket #${this.currentTicketId} closed.`);
                break;

            case 'reopen':
                await this.queries.reopenTicket(this.currentTicketId);
                this.onTicketChanged();
                await this.show(this.currentTicketId);
                vscode.window.showInformationMessage(`Ticket #${this.currentTicketId} reopened.`);
                break;

            case 'saveResolution':
                await this.queries.updateResolution(this.currentTicketId, msg.value);
                this.onTicketChanged();
                vscode.window.showInformationMessage('Resolution saved.');
                break;

            case 'saveComment':
                await this.queries.updateComment(this.currentTicketId, msg.value);
                this.onTicketChanged();
                vscode.window.showInformationMessage('Comment saved.');
                break;

            case 'sendToCopilot':
                await this.copilot.sendTicketToCopilot(this.currentTicketId);
                break;

            case 'openRelatedFiles': {
                const ticket = await this.queries.getTicketById(this.currentTicketId);
                if (ticket) {
                    const files = this.copilot.detectRelatedFiles(ticket);
                    if (files.length === 0) {
                        vscode.window.showInformationMessage('No related files detected from this ticket.');
                        return;
                    }
                    for (const f of files) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders) {
                            const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, f);
                            try {
                                await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
                            } catch { /* file may not exist */ }
                        }
                    }
                }
                break;
            }

            case 'delete': {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete ticket #${this.currentTicketId}? This cannot be undone.`,
                    { modal: true }, 'Delete', 'Cancel'
                );
                if (confirm === 'Delete') {
                    await this.queries.deleteTicket(this.currentTicketId);
                    this.onTicketChanged();
                    this.panel?.dispose();
                    vscode.window.showInformationMessage(`Ticket #${this.currentTicketId} deleted.`);
                }
                break;
            }

            case 'addTag': {
                const tagName = await vscode.window.showInputBox({ prompt: 'Tag name', placeHolder: 'e.g. CSS, urgent, mobile' });
                if (tagName) {
                    await this.queries.addTag(this.currentTicketId, tagName.trim());
                    this.onTicketChanged();
                    await this.show(this.currentTicketId);
                }
                break;
            }

            case 'removeTag':
                await this.queries.removeTag(this.currentTicketId, msg.value);
                this.onTicketChanged();
                await this.show(this.currentTicketId);
                break;
        }
    }

    private getHtml(ticket: DebugReport, history: HistoryEntry[]): string {
        const severityColor: Record<string, string> = {
            bug: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        const color = severityColor[ticket.severity] || '#888';

        const tagsHtml = ticket.tags
            ? ticket.tags.split(',').map(t =>
                `<span class="tag">${esc(t.trim())} <a href="#" onclick="removeTag('${esc(t.trim())}')">×</a></span>`
            ).join(' ')
            : '<span class="muted">No tags</span>';

        const screenshotHtml = ticket.screenshot
            ? `<div class="section"><h3>📸 Screenshot</h3><img src="data:image/png;base64,${ticket.screenshot}" class="screenshot" /></div>`
            : '';

        const historyHtml = history.length > 0
            ? history.map(h => `
                <div class="history-item">
                    <span class="history-time">${esc(h.changed_at || '')}</span>
                    <span class="history-user">@${esc(h.changed_by)}</span>
                    <span class="history-action">${esc(h.action)}${h.field_changed ? ` <strong>${esc(h.field_changed)}</strong>` : ''}</span>
                </div>`).join('')
            : '<p class="muted">No history recorded yet.</p>';

        return /*html*/`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; line-height: 1.6; }
    h2 { margin: 0 0 4px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 12px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: #fff; background: ${color}; text-transform: uppercase; }
    .status { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${ticket.status === 0 ? '#22c55e' : '#64748b'}; color: #fff; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 13px; }
    .section { margin: 16px 0; }
    .section h3 { margin: 0 0 6px; font-size: 14px; }
    pre { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 10px; overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
    textarea { width: 100%; min-height: 80px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; font-family: inherit; font-size: 13px; resize: vertical; }
    .btn { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; margin-right: 6px; margin-top: 6px; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-copilot { background: #8b5cf6; color: #fff; font-size: 14px; padding: 8px 18px; }
    .btn-copilot:hover { background: #7c3aed; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0; padding: 12px; background: var(--vscode-sideBar-background); border-radius: 6px; }
    .tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 10px; font-size: 12px; margin: 2px; }
    .tag a { color: inherit; text-decoration: none; margin-left: 4px; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .screenshot { max-width: 100%; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
    .history-item { padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border); font-size: 12px; }
    .history-time { color: var(--vscode-descriptionForeground); margin-right: 8px; }
    .history-user { color: #8b5cf6; margin-right: 8px; }
    .url-box { background: var(--vscode-textCodeBlock-background); padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; word-break: break-all; }
    .save-indicator { color: #22c55e; font-size: 12px; display: none; margin-left: 8px; }
</style>
</head>
<body>

<div class="header">
    <h2>Ticket #${ticket.id}</h2>
    <span class="badge">${esc(ticket.severity)}</span>
    <span class="status">${ticket.status === 0 ? 'OPEN' : 'CLOSED'}</span>
    <span class="meta">${esc(ticket.admin_user)} — ${esc(ticket.date_added)}</span>
</div>

<div class="actions">
    <button class="btn btn-copilot" onclick="send('sendToCopilot')">🤖 Send to Copilot</button>
    <button class="btn btn-secondary" onclick="send('openRelatedFiles')">📂 Open Related Files</button>
    ${ticket.status === 0
        ? '<button class="btn btn-primary" onclick="send(\'close\')">✅ Close Ticket</button>'
        : '<button class="btn btn-secondary" onclick="send(\'reopen\')">🔄 Reopen</button>'
    }
    <button class="btn btn-secondary" onclick="send('addTag')">🏷️ Add Tag</button>
    <button class="btn btn-danger" onclick="send('delete')">🗑️ Delete</button>
</div>

<div class="section">
    <h3>🔗 URL</h3>
    <div class="url-box">${esc(ticket.url)}</div>
</div>

<div class="section">
    <h3>🏷️ Tags</h3>
    ${tagsHtml}
</div>

<div class="section">
    <h3>💬 Comment</h3>
    <textarea id="comment">${esc(ticket.comment || '')}</textarea>
    <br>
    <button class="btn btn-secondary" onclick="saveField('comment', 'saveComment')">Save Comment</button>
    <span id="comment-saved" class="save-indicator">✓ Saved</span>
</div>

${ticket.console_log ? `
<div class="section">
    <h3>🖥️ Console Log</h3>
    <pre>${esc(ticket.console_log)}</pre>
</div>` : ''}

${ticket.network_log ? `
<div class="section">
    <h3>🌐 Network Log</h3>
    <pre>${esc(ticket.network_log)}</pre>
</div>` : ''}

${screenshotHtml}

<div class="section">
    <h3>🔧 Resolution Notes</h3>
    <textarea id="resolution" placeholder="Add your fix notes here...">${esc(ticket.resolution || '')}</textarea>
    <br>
    <button class="btn btn-primary" onclick="saveField('resolution', 'saveResolution')">Save Resolution</button>
    <span id="resolution-saved" class="save-indicator">✓ Saved</span>
</div>

<div class="section">
    <h3>📜 History</h3>
    ${historyHtml}
</div>

<script>
    const vscode = acquireVsCodeApi();

    function send(command, value) {
        vscode.postMessage({ command, value });
    }

    function saveField(fieldId, command) {
        const value = document.getElementById(fieldId).value;
        vscode.postMessage({ command, value });
        const indicator = document.getElementById(fieldId + '-saved');
        if (indicator) { indicator.style.display = 'inline'; setTimeout(() => indicator.style.display = 'none', 2000); }
    }

    function removeTag(tagName) {
        vscode.postMessage({ command: 'removeTag', value: tagName });
    }
</script>

</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
    }
}

function esc(s: any): string {
    if (s == null) { return ''; }
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
