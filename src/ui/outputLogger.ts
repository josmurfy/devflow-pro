/**
 * DevFlow Pro - Output Channel Logger
 * Provides visible logging in VS Code's Output panel
 */

import * as vscode from 'vscode';

export class OutputLogger {
    private static instance: OutputLogger | null = null;
    private channel: vscode.OutputChannel;

    private constructor() {
        this.channel = vscode.window.createOutputChannel('DevFlow Pro');
    }

    static getInstance(): OutputLogger {
        if (!OutputLogger.instance) {
            OutputLogger.instance = new OutputLogger();
        }
        return OutputLogger.instance;
    }

    info(message: string): void {
        this.log('INFO', message);
    }

    warn(message: string): void {
        this.log('WARN', message);
    }

    error(message: string): void {
        this.log('ERROR', message);
    }

    success(message: string): void {
        this.log('OK', message);
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    show(): void {
        this.channel.show(true);
    }

    getChannel(): vscode.OutputChannel {
        return this.channel;
    }

    dispose(): void {
        this.channel.dispose();
        OutputLogger.instance = null;
    }
}
