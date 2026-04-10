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

        return /*html*/`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 0;
        line-height: 1.6;
    }

    /* ── Header Banner ── */
    .ticket-header {
        background: linear-gradient(135deg, ${color}22 0%, ${color}08 100%);
        border-bottom: 3px solid ${color};
        padding: 20px 24px 16px;
    }
    .ticket-header-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ticket-id { font-size: 28px; font-weight: 800; letter-spacing: -1px; color: var(--vscode-foreground); }
    .badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 14px; border-radius: 20px;
        font-size: 13px; font-weight: 700; color: #fff;
        background: ${color}; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .status-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 12px; border-radius: 20px;
        font-size: 12px; font-weight: 600;
        background: ${ticket.status === 0 ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.2)'};
        color: ${ticket.status === 0 ? '#4ade80' : '#94a3b8'};
        border: 1px solid ${ticket.status === 0 ? 'rgba(34,197,94,0.4)' : 'rgba(100,116,139,0.4)'};
    }
    .ticket-meta { font-size: 13px; color: var(--vscode-descriptionForeground); margin-top: 8px; }

    /* ── Actions toolbar ── */
    .toolbar {
        display: flex; flex-wrap: wrap; gap: 8px;
        padding: 14px 24px;
        background: var(--vscode-sideBar-background);
        border-bottom: 1px solid var(--vscode-widget-border);
    }
    .btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px; border: none; border-radius: 8px;
        cursor: pointer; font-size: 13px; font-weight: 600;
        font-family: inherit; transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
    }
    .btn:hover { opacity: 0.85; }
    .btn:active { transform: scale(0.97); }
    .btn-copilot { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-size: 14px; padding: 9px 18px; }
    .btn-primary { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; }
    .btn-success { background: linear-gradient(135deg, #16a34a, #15803d); color: #fff; }
    .btn-warning { background: linear-gradient(135deg, #d97706, #b45309); color: #fff; }
    .btn-danger { background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; }
    .btn-ghost {
        background: transparent; color: var(--vscode-foreground);
        border: 1px solid var(--vscode-widget-border);
    }
    .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }

    /* ── Body ── */
    .body { padding: 20px 24px; }

    /* ── Sections ── */
    .section { margin-bottom: 24px; }
    .section-title {
        font-size: 11px; font-weight: 700; letter-spacing: 1px;
        text-transform: uppercase; color: var(--vscode-descriptionForeground);
        margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
    }
    .section-title::after {
        content: ''; flex: 1; height: 1px;
        background: var(--vscode-widget-border);
    }

    .url-box {
        background: var(--vscode-textCodeBlock-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 8px; padding: 10px 14px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 13px; word-break: break-all; line-height: 1.5;
    }
    pre {
        background: var(--vscode-textCodeBlock-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 8px; padding: 12px 14px;
        font-size: 13px; white-space: pre-wrap; word-break: break-all;
        max-height: 250px; overflow-y: auto; line-height: 1.5;
    }

    textarea {
        width: 100%; min-height: 90px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 2px solid var(--vscode-input-border);
        border-radius: 8px; padding: 10px 12px;
        font-family: inherit; font-size: 14px; resize: vertical;
        transition: border-color 0.15s; outline: none;
    }
    textarea:focus { border-color: #7c3aed; }
    .save-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .save-indicator { font-size: 12px; color: #4ade80; display: none; }

    /* ── Tags ── */
    .tags-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag {
        display: inline-flex; align-items: center; gap: 6px;
        background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
        padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
    }
    .tag-remove {
        cursor: pointer; opacity: 0.7; font-size: 14px; line-height: 1;
        background: none; border: none; color: inherit; padding: 0;
    }
    .tag-remove:hover { opacity: 1; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 13px; }

    /* ── Screenshot ── */
    .screenshot { max-width: 100%; border: 1px solid var(--vscode-widget-border); border-radius: 8px; }

    /* ── History ── */
    .history-list { display: flex; flex-direction: column; gap: 6px; }
    .history-item {
        display: flex; align-items: baseline; gap: 8px;
        padding: 6px 10px; border-radius: 6px;
        background: var(--vscode-sideBar-background);
        font-size: 12px;
    }
    .history-time { color: var(--vscode-descriptionForeground); min-width: 130px; }
    .history-user { color: #8b5cf6; font-weight: 600; }
    .history-action { flex: 1; }
</style>
</head>
<body>

<div class="ticket-header">
    <div class="ticket-header-top">
        <span class="ticket-id">#${ticket.id}</span>
        <span class="badge">${esc(ticket.severity)}</span>
        <span class="status-chip">${ticket.status === 0 ? '🟢 Open' : '⚫ Closed'}</span>
    </div>
    <div class="ticket-meta">
        👤 ${esc(ticket.admin_user)} &nbsp;·&nbsp; 🕒 ${esc(ticket.date_added)}
        ${ticket.url ? `&nbsp;·&nbsp; 🔗 ${esc(ticket.url)}` : ''}
    </div>
</div>

<div class="toolbar">
    <button class="btn btn-copilot" onclick="send('sendToCopilot')">🤖 Send to Copilot</button>
    <button class="btn btn-ghost" onclick="send('openRelatedFiles')">📂 Files</button>
    ${ticket.status === 0
        ? '<button class="btn btn-success" onclick="send(\'close\')">✅ Close</button>'
        : '<button class="btn btn-warning" onclick="send(\'reopen\')">🔄 Reopen</button>'
    }
    <button class="btn btn-ghost" onclick="send('addTag')">🏷️ Tag</button>
    <button class="btn btn-danger" onclick="send('delete')">🗑️</button>
</div>

<div class="body">

<div class="section">
    <div class="section-title">🏷️ Tags</div>
    <div class="tags-list">
    ${ticket.tags
        ? ticket.tags.split(',').map(t =>
            `<span class="tag">${esc(t.trim())} <button class="tag-remove" onclick="removeTag('${esc(t.trim())}')">×</button></span>`
        ).join('')
        : '<span class="muted">No tags — click 🏷️ Tag to add one</span>'
    }
    </div>
</div>

${ticket.url ? `
<div class="section">
    <div class="section-title">🔗 URL</div>
    <div class="url-box">${esc(ticket.url)}</div>
