/**
 * DevFlow Pro - Database Settings View
 * Webview panel for configuring the MySQL connection
 */

import * as vscode from 'vscode';
import { DatabaseConnection } from '../database/connection';
import { DatabaseConfig } from '../database/models';

export class SettingsView {
    private panel: vscode.WebviewPanel | null = null;

    constructor(
        private dbConnection: DatabaseConnection,
        private onConnected: () => void
    ) {}

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'debugLoggerSettings',
            'Debug Logger — Database Config',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const existing = await this.dbConnection.loadConfig();
        this.panel.webview.html = this.getHtml(existing);
        this.panel.onDidDispose(() => { this.panel = null; });
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    private async handleMessage(msg: any): Promise<void> {
        switch (msg.command) {
            case 'test': {
                const config = msg.config as DatabaseConfig;
                const result = await this.dbConnection.testConnection(config);
                this.panel?.webview.postMessage({
                    command: 'testResult',
                    ok: result.ok,
                    error: result.error
                });
                break;
            }
            case 'save': {
                const config = msg.config as DatabaseConfig;
                await this.dbConnection.saveConfig(config);
                try {
                    await this.dbConnection.connect(config);
                    this.onConnected();
                    vscode.window.showInformationMessage('Database connected successfully!');
                    this.panel?.dispose();
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
                }
                break;
            }
        }
    }

    private getHtml(existing: DatabaseConfig | null): string {
        const h = existing?.host || 'localhost';
        const p = existing?.port || 3306;
        const d = existing?.database || '';
        const u = existing?.user || '';
        const px = existing?.prefix || 'oc_';

        return /*html*/`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 500px; }
    h2 { margin-top: 0; }
    label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 13px; }
    input { width: 100%; padding: 6px 10px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 13px; box-sizing: border-box; }
    .row { display: flex; gap: 12px; }
    .row > div { flex: 1; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; margin-right: 8px; margin-top: 16px; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .result { margin-top: 12px; padding: 8px; border-radius: 4px; font-size: 13px; display: none; }
    .result.ok { display: block; background: #166534; color: #bbf7d0; }
    .result.error { display: block; background: #7f1d1d; color: #fecaca; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 2px; }
</style>
</head>
<body>

<h2>🔌 Database Connection</h2>
<p style="color: var(--vscode-descriptionForeground)">Connect to your OpenCart MySQL database to load Debug Logger tickets.</p>

<div class="row">
    <div>
        <label>Host</label>
        <input id="host" type="text" value="${h}" placeholder="localhost" />
    </div>
    <div style="max-width: 100px;">
        <label>Port</label>
        <input id="port" type="number" value="${p}" />
    </div>
</div>

<label>Database</label>
<input id="database" type="text" value="${d}" placeholder="opencart_db" />

<label>User</label>
<input id="user" type="text" value="${u}" placeholder="root" />

<label>Password</label>
<input id="password" type="password" value="" placeholder="••••••••" />
<p class="hint">Stored securely in VS Code's SecretStorage. Not saved in settings files.</p>

<label>Table Prefix</label>
<input id="prefix" type="text" value="${px}" placeholder="oc_" />

<div id="result" class="result"></div>

<button class="btn btn-secondary" onclick="testConnection()">🧪 Test Connection</button>
<button class="btn btn-primary" onclick="saveConfig()">💾 Save & Connect</button>

<script>
    const vscode = acquireVsCodeApi();

    function getConfig() {
        return {
            host: document.getElementById('host').value,
            port: parseInt(document.getElementById('port').value) || 3306,
            database: document.getElementById('database').value,
            user: document.getElementById('user').value,
            password: document.getElementById('password').value,
            prefix: document.getElementById('prefix').value || 'oc_'
        };
    }

    function testConnection() {
        const r = document.getElementById('result');
        r.className = 'result';
        r.style.display = 'block';
        r.textContent = '⏳ Testing...';
        vscode.postMessage({ command: 'test', config: getConfig() });
    }

    function saveConfig() {
        vscode.postMessage({ command: 'save', config: getConfig() });
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'testResult') {
            const r = document.getElementById('result');
            if (msg.ok) {
                r.className = 'result ok';
                r.textContent = '✅ Connection successful!';
            } else {
                r.className = 'result error';
                r.textContent = '❌ ' + (msg.error || 'Connection failed');
            }
        }
    });
</script>

</body>
</html>`;
    }
}
