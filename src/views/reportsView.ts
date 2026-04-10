/**
 * DevFlow Pro - Reports Webview
 * Full-page ticket list mimicking the OpenCart Debug Logger reports interface.
 * Features: filter toolbar, severity/source badges, inline comment+resolution editing,
 * tag management, console/network log, screenshot lightbox, bulk actions.
 */

import * as vscode from 'vscode';
import { DebugLoggerQueries } from '../database/queries';
import { DebugReport } from '../database/models';

export class ReportsView {
    private panel: vscode.WebviewPanel | null = null;
    private queries: DebugLoggerQueries | null = null;

    setQueries(queries: DebugLoggerQueries): void {
        this.queries = queries;
    }

    async show(): Promise<void> {
        if (!this.queries) {
            vscode.window.showWarningMessage('Connect to database first: Debug Logger → Configure Database');
            return;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            await this.reload();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'debugLoggerReports',
            '🐛 Debug Logger — Reports',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.onDidDispose(() => { this.panel = null; });
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));

        await this.reload();
    }

    private async reload(filters: ReportFilters = {}): Promise<void> {
        if (!this.panel || !this.queries) { return; }

        const [allTickets, stats, allTags] = await Promise.all([
            this.queries.getTickets({ limit: 200 }),
            this.queries.getStats(),
            this.queries.getAllTags?.() ?? Promise.resolve([] as string[])
        ]);

        // Apply filters client-side (simple)
        let tickets = allTickets;
        if (filters.status !== undefined) {
            tickets = tickets.filter(t => t.status === filters.status);
        }
        if (filters.source) {
            tickets = tickets.filter(t => t.source === filters.source);
        }
        if (filters.severity) {
            tickets = tickets.filter(t => t.severity === filters.severity);
        }
        if (filters.tag) {
            tickets = tickets.filter(t => t.tags && t.tags.split(',').map(s => s.trim()).includes(filters.tag!));
        }

        this.panel.webview.html = this.getHtml(tickets, allTickets, stats, allTags, filters);
    }

    private async handleMessage(msg: any): Promise<void> {
        if (!this.queries) { return; }

        switch (msg.command) {

            case 'reload':
                await this.reload(msg.filters || {});
                break;

            case 'filter':
                await this.reload(msg.filters || {});
                break;

            case 'updateComment':
                await this.queries.updateComment(msg.id, msg.value);
                break;

            case 'updateResolution':
                await this.queries.updateResolution(msg.id, msg.value);
                break;

            case 'changeSeverity': {
                await this.queries.updateField?.(msg.id, 'severity', msg.value);
                break;
            }

            case 'close':
                await this.queries.closeTicket(msg.id);
                await this.reload(msg.filters || {});
                break;

            case 'reopen':
                await this.queries.reopenTicket(msg.id);
                await this.reload(msg.filters || {});
                break;

            case 'delete': {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete ticket #${msg.id}?`, { modal: true }, 'Delete', 'Cancel'
                );
                if (confirm === 'Delete') {
                    await this.queries.deleteTicket(msg.id);
                    await this.reload(msg.filters || {});
                }
                break;
            }

            case 'addTag':
                await this.queries.addTag(msg.id, msg.value);
                await this.reload(msg.filters || {});
                break;

            case 'removeTag':
                await this.queries.removeTag(msg.id, msg.value);
                await this.reload(msg.filters || {});
                break;

            case 'bulkClose':
                for (const id of (msg.ids as number[])) {
                    await this.queries.closeTicket(id);
                }
                await this.reload(msg.filters || {});
                break;

            case 'bulkOpen':
                for (const id of (msg.ids as number[])) {
                    await this.queries.reopenTicket(id);
                }
                await this.reload(msg.filters || {});
                break;

            case 'bulkDelete': {
                const confirmBulk = await vscode.window.showWarningMessage(
                    `Delete ${(msg.ids as number[]).length} tickets?`, { modal: true }, 'Delete', 'Cancel'
                );
                if (confirmBulk === 'Delete') {
                    for (const id of (msg.ids as number[])) {
                        await this.queries.deleteTicket(id);
                    }
                    await this.reload(msg.filters || {});
                }
                break;
            }
        }
    }

    private getHtml(
        tickets: DebugReport[],
        allTickets: DebugReport[],
        stats: any,
        allTags: string[],
        filters: ReportFilters
    ): string {

        const totalOpen   = allTickets.filter(t => t.status === 0).length;
        const totalClosed = allTickets.filter(t => t.status === 1).length;
        const totalAdmin  = allTickets.filter(t => t.source === 'admin').length;
        const totalCatalog= allTickets.filter(t => t.source === 'catalog').length;

        // Compute all unique tags from all tickets
        const tagSet = new Set<string>();
        allTickets.forEach(t => {
            if (t.tags) { t.tags.split(',').forEach(tg => tagSet.add(tg.trim())); }
        });
        const uniqueTags = [...tagSet];

        const sevColors: Record<string, string> = {
            bug: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        const srcColors: Record<string, string> = {
            admin: '#8b5cf6',
            catalog: '#0ea5e9'
        };

        const filterState = JSON.stringify(filters);

        const cardsHtml = tickets.length === 0
            ? `<div class="empty-state"><div class="empty-icon">📭</div><div>No tickets found</div></div>`
            : tickets.map(t => {
                const sevColor  = sevColors[t.severity]  || '#888';
                const srcColor  = srcColors[t.source]    || '#888';
                const tagsList  = t.tags ? t.tags.split(',').map(tg => tg.trim()).filter(Boolean) : [];
                const isOpen    = t.status === 0;

                return `
<div class="report-card ${isOpen ? '' : 'is-closed'}" data-rid="${t.id}" style="border-left-color:${sevColor}">
  <div class="report-meta">
    <input type="checkbox" class="cb-item" value="${t.id}" onchange="updateBulk()">
    <span class="ticket-num" style="color:${sevColor}">#${t.id}</span>
    <span class="sev-badge" style="background:${sevColor}">${esc(t.severity).toUpperCase()}</span>
    <span class="src-badge" style="background:${srcColor}">${esc(t.source || '')}</span>
    <span style="font-weight:600">${esc(t.admin_user || '')}</span>
    <span class="meta-right">${esc(String(t.date_added || ''))}</span>
  </div>

  ${t.url ? `<div class="report-url">
    ${t.route ? `<span class="route-badge">${esc(t.route)}</span>` : ''}
    <span class="url-text">${esc(t.url)}</span>
  </div>` : ''}

  <div class="inline-edit comment-edit" data-rid="${t.id}" data-field="comment" onclick="startEdit(this)">
    ${t.comment ? esc(t.comment).replace(/\n/g, '<br>') : '<span class="placeholder">Click to add comment…</span>'}
  </div>

  <div class="tags-row" id="tags-${t.id}">
    ${tagsList.map(tg => `
      <span class="tag-chip">${esc(tg)}
        <button class="tag-x" onclick="removeTag(${t.id},'${esc(tg)}')">×</button>
      </span>`).join('')}
    <input type="text" class="tag-input" placeholder="+ tag" data-rid="${t.id}"
      onkeydown="if(event.key==='Enter'){addTag(this);event.preventDefault()}">
  </div>

  <div class="resolution-label">⚙️ Resolution</div>
  <div class="inline-edit resolution-edit" data-rid="${t.id}" data-field="resolution" onclick="startEdit(this)">
    ${t.resolution ? esc(t.resolution).replace(/\n/g, '<br>') : '<span class="placeholder">Click to add resolution notes…</span>'}
  </div>

  ${t.console_log ? `<pre class="log-pre">${esc(t.console_log)}</pre>` : ''}

  ${t.network_log ? `
  <details class="log-details">
    <summary>🌐 Network log</summary>
    <pre class="log-pre">${esc(t.network_log)}</pre>
  </details>` : ''}

  ${t.screenshot && t.screenshot.startsWith('data:image/') ? `
  <img class="screenshot-thumb" src="${t.screenshot}"
    onclick="showLightbox('${t.screenshot}')">` : ''}

  <div class="report-actions">
    ${isOpen
        ? `<button class="btn btn-close-ticket" onclick="action('close',${t.id})">✅ Close</button>`
        : `<button class="btn btn-reopen" onclick="action('reopen',${t.id})">🔄 Reopen</button>`}
    <button class="btn btn-delete" onclick="action('delete',${t.id})">🗑️</button>
  </div>
</div>`;
            }).join('\n');

        return /*html*/`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root { --radius: 6px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 15px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 18px 20px;
  }

  /* ── Header ── */
  .page-header {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    margin-bottom: 16px; padding-bottom: 14px;
    border-bottom: 2px solid var(--vscode-widget-border);
  }
  .page-title {
    font-size: 24px; font-weight: 900; letter-spacing: -1px; flex: 1;
    color: var(--vscode-foreground);
  }
  .stat-pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .stat-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 14px; border-radius: 4px; font-size: 13px; font-weight: 800; letter-spacing: 0.2px;
  }
  .stat-pill-all    { background: rgba(99,102,241,0.15); color: #818cf8; }
  .stat-pill-open   { background: rgba(239,68,68,0.15);  color: #f87171; }
  .stat-pill-closed { background: rgba(100,116,139,0.15);color: #94a3b8; }
  .stat-pill-admin  { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .stat-pill-catalog{ background: rgba(14,165,233,0.15); color: #38bdf8; }

  /* ── Filter bar ── */
  .filter-bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
    padding: 12px 16px;
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: var(--radius);
    margin-bottom: 12px;
  }
  .filter-bar .sep { width: 1px; height: 22px; background: var(--vscode-widget-border); margin: 0 4px; }
  .fbtn {
    padding: 6px 14px; border-radius: 4px; border: 1.5px solid var(--vscode-widget-border);
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; font-size: 13px; font-weight: 700; font-family: inherit;
    transition: background 0.12s, color 0.12s; letter-spacing: 0.1px;
  }
  .fbtn:hover { background: var(--vscode-list-hoverBackground); }
  .fbtn.active-all      { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .fbtn.active-open     { background: #dc2626; color: #fff; border-color: #dc2626; }
  .fbtn.active-closed   { background: #475569; color: #fff; border-color: #475569; }
  .fbtn.active-admin    { background: #7c3aed; color: #fff; border-color: #7c3aed; }
  .fbtn.active-catalog  { background: #0284c7; color: #fff; border-color: #0284c7; }
  .fbtn.active-bug      { background: #ef4444; color: #fff; border-color: #ef4444; }
  .fbtn.active-warning  { background: #f59e0b; color: #fff; border-color: #f59e0b; }
  .fbtn.active-info     { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .fbtn.active-tag      { background: #6366f1; color: #fff; border-color: #6366f1; }
  .filter-count { font-size: 13px; font-weight: 600; color: var(--vscode-descriptionForeground); margin-left: 4px; }

  .tags-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  .tags-filter-label { font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1px; color: var(--vscode-descriptionForeground); }

  /* ── Bulk bar ── */
  .bulk-bar {
    display: none; align-items: center; gap: 10px;
    padding: 10px 16px;
    background: rgba(99,102,241,0.1);
    border: 1.5px solid rgba(99,102,241,0.35);
    border-radius: var(--radius); margin-bottom: 12px;
    font-size: 14px;
  }
  .bulk-bar.visible { display: flex; }
  .bulk-count { font-weight: 800; color: #818cf8; }

  /* ── Cards ── */
  .report-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: var(--radius);
    border-left-width: 5px;
    padding: 14px 16px;
    margin-bottom: 12px;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .report-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
  .report-card.is-closed { opacity: 0.45; }

  .report-meta {
    display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
    margin-bottom: 8px; font-size: 13px; font-weight: 600;
  }
  .meta-right { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 500; }
  .cb-item { cursor: pointer; width: 16px; height: 16px; }

  .sev-badge {
    display: inline-block; padding: 3px 12px; border-radius: 3px;
    font-size: 11px; font-weight: 900; color: #fff; letter-spacing: 1.2px; text-transform: uppercase;
  }
  .src-badge {
    display: inline-block; padding: 3px 10px; border-radius: 3px;
    font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.5px;
  }
  .ticket-num { font-size: 17px; font-weight: 900; letter-spacing: -0.5px; color: var(--vscode-foreground); }

  .report-url {
    display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
    font-size: 12px; margin-bottom: 8px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-textCodeBlock-background);
    padding: 5px 10px; border-radius: 4px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .url-text { word-break: break-all; }

  /* Inline editing */
  .inline-edit {
    border-left: 4px solid var(--vscode-focusBorder);
    background: var(--vscode-textCodeBlock-background);
    padding: 9px 12px; border-radius: 0 5px 5px 0;
    cursor: pointer; font-size: 14px; white-space: pre-wrap; min-height: 32px;
    margin-bottom: 8px; line-height: 1.6;
    transition: background 0.12s;
  }
  .inline-edit:hover { background: var(--vscode-list-hoverBackground); }
  .resolution-edit { border-left-color: #f59e0b; background: rgba(245,158,11,0.07); }
  .resolution-label { font-size: 12px; font-weight: 800; color: #f59e0b; margin-bottom: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .inline-edit textarea {
    width: 100%; min-height: 70px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1.5px solid var(--vscode-input-border);
    border-radius: 4px; padding: 8px; font-family: inherit; font-size: 14px; resize: vertical;
  }
  .inline-save-row { display: flex; gap: 7px; margin-top: 7px; }
  .placeholder { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 14px; }

  /* Tags */
  .tags-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
  .tag-chip {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(99,102,241,0.15); color: #818cf8;
    border: 1px solid rgba(99,102,241,0.3);
    padding: 3px 10px; border-radius: 3px; font-size: 12px; font-weight: 700;
  }
  .tag-x { background: none; border: none; color: inherit; cursor: pointer; font-size: 15px; opacity: 0.6; padding: 0; line-height: 1; }
  .tag-x:hover { opacity: 1; }
  .tag-input {
    width: 90px; padding: 3px 9px; border-radius: 4px; border: 1.5px dashed var(--vscode-input-border);
    background: transparent; color: var(--vscode-input-foreground); font-size: 12px; font-family: inherit;
  }
  .tag-input:focus { outline: none; border-style: solid; }

  /* Logs */
  .log-pre {
    background: #0d1117; color: #e6edf3;
    border-left: 4px solid #30363d;
    border-radius: 0 6px 6px 0; padding: 11px 14px;
    font-size: 12px; white-space: pre-wrap; word-break: break-all;
    max-height: 200px; overflow-y: auto; margin-bottom: 8px;
    font-family: var(--vscode-editor-font-family, monospace); line-height: 1.55;
  }
  .log-details summary { font-size: 13px; font-weight: 600; color: var(--vscode-descriptionForeground); cursor: pointer; margin-bottom: 5px; }

  /* Screenshot */
  .screenshot-thumb {
    max-width: 280px; max-height: 180px; border-radius: 6px;
    border: 2px solid var(--vscode-widget-border);
    cursor: zoom-in; margin-bottom: 8px; display: block;
    object-fit: cover; transition: transform 0.15s;
  }
  .screenshot-thumb:hover { transform: scale(1.02); }

  /* Actions */
  .report-actions { display: flex; gap: 7px; margin-top: 10px; flex-wrap: wrap; }
  .btn {
    padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 13px; font-weight: 700; font-family: inherit; letter-spacing: 0.2px;
    transition: filter 0.12s, transform 0.1s;
  }
  .btn:hover { filter: brightness(1.15); }
  .btn:active { transform: scale(0.96); }
  .btn-close-ticket { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); }
  .btn-reopen       { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.35); }
  .btn-delete       { background: rgba(239,68,68,0.12);  color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .btn-bulk         { background: rgba(99,102,241,0.2);  color: #818cf8; border: 1px solid rgba(99,102,241,0.35); }
  .btn-bulk-danger  { background: rgba(239,68,68,0.12);  color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .btn-sm { padding: 5px 12px; font-size: 13px; }

  .btn-save-comment    { background: #4f46e5; color: #fff; }
  .btn-save-resolution { background: #d97706; color: #fff; }
  .btn-cancel-edit     { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn-refresh         { background: rgba(99,102,241,0.15); color: #818cf8; border: 1.5px solid rgba(99,102,241,0.3); }

  /* Empty state */
  .empty-state { text-align: center; padding: 60px 24px; color: var(--vscode-descriptionForeground); }
  .empty-icon  { font-size: 56px; margin-bottom: 14px; }
  .empty-state p { font-size: 16px; }

  /* Lightbox */
  #lightbox {
    display: none; position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.93); align-items: center; justify-content: center;
  }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: 96vw; max-height: 96vh; border-radius: 8px; object-fit: contain; }
  #lightbox-close { position: fixed; top: 16px; right: 20px; color: #fff; font-size: 36px; cursor: pointer; z-index: 10000; background: none; border: none; font-weight: 300; }
</style>
</head>
<body>

<!-- Lightbox -->
<div id="lightbox" onclick="hideLightbox()">
  <button id="lightbox-close" onclick="hideLightbox()">×</button>
  <img id="lightbox-img" src="" onclick="event.stopPropagation();window.open(this.src,'_blank')">
</div>

<!-- Header -->
<div class="page-header">
  <span class="page-title">🐛 Debug Logger</span>
  <div class="stat-pills">
    <span class="stat-pill stat-pill-all">All ${allTickets.length}</span>
    <span class="stat-pill stat-pill-open">Open ${totalOpen}</span>
    <span class="stat-pill stat-pill-closed">Closed ${totalClosed}</span>
    <span class="stat-pill stat-pill-admin">Admin ${totalAdmin}</span>
    <span class="stat-pill stat-pill-catalog">Catalog ${totalCatalog}</span>
  </div>
  <button class="btn btn-refresh" onclick="refresh()">↻ Refresh</button>
</div>

<!-- Filter bar -->
<div class="filter-bar">
  <button class="fbtn ${!filters.status && !filters.source && !filters.severity ? 'active-all' : ''}"
    onclick="setFilter({})">All (${allTickets.length})</button>
  <button class="fbtn ${filters.status === 0 && !filters.source ? 'active-open' : ''}"
    onclick="setFilter({status:0})">🔴 Open (${totalOpen})</button>
  <button class="fbtn ${filters.status === 1 && !filters.source ? 'active-closed' : ''}"
    onclick="setFilter({status:1})">⚫ Closed (${totalClosed})</button>

  <div class="sep"></div>

  <button class="fbtn ${filters.severity === 'bug' ? 'active-bug' : ''}"
    onclick="setFilter({severity:'bug',status:0})">🔴 Bugs (${allTickets.filter(t=>t.severity==='bug'&&t.status===0).length})</button>
  <button class="fbtn ${filters.severity === 'warning' ? 'active-warning' : ''}"
    onclick="setFilter({severity:'warning',status:0})">🟡 Warnings (${allTickets.filter(t=>t.severity==='warning'&&t.status===0).length})</button>
  <button class="fbtn ${filters.severity === 'info' ? 'active-info' : ''}"
    onclick="setFilter({severity:'info',status:0})">🔵 Info (${allTickets.filter(t=>t.severity==='info'&&t.status===0).length})</button>

  <div class="sep"></div>

  <button class="fbtn ${filters.source === 'admin' ? 'active-admin' : ''}"
    onclick="setFilter({source:'admin'})">Admin (${totalAdmin})</button>
  <button class="fbtn ${filters.source === 'catalog' ? 'active-catalog' : ''}"
    onclick="setFilter({source:'catalog'})">Catalog (${totalCatalog})</button>

  <span class="filter-count">${tickets.length} shown</span>

  ${uniqueTags.length > 0 ? `
  <div style="width:100%">
    <div class="tags-filter">
      <span class="tags-filter-label">Tags:</span>
      ${uniqueTags.map(tg => `
        <button class="fbtn ${filters.tag === tg ? 'active-tag' : ''}"
          onclick="setFilter({tag:'${esc(tg)}'})">
          ${esc(tg)}
        </button>`).join('')}
      ${filters.tag ? `<button class="fbtn" onclick="setFilter({})">× Clear</button>` : ''}
    </div>
  </div>` : ''}
</div>

<!-- Bulk bar -->
<div class="bulk-bar" id="bulk-bar">
  <input type="checkbox" id="cb-all" onchange="toggleAll(this)">
  <span class="bulk-count" id="bulk-count">0 selected</span>
  <button class="btn btn-bulk btn-sm" onclick="bulkAction('close')">Close Selected</button>
  <button class="btn btn-bulk btn-sm" onclick="bulkAction('open')">Reopen Selected</button>
  <button class="btn btn-bulk-danger btn-sm" onclick="bulkAction('delete')">Delete Selected</button>
</div>

<!-- Cards -->
<div id="cards">
${cardsHtml}
</div>

<script>
  const vscode = acquireVsCodeApi();
  let currentFilters = ${filterState};

  function refresh() {
    vscode.postMessage({ command: 'reload', filters: currentFilters });
  }

  function setFilter(f) {
    currentFilters = f;
    vscode.postMessage({ command: 'filter', filters: f });
  }

  function action(cmd, id) {
    vscode.postMessage({ command: cmd, id: id, filters: currentFilters });
  }

  /* ── Inline editing ── */
  function txtEsc(s) { var d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

  function startEdit(el) {
    if (el.querySelector('textarea')) return;
    const rid   = el.dataset.rid;
    const field = el.dataset.field;
    const isRes = field === 'resolution';
    const txt   = el.innerText.trim() === 'Click to add comment…' || el.innerText.trim() === 'Click to add resolution notes…'
                  ? '' : el.innerText;
    el.innerHTML =
      '<textarea>' + txtEsc(txt) + '</textarea>' +
      '<div class="inline-save-row">' +
        '<button class="btn ' + (isRes ? 'btn-save-resolution' : 'btn-save-comment') + ' btn-sm" onclick="saveEdit(this)">Save</button>' +
        '<button class="btn btn-cancel-edit btn-sm" onclick="cancelEdit(this)">Cancel</button>' +
      '</div>';
    const ta = el.querySelector('textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function saveEdit(btn) {
    const wrap = btn.closest('.inline-edit');
    const ta   = wrap.querySelector('textarea');
    const val  = ta.value;
    const rid  = parseInt(wrap.dataset.rid);
    const field= wrap.dataset.field;
    const cmd  = field === 'resolution' ? 'updateResolution' : 'updateComment';
    vscode.postMessage({ command: cmd, id: rid, value: val, filters: currentFilters });
    wrap.innerHTML = val
      ? val.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
      : '<span class="placeholder">' + (field==='resolution'?'Click to add resolution notes…':'Click to add comment…') + '</span>';
  }

  function cancelEdit(btn) {
    location.reload();
  }

  /* ── Tags ── */
  function addTag(input) {
    const tag = input.value.trim();
    if (!tag) return;
    const rid = parseInt(input.dataset.rid);
    input.value = '';
    vscode.postMessage({ command: 'addTag', id: rid, value: tag, filters: currentFilters });
  }

  function removeTag(rid, tagName) {
    vscode.postMessage({ command: 'removeTag', id: rid, value: tagName, filters: currentFilters });
  }

  /* ── Bulk ── */
  function getSelected() {
    return [...document.querySelectorAll('.cb-item:checked')].map(cb => parseInt(cb.value));
  }

  function updateBulk() {
    const ids = getSelected();
    const bar = document.getElementById('bulk-bar');
    bar.classList.toggle('visible', ids.length > 0);
    document.getElementById('bulk-count').textContent = ids.length + ' selected';
    document.getElementById('cb-all').indeterminate = ids.length > 0 && ids.length < document.querySelectorAll('.cb-item').length;
    document.getElementById('cb-all').checked = ids.length === document.querySelectorAll('.cb-item').length;
  }

  function toggleAll(master) {
    document.querySelectorAll('.cb-item').forEach(cb => cb.checked = master.checked);
    updateBulk();
  }

  function bulkAction(cmd) {
    const ids = getSelected();
    if (ids.length === 0) return;
    vscode.postMessage({ command: 'bulk' + cmd.charAt(0).toUpperCase() + cmd.slice(1), ids: ids, filters: currentFilters });
  }

  /* ── Lightbox ── */
  function showLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox').classList.add('open');
  }
  function hideLightbox() {
    document.getElementById('lightbox').classList.remove('open');
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideLightbox();
  });
</script>

</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
    }
}

interface ReportFilters {
    status?: number;
    source?: string;
    severity?: string;
    tag?: string;
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
