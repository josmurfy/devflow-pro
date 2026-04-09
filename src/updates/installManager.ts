/**
 * DevFlow Pro - Install Manager
 * Installs .vsix packages using the VS Code CLI
 */

import * as cp from 'child_process';
import * as util from 'util';
import * as fs from 'fs';

const exec = util.promisify(cp.exec);

export class InstallManager {
    /**
     * Install a .vsix file into VS Code
     */
    async install(vsixPath: string): Promise<void> {
        if (!fs.existsSync(vsixPath)) {
            throw new Error(`VSIX file not found: ${vsixPath}`);
        }

        const codeCommand = this.getCodeCommand();

        if (!codeCommand) {
            // Fallback: try internal command (not guaranteed across all versions)
            await this.installViaInternalCommand(vsixPath);
            return;
        }

        await this.installViaCLI(vsixPath, codeCommand);
    }

    /**
     * Install using the 'code' CLI: code --install-extension /path/to/ext.vsix
     */
    private async installViaCLI(vsixPath: string, codeCommand: string): Promise<void> {
        const { stdout, stderr } = await exec(
            `"${codeCommand}" --install-extension "${vsixPath}" --force`
        );

        // VS Code CLI writes success to stderr in some versions
        const output = stdout + stderr;
        if (!output.toLowerCase().includes('successfully installed') && stderr && !stdout) {
            throw new Error(`CLI install error: ${stderr}`);
        }

        console.log('DevFlow Pro: extension installed via CLI:', stdout.trim());
    }

    /**
     * Fallback: install using VS Code internal command (experimental)
     */
    private async installViaInternalCommand(vsixPath: string): Promise<void> {
        // vscode.commands.executeCommand does not expose install natively
        // This is a best-effort path — no-op if unavailable
        throw new Error(
            'VS Code CLI not found. Please install the extension manually: ' + vsixPath
        );
    }

    /**
     * Detect the VS Code executable path based on the current platform
     */
    private getCodeCommand(): string | null {
        // 1. Try the PATH first (most common on desktop installs)
        try {
            const result = cp.execSync('which code 2>/dev/null || where code 2>nul', { encoding: 'utf8' }).trim();
            if (result && fs.existsSync(result)) { return result; }
        } catch { /* ignore */ }

        const platform = process.platform;

        // 2. Standard desktop paths
        const standardPaths: string[] = [];

        if (platform === 'darwin') {
            standardPaths.push(
                '/usr/local/bin/code',
                '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
            );
        } else if (platform === 'win32') {
            const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';
            const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
            standardPaths.push(
                `${pf}\\Microsoft VS Code\\bin\\code.cmd`,
                `${pf86}\\Microsoft VS Code\\bin\\code.cmd`
            );
        } else {
            // Linux standard
            standardPaths.push('/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code');
        }

        for (const p of standardPaths) {
            try { fs.accessSync(p); return p; } catch { /* skip */ }
        }

        // 3. VS Code Server remote-cli (Linux VPS / SSH remote development)
        // Pattern: ~/.vscode-server/cli/servers/Stable-*/server/bin/remote-cli/code
        const vscodeServerRoots = [
            process.env['HOME'],
            '/root',
            '/home/' + (process.env['USER'] ?? '')
        ].filter(Boolean) as string[];

        for (const root of vscodeServerRoots) {
            const cliDir = `${root}/.vscode-server/cli/servers`;
            if (!fs.existsSync(cliDir)) { continue; }

            try {
                // Get all Stable-* entries sorted by mtime descending (most recent first)
                const entries = fs.readdirSync(cliDir)
                    .filter(e => e.startsWith('Stable-'))
                    .map(e => ({ name: e, mtime: fs.statSync(`${cliDir}/${e}`).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime);

                for (const entry of entries) {
                    const codePath = `${cliDir}/${entry.name}/server/bin/remote-cli/code`;
                    try { fs.accessSync(codePath); return codePath; } catch { /* skip */ }
                }
            } catch { /* skip */ }
        }

        return null;
    }

    /**
     * Uninstall the current extension by its extension ID
     */
    async uninstall(extensionId: string): Promise<void> {
        const codeCommand = this.getCodeCommand();

        if (!codeCommand) {
            throw new Error('VS Code CLI not found — cannot uninstall extension');
        }

        await exec(`"${codeCommand}" --uninstall-extension ${extensionId}`);
    }
}
