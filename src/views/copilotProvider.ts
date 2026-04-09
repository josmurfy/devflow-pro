/**
 * DevFlow Pro - Copilot Integration
 * Injects debug ticket context into GitHub Copilot Chat
 */

import * as vscode from 'vscode';
import { DebugReport } from '../database/models';
import { DebugLoggerQueries } from '../database/queries';

export class CopilotProvider {

    constructor(private queries: DebugLoggerQueries) {}

    /**
     * Open Copilot Chat with the full ticket context pre-injected
     */
    async sendTicketToCopilot(ticketId: number): Promise<void> {
        const ticket = await this.queries.getTicketById(ticketId);
        if (!ticket) {
            vscode.window.showErrorMessage(`Ticket #${ticketId} not found.`);
            return;
        }

        const prompt = this.buildPrompt(ticket);

        // Try the chat API — works in VS Code 1.85+ with Copilot
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: prompt
            });
        } catch {
            // Fallback: copy to clipboard
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
                'Copilot Chat not available. Ticket context copied to clipboard — paste it in any AI chat.'
            );
        }
    }

    private buildPrompt(ticket: DebugReport): string {
        const lines: string[] = [
            `# Debug Ticket #${ticket.id} — ${ticket.severity.toUpperCase()}`,
            '',
            '## Context',
            `- **URL**: ${ticket.url}`,
            `- **Source**: ${ticket.source}`,
            `- **Date**: ${ticket.date_added}`,
            `- **Reporter**: ${ticket.admin_user}`,
            ticket.assigned_username ? `- **Assigned to**: ${ticket.assigned_username}` : '',
            ticket.tags ? `- **Tags**: ${ticket.tags}` : '',
            '',
            '## User Report',
            ticket.comment || '(no comment)',
            ''
        ];

        if (ticket.console_log) {
            lines.push(
                '## Console Errors',
                '```javascript',
                ticket.console_log,
                '```',
                ''
            );
        }

        if (ticket.network_log) {
            lines.push(
                '## Network Errors',
                '```json',
                ticket.network_log,
                '```',
                ''
            );
        }

        if (ticket.resolution) {
            lines.push(
                '## Resolution Notes',
                ticket.resolution,
                ''
            );
        }

        lines.push(
            '---',
            '',
            '**Task**: Analyze this bug report and suggest:',
            '1. The likely root cause',
            '2. The file(s) that need to be modified (OpenCart 4.x structure)',
            '3. A code fix with explanation',
            '4. Any preventive measures',
            '',
            'Focus on OpenCart 4.x PHP / JavaScript / Twig context.',
            'Admin routes map to: administrator/controller/{route}.php',
            'Catalog routes map to: catalog/controller/{route}.php'
        );

        return lines.filter(l => l !== undefined).join('\n');
    }

    /**
     * Detect likely related files from the ticket URL and console log
     */
    detectRelatedFiles(ticket: DebugReport): string[] {
        const files: string[] = [];

        // Parse OpenCart route from URL
        const routeMatch = ticket.url.match(/route=([^&]+)/);
        if (routeMatch) {
            const route = routeMatch[1].replace(/\|/g, '/');
            const prefix = ticket.source === 'admin' ? 'administrator' : 'catalog';
            files.push(`${prefix}/controller/${route}.php`);
            files.push(`${prefix}/model/${route}.php`);
            files.push(`${prefix}/view/template/${route}.twig`);
        }

        // Parse file references from console_log
        if (ticket.console_log) {
            const fileRefs = ticket.console_log.match(/[\w/.-]+\.(?:php|js|twig)/gi);
            if (fileRefs) {
                files.push(...fileRefs);
            }
        }

        // Deduplicate
        return [...new Set(files)];
    }
}
