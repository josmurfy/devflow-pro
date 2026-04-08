/**
 * DevFlow Pro - Version Checker
 * Fetches the latest version info from the update server or GitHub Releases API
 */

import * as https from 'https';
import { UpdateInfo } from './models';

export class VersionChecker {
    private updateServerUrl: string;

    constructor(private channel: 'stable' | 'beta') {
        this.updateServerUrl = this.getUpdateServerUrl();
    }

    private getUpdateServerUrl(): string {
        const baseUrl = 'https://www.phoenixdepot.com/devflow/updates';
        return `${baseUrl}/${this.channel}/manifest.json`;
    }

    /**
     * Fetch latest version from the custom update server manifest
     */
    async getLatestVersion(): Promise<UpdateInfo | null> {
        if (!this.updateServerUrl.startsWith('https://')) {
            throw new Error('Update server must use HTTPS');
        }

        return new Promise((resolve, reject) => {
            https.get(this.updateServerUrl, {
                headers: { 'User-Agent': 'DevFlow-Pro-VSCode-Extension' }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => data += chunk);

                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            resolve(null);
                            return;
                        }
                        const manifest = JSON.parse(data);
                        resolve(this.parseManifest(manifest));
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Parse raw server manifest JSON into UpdateInfo
     */
    private parseManifest(manifest: any): UpdateInfo {
        return {
            version: String(manifest.version),
            downloadUrl: String(manifest.downloadUrl),
            releaseDate: String(manifest.releaseDate),
            changelog: String(manifest.changelog ?? ''),
            minVSCodeVersion: String(manifest.minVSCodeVersion ?? '^1.85.0'),
            breaking: Boolean(manifest.breaking),
            sha256: manifest.sha256 ? String(manifest.sha256) : undefined,
            size: manifest.size ? Number(manifest.size) : undefined
        };
    }

    /**
     * Alternative: Fetch from GitHub Releases API (uses latest release tag)
     * Uses repo: josmurfy/devflow-pro
     */
    async getLatestFromGitHub(): Promise<UpdateInfo | null> {
        const githubApi = 'https://api.github.com/repos/josmurfy/devflow-pro/releases/latest';

        return new Promise((resolve, reject) => {
            https.get(githubApi, {
                headers: {
                    'User-Agent': 'DevFlow-Pro-VSCode-Extension',
                    'Accept': 'application/vnd.github.v3+json'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => data += chunk);

                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            resolve(null);
                            return;
                        }

                        const release = JSON.parse(data);

                        // Find the .vsix asset in the release
                        const vsixAsset = release.assets?.find(
                            (a: any) => typeof a.name === 'string' && a.name.endsWith('.vsix')
                        );

                        if (!vsixAsset) {
                            resolve(null);
                            return;
                        }

                        resolve({
                            version: String(release.tag_name).replace(/^v/, ''),
                            downloadUrl: String(vsixAsset.browser_download_url),
                            releaseDate: String(release.published_at),
                            changelog: String(release.body ?? ''),
                            minVSCodeVersion: '^1.85.0',
                            breaking: String(release.body ?? '').toLowerCase().includes('breaking'),
                            size: Number(vsixAsset.size)
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on('error', reject);
        });
    }
}
