/**
 * DevFlow Pro - Debug Logger Models
 * TypeScript interfaces matching the OpenCart debug_logger database schema
 */

export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    prefix: string;
}

export interface DebugReport {
    id: number;
    url: string;
    console_log: string | null;
    network_log: string | null;
    screenshot: string | null;
    comment: string;
    resolution: string | null;
    admin_user: string;
    assigned_to: number | null;
    assigned_username?: string;
    severity: 'bug' | 'warning' | 'info';
    source: 'admin' | 'catalog';
    status: number; // 0 = open, 1 = closed
    date_added: string;
    tags?: string; // comma-separated from GROUP_CONCAT
}

export interface TicketFilters {
    status?: number;
    severity?: 'bug' | 'warning' | 'info';
    source?: 'admin' | 'catalog';
    assignedTo?: number;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface HistoryEntry {
    history_id?: number;
    report_id: number;
    action: string;
    field_changed?: string;
    old_value?: string;
    new_value?: string;
    changed_by: string;
    changed_at?: string;
}

export interface TicketStats {
    total: number;
    open: number;
    closed: number;
    bugs: number;
    warnings: number;
    infos: number;
}
