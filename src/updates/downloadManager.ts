/**
 * DevFlow Pro - Download Manager
 * Downloads .vsix files from the update server with progress reporting and hash verification
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export class DownloadManager {
    private downloadDir: string;

    constructor() {
        this.downloadDir = path.join(os.tmpdir(), 'devflow-updates');

        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    /**
     * Download a .vsix file from the given URL
     * @param url     HTTPS URL to the .vsix file
     * @param version Version string (used in filename)
     * @param expectedHash Optional SHA256 hash for integrity check
     * @returns Absolute path to the downloaded file
     */
    async download(url: string, version: string, expectedHash?: string): Promise<string> {
        if (!url.startsWith('https://')) {
            throw new Error('Download URL must use HTTPS');
        }

        const fileName = `devflow-pro-${version}.vsix`;
        const filePath = path.join(this.downloadDir, fileName);

        await this.downloadFile(url, filePath);

        if (expectedHash) {
            const valid = await this.verifyHash(filePath, expectedHash);
            if (!valid) {
                fs.unlinkSync(filePath);
                throw new Error('File hash verification failed — download may be corrupted');
            }
        }

        return filePath;
    }

    /**
     * Internal: download URL to file, following redirects
     */
    private async downloadFile(url: string, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const lib: typeof https = url.startsWith('https') ? https : http as any;

            const file = fs.createWriteStream(filePath);

            lib.get(url, {
                headers: { 'User-Agent': 'DevFlow-Pro-VSCode-Extension' }
            }, (response) => {
                // Follow redirect (301/302)
                if (
                    (response.statusCode === 301 || response.statusCode === 302) &&
                    response.headers.location
                ) {
                    file.close();
                    this.downloadFile(response.headers.location, filePath)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(filePath, () => { });
                    reject(new Error(`Download failed with HTTP ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(filePath, () => { });
                    reject(err);
                });
            }).on('error', (err) => {
                file.close();
                fs.unlink(filePath, () => { });
                reject(err);
            });
        });
    }

    /**
     * Verify SHA256 hash of a downloaded file
     */
    async verifyHash(filePath: string, expectedHash: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => {
                const actual = hash.digest('hex');
                resolve(actual === expectedHash);
            });
            stream.on('error', reject);
        });
    }

    /**
     * Remove a specific downloaded file after successful installation
     */
    async cleanup(filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.unlink(filePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Remove all files in the download cache directory
     */
    async cleanupAll(): Promise<void> {
        const files = fs.readdirSync(this.downloadDir);

        for (const file of files) {
            const filePath = path.join(this.downloadDir, file);
            fs.unlinkSync(filePath);
        }
    }
}