</div>` : ''}

<div class="section">
    <div class="section-title">💬 Comment</div>
    <textarea id="comment">${esc(ticket.comment || '')}</textarea>
    <div class="save-row">
        <button class="btn btn-primary" onclick="saveField('comment', 'saveComment')">Save Comment</button>
        <span id="comment-saved" class="save-indicator">✓ Saved</span>
    </div>
</div>

${ticket.console_log ? `
<div class="section">
    <div class="section-title">🖥️ Console Log</div>
    <pre>${esc(ticket.console_log)}</pre>
</div>` : ''}

${ticket.network_log ? `
<div class="section">
    <div class="section-title">🌐 Network Log</div>
    <pre>${esc(ticket.network_log)}</pre>
</div>` : ''}

${ticket.screenshot && ticket.screenshot.startsWith('data:image/') ? `
<div class="section">
    <div class="section-title">📸 Screenshot</div>
    <img src="${ticket.screenshot}" class="screenshot" />
</div>` : ''}

<div class="section">
    <div class="section-title">🔧 Resolution Notes</div>
    <textarea id="resolution" placeholder="Add your fix notes here...">${esc(ticket.resolution || '')}</textarea>
    <div class="save-row">
        <button class="btn btn-primary" onclick="saveField('resolution', 'saveResolution')">Save Resolution</button>
        <span id="resolution-saved" class="save-indicator">✓ Saved</span>
    </div>
</div>

<div class="section">
    <div class="section-title">📜 History</div>
    ${history.length > 0
        ? `<div class="history-list">${history.map(h => `
            <div class="history-item">
                <span class="history-time">${esc(h.changed_at || '')}</span>
                <span class="history-user">@${esc(h.changed_by)}</span>
                <span class="history-action">${esc(h.action)}${h.field_changed ? ` · <strong>${esc(h.field_changed)}</strong>` : ''}</span>
            </div>`).join('')}</div>`
        : '<p class="muted">No history recorded yet.</p>'
    }
</div>

</div><!-- .body -->

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
