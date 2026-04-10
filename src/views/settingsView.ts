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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        min-height: 100vh;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 32px 16px;
    }
    .card {
        width: 100%;
        max-width: 520px;
        background: var(--vscode-sideBar-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .card-header {
        background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #0ea5e9 100%);
        padding: 28px 28px 24px;
        color: #fff;
    }
    .card-header .icon { font-size: 36px; margin-bottom: 8px; }
    .card-header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .card-header p { font-size: 14px; opacity: 0.85; margin-top: 4px; }

    .card-body { padding: 24px 28px 28px; }

    .field { margin-bottom: 18px; }
    .field label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 6px;
    }
    .field input {
        width: 100%;
        padding: 10px 14px;
        font-size: 15px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 2px solid var(--vscode-input-border);
        border-radius: 10px;
        font-family: inherit;
        transition: border-color 0.15s;
        outline: none;
    }
    .field input:focus { border-color: #7c3aed; }
    .hint { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px; }

    .row { display: flex; gap: 12px; }
    .row .field { flex: 1; }
    .row .field.small { flex: 0 0 100px; }

    .divider { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 20px 0; }

    .result {
        margin: 16px 0 0;
        padding: 12px 16px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        display: none;
    }
    .result.ok { display: flex; align-items: center; gap: 8px; background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
    .result.error { display: flex; align-items: center; gap: 8px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
    .result.loading { display: flex; align-items: center; gap: 8px; background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); }

    .buttons { display: flex; gap: 10px; margin-top: 20px; }
    .btn {
        flex: 1;
        padding: 12px 16px;
        font-size: 15px;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-family: inherit;
        transition: opacity 0.15s, transform 0.1s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { transform: scale(0.98); }
    .btn-test {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 2px solid var(--vscode-widget-border);
    }
    .btn-save {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        color: #fff;
    }
    .btn-save:hover { opacity: 0.85; }
</style>
</head>
<body>
<div class="card">
    <div class="card-header">
        <div class="icon">🔌</div>
        <h1>Database Connection</h1>
        <p>Connect to your OpenCart MySQL database to access Debug Logger tickets.</p>
    </div>
    <div class="card-body">

        <div class="row">
            <div class="field">
                <label>Host</label>
                <input id="host" type="text" value="${h}" placeholder="localhost" />
            </div>
            <div class="field small">
                <label>Port</label>
                <input id="port" type="number" value="${p}" />
            </div>
        </div>

        <div class="field">
            <label>Database Name</label>
            <input id="database" type="text" value="${d}" placeholder="opencart_db" />
        </div>

        <div class="field">
            <label>Username</label>
            <input id="user" type="text" value="${u}" placeholder="root" />
        </div>

        <div class="field">
            <label>Password</label>
            <input id="password" type="password" value="" placeholder="••••••••" />
            <p class="hint">🔐 Stored securely in VS Code's SecretStorage — never in plain text.</p>
        </div>

        <hr class="divider">

        <div class="field">
            <label>Table Prefix</label>
            <input id="prefix" type="text" value="${px}" placeholder="oc_" />
            <p class="hint">Usually <strong>oc_</strong> for OpenCart installations.</p>
        </div>

        <div id="result" class="result"></div>

        <div class="buttons">
            <button class="btn btn-test" onclick="testConnection()">🧪 Test</button>
            <button class="btn btn-save" onclick="saveConfig()">💾 Save &amp; Connect</button>
        </div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();

    function getConfig() {
        return {
            host: document.getElementById('host').value.trim(),
            port: parseInt(document.getElementById('port').value) || 3306,
            database: document.getElementById('database').value.trim(),
            user: document.getElementById('user').value.trim(),
            password: document.getElementById('password').value,
            prefix: document.getElementById('prefix').value.trim() || 'oc_'
        };
    }

    function setResult(className, icon, text) {
        const r = document.getElementById('result');
        r.className = 'result ' + className;
        r.innerHTML = '<span>' + icon + '</span><span>' + text + '</span>';
    }

    function testConnection() {
        setResult('loading', '⏳', 'Testing connection...');
        vscode.postMessage({ command: 'test', config: getConfig() });
    }

    function saveConfig() {
        vscode.postMessage({ command: 'save', config: getConfig() });
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'testResult') {
            if (msg.ok) {
                setResult('ok', '✅', 'Connection successful!');
            } else {
                setResult('error', '❌', msg.error || 'Connection failed');
            }
        }
    });
</script>
</body>
</html>`;
    }
}
