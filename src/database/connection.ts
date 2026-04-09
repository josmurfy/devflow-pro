/**
 * DevFlow Pro - Database Connection
 * Manages MySQL connection pool with SecretStorage for credentials
 */

import * as vscode from 'vscode';
import mysql from 'mysql2/promise';
import { DatabaseConfig } from './models';

export class DatabaseConnection {
    private pool: mysql.Pool | null = null;
    private config: DatabaseConfig | null = null;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Load config from globalState + SecretStorage
     */
    async loadConfig(): Promise<DatabaseConfig | null> {
        const host = this.context.globalState.get<string>('debugLogger.db.host');
        if (!host) { return null; }

        const password = await this.context.secrets.get('debugLogger.db.password') || '';

        this.config = {
            host,
            port: this.context.globalState.get<number>('debugLogger.db.port', 3306),
            database: this.context.globalState.get<string>('debugLogger.db.database', ''),
            user: this.context.globalState.get<string>('debugLogger.db.user', ''),
            password,
            prefix: this.context.globalState.get<string>('debugLogger.db.prefix', 'oc_')
        };

        return this.config;
    }

    /**
     * Save config to globalState + SecretStorage
     */
    async saveConfig(config: DatabaseConfig): Promise<void> {
        this.config = config;
        await this.context.globalState.update('debugLogger.db.host', config.host);
        await this.context.globalState.update('debugLogger.db.port', config.port);
        await this.context.globalState.update('debugLogger.db.database', config.database);
        await this.context.globalState.update('debugLogger.db.user', config.user);
        await this.context.globalState.update('debugLogger.db.prefix', config.prefix);
        await this.context.secrets.store('debugLogger.db.password', config.password);
    }

    /**
     * Connect to the database using stored config
     */
    async connect(config?: DatabaseConfig): Promise<void> {
        const cfg = config || this.config || await this.loadConfig();
        if (!cfg) {
            throw new Error('No database configuration found. Run "Debug Logger: Configure Database" first.');
        }

        if (this.pool) {
            await this.pool.end();
        }

        this.pool = mysql.createPool({
            host: cfg.host,
            port: cfg.port,
            database: cfg.database,
            user: cfg.user,
            password: cfg.password,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            connectTimeout: 10000
        });
    }

    /**
     * Test the connection — returns true/false + error message
     */
    async testConnection(config?: DatabaseConfig): Promise<{ ok: boolean; error?: string }> {
        let tempPool: mysql.Pool | null = null;
        try {
            const cfg = config || this.config;
            if (!cfg) { return { ok: false, error: 'No config' }; }

            tempPool = mysql.createPool({
                host: cfg.host,
                port: cfg.port,
                database: cfg.database,
                user: cfg.user,
                password: cfg.password,
                connectionLimit: 1,
                connectTimeout: 5000
            });

            await tempPool.query('SELECT 1');
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: err.message || String(err) };
        } finally {
            if (tempPool) {
                await tempPool.end().catch(() => {});
            }
        }
    }

    getPool(): mysql.Pool {
        if (!this.pool) { throw new Error('Database not connected'); }
        return this.pool;
    }

    getPrefix(): string {
        return this.config?.prefix || 'oc_';
    }

    isConnected(): boolean {
        return this.pool !== null;
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}
