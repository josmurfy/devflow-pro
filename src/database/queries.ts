/**
 * DevFlow Pro - Debug Logger SQL Queries
 * All database operations for the Debug Logger system
 */

import mysql from 'mysql2/promise';
import { DebugReport, TicketFilters, HistoryEntry, TicketStats } from './models';

export class DebugLoggerQueries {

    constructor(private pool: mysql.Pool, private prefix: string) {}

    // ─────────────────────────────────────────────────────────
    // TICKETS
    // ─────────────────────────────────────────────────────────

    async getTickets(filters: TicketFilters = {}): Promise<DebugReport[]> {
        let query = `
            SELECT r.*,
                   GROUP_CONCAT(t.tag_name) as tags,
                   u.username as assigned_username
            FROM ${this.prefix}debug_report r
            LEFT JOIN ${this.prefix}debug_logger_tags t ON r.id = t.report_id
            LEFT JOIN ${this.prefix}user u ON r.assigned_to = u.user_id
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        if (filters.status !== undefined) {
            query += ` AND r.status = ?`;
            params.push(filters.status);
        }
        if (filters.severity) {
            query += ` AND r.severity = ?`;
            params.push(filters.severity);
        }
        if (filters.source) {
            query += ` AND r.source = ?`;
            params.push(filters.source);
        }
        if (filters.assignedTo) {
            query += ` AND r.assigned_to = ?`;
            params.push(filters.assignedTo);
        }
        if (filters.search) {
            query += ` AND (r.url LIKE ? OR r.comment LIKE ? OR r.console_log LIKE ? OR r.resolution LIKE ?)`;
            const s = `%${filters.search}%`;
            params.push(s, s, s, s);
        }

        query += ` GROUP BY r.id ORDER BY r.id DESC`;

        if (filters.limit) {
            query += ` LIMIT ?`;
            params.push(filters.limit);
            if (filters.offset) {
                query += ` OFFSET ?`;
                params.push(filters.offset);
            }
        }

        const [rows] = await this.pool.execute(query, params);
        return rows as DebugReport[];
    }

    async getTicketById(id: number): Promise<DebugReport | null> {
        const [rows] = await this.pool.execute(
            `SELECT r.*,
                    GROUP_CONCAT(t.tag_name) as tags,
                    u.username as assigned_username
             FROM ${this.prefix}debug_report r
             LEFT JOIN ${this.prefix}debug_logger_tags t ON r.id = t.report_id
             LEFT JOIN ${this.prefix}user u ON r.assigned_to = u.user_id
             WHERE r.id = ?
             GROUP BY r.id`,
            [id]
        );
        const result = rows as DebugReport[];
        return result.length > 0 ? result[0] : null;
    }

    async closeTicket(id: number): Promise<void> {
        await this.pool.execute(
            `UPDATE ${this.prefix}debug_report SET status = 1 WHERE id = ?`, [id]
        );
        await this.addHistory({
            report_id: id,
            action: 'closed',
            field_changed: 'status',
            old_value: '0',
            new_value: '1',
            changed_by: this.getCurrentUser()
        });
    }

    async reopenTicket(id: number): Promise<void> {
        await this.pool.execute(
            `UPDATE ${this.prefix}debug_report SET status = 0 WHERE id = ?`, [id]
        );
        await this.addHistory({
            report_id: id,
            action: 'reopened',
            field_changed: 'status',
            old_value: '1',
            new_value: '0',
            changed_by: this.getCurrentUser()
        });
    }

    async updateResolution(id: number, resolution: string): Promise<void> {
        const ticket = await this.getTicketById(id);
        await this.pool.execute(
            `UPDATE ${this.prefix}debug_report SET resolution = ? WHERE id = ?`,
            [resolution, id]
        );
        await this.addHistory({
            report_id: id,
            action: 'updated',
            field_changed: 'resolution',
            old_value: ticket?.resolution || '',
            new_value: resolution,
            changed_by: this.getCurrentUser()
        });
    }

    async updateComment(id: number, comment: string): Promise<void> {
        const ticket = await this.getTicketById(id);
        await this.pool.execute(
            `UPDATE ${this.prefix}debug_report SET comment = ? WHERE id = ?`,
            [comment, id]
        );
        await this.addHistory({
            report_id: id,
            action: 'updated',
            field_changed: 'comment',
            old_value: ticket?.comment || '',
            new_value: comment,
            changed_by: this.getCurrentUser()
        });
    }

    async deleteTicket(id: number): Promise<void> {
        await this.pool.execute(`DELETE FROM ${this.prefix}debug_logger_tags WHERE report_id = ?`, [id]);
        await this.pool.execute(`DELETE FROM ${this.prefix}debug_logger_history WHERE report_id = ?`, [id]);
        await this.pool.execute(`DELETE FROM ${this.prefix}debug_report WHERE id = ?`, [id]);
    }

    // ─────────────────────────────────────────────────────────
    // TAGS
    // ─────────────────────────────────────────────────────────

    async addTag(reportId: number, tagName: string): Promise<void> {
        await this.pool.execute(
            `INSERT INTO ${this.prefix}debug_logger_tags (report_id, tag_name) VALUES (?, ?)`,
            [reportId, tagName]
        );
    }

    async removeTag(reportId: number, tagName: string): Promise<void> {
        await this.pool.execute(
            `DELETE FROM ${this.prefix}debug_logger_tags WHERE report_id = ? AND tag_name = ?`,
            [reportId, tagName]
        );
    }

    // ─────────────────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────────────────

    async getHistory(reportId: number): Promise<HistoryEntry[]> {
        const [rows] = await this.pool.execute(
            `SELECT * FROM ${this.prefix}debug_logger_history WHERE report_id = ? ORDER BY changed_at DESC`,
            [reportId]
        );
        return rows as HistoryEntry[];
    }

    async addHistory(entry: Partial<HistoryEntry>): Promise<void> {
        try {
            await this.pool.execute(
                `INSERT INTO ${this.prefix}debug_logger_history
                 (report_id, action, field_changed, old_value, new_value, changed_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    entry.report_id ?? 0,
                    entry.action || '',
                    entry.field_changed || null,
                    entry.old_value || null,
                    entry.new_value || null,
                    entry.changed_by || this.getCurrentUser()
                ] as (string | number | null)[]
            );
        } catch {
            // History table may not exist yet — fail silently
        }
    }

    async ensureHistoryTable(): Promise<void> {
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS ${this.prefix}debug_logger_history (
                history_id INT AUTO_INCREMENT PRIMARY KEY,
                report_id INT NOT NULL,
                action VARCHAR(50) NOT NULL,
                field_changed VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                changed_by VARCHAR(255),
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_report (report_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    }

    // ─────────────────────────────────────────────────────────
    // STATS
    // ─────────────────────────────────────────────────────────

    async getStats(): Promise<TicketStats> {
        const [rows] = await this.pool.execute(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN severity = 'bug' AND status = 0 THEN 1 ELSE 0 END) as bugs,
                SUM(CASE WHEN severity = 'warning' AND status = 0 THEN 1 ELSE 0 END) as warnings,
                SUM(CASE WHEN severity = 'info' AND status = 0 THEN 1 ELSE 0 END) as infos
            FROM ${this.prefix}debug_report
        `);
        const row = (rows as any[])[0];
        return {
            total: Number(row.total) || 0,
            open: Number(row.open_count) || 0,
            closed: Number(row.closed) || 0,
            bugs: Number(row.bugs) || 0,
            warnings: Number(row.warnings) || 0,
            infos: Number(row.infos) || 0
        };
    }

    async getAllTags(): Promise<string[]> {
        const [rows] = await this.pool.execute(
            `SELECT DISTINCT tag_name FROM ${this.prefix}debug_logger_tags ORDER BY tag_name`
        );
        return (rows as any[]).map(r => r.tag_name);
    }

    async updateField(id: number, field: string, value: string): Promise<void> {
        const allowed = ['severity', 'status', 'source'];
        if (!allowed.includes(field)) { return; }
        await this.pool.execute(
            `UPDATE ${this.prefix}debug_report SET ${field} = ? WHERE id = ?`,
            [value, id]
        );
    }

    private getCurrentUser(): string {
        return process.env.USER || process.env.USERNAME || 'vscode-user';
    }
}
