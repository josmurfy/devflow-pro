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
        const platform = process.platform;

        if (platform === 'darwin') {
            // Check both standard and Insiders paths
            const paths = [
                '/usr/local/bin/code',
                '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
            ];
            return paths.find((p) => { try { fs.accessSync(p); return true; } catch { return false; } }) ?? null;
        }

        if (platform === 'win32') {
            const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
            const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
            const paths = [
                `${programFiles}\\Microsoft VS Code\\bin\\code.cmd`,
                `${programFilesX86}\\Microsoft VS Code\\bin\\code.cmd`
            ];
            return paths.find((p) => { try { fs.accessSync(p); return true; } catch { return false; } }) ?? null;
        }

        // Linux
        const paths = ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code'];
        return paths.find((p) => { try { fs.accessSync(p); return true; } catch { return false; } }) ?? null;
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
