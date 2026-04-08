/**
 * DevFlow Pro - Version Checker
 * Fetches the latest version from the VS Code Marketplace public API (no auth needed)
 */

import * as https from 'https';
import { UpdateInfo } from './models';

const PUBLISHER = 'josmurfy';
const EXTENSION_NAME = 'devflow-pro';

export class VersionChecker {
    constructor(private channel: 'stable' | 'beta') {}

    /**
     * Query the VS Code Marketplace gallery API for the latest published version.
     * This is a public endpoint — no authentication required.
     */
    async getLatestVersion(): Promise<UpdateInfo | null> {
        const body = JSON.stringify({
            filters: [{
                criteria: [
                    { filterType: 7, value: `${PUBLISHER}.${EXTENSION_NAME}` }
                ]
            }],
            flags: 529
        });

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'marketplace.visualstudio.com',
                path: '/_apis/public/gallery/extensionquery',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json;api-version=7.1-preview.1',
                    'User-Agent': 'DevFlow-Pro-VSCode-Extension',
                    'Content-Length': Buffer.byteLength(body)
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
                        const json = JSON.parse(data);
                        const ext = json?.results?.[0]?.extensions?.[0];
                        if (!ext) { resolve(null); return; }

                        const latestVersion = ext.versions?.[0];
                        if (!latestVersion) { resolve(null); return; }

                        const version = String(latestVersion.version);

                        // Download URL: direct .vsix from the Marketplace CDN
                        const downloadUrl =
                            `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/` +
                            `${PUBLISHER}/vsextensions/${EXTENSION_NAME}/${version}/vspackage`;

                        resolve({
                            version,
                            downloadUrl,
                            releaseDate: String(latestVersion.lastUpdated ?? ''),
                            changelog: '',
                            minVSCodeVersion: '^1.85.0',
                            breaking: false
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    /**
     * Fetch from GitHub Releases API — only works if the repo is PUBLIC
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
                        if (res.statusCode !== 200) { resolve(null); return; }
                        const release = JSON.parse(data);
                        const vsixAsset = release.assets?.find(
                            (a: any) => typeof a.name === 'string' && a.name.endsWith('.vsix')
                        );
                        if (!vsixAsset) { resolve(null); return; }
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
