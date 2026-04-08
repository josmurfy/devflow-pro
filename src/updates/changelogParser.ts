/**
 * DevFlow Pro - Changelog Parser
 * Parses CHANGELOG.md (Keep a Changelog format) to extract version sections
 */

export class ChangelogParser {
    /**
     * Extract a specific version section from CHANGELOG.md
     * Expected format:
     *   ## [1.2.0] - 2026-04-10
     *   ### Added
     *   - Feature 1
     *   ### Fixed
     *   - Bug fix 1
     */
    extractVersion(changelog: string, version: string): string {
        const lines = changelog.split('\n');

        let capturing = false;
        const result: string[] = [];

        for (const line of lines) {
            // Start capturing at the matching version header
            if (line.startsWith('## [') && line.includes(`[${version}]`)) {
                capturing = true;
                result.push(line);
                continue;
            }

            // Stop capturing at the next version header
            if (capturing && line.startsWith('## [') && !line.includes(`[${version}]`)) {
                break;
            }

            if (capturing) {
                result.push(line);
            }
        }

        return result.join('\n').trim();
    }

    /**
     * Extract all breaking changes from a changelog section
     */
    extractBreakingChanges(changelog: string): string[] {
        const breaking: string[] = [];
        const lines = changelog.split('\n');

        let inBreakingSection = false;

        for (const line of lines) {
            // Detect breaking changes section header
            if (/###\s+breaking/i.test(line)) {
                inBreakingSection = true;
                continue;
            }

            // Stop at the next section
            if (inBreakingSection && line.startsWith('### ')) {
                inBreakingSection = false;
            }

            // Collect bullet points in the breaking section
            if (inBreakingSection && line.startsWith('- ')) {
                breaking.push(line.substring(2).trim());
            }
        }

        return breaking;
    }

    /**
     * Generate a short summary from a changelog section (first N bullet points)
     */
    generateSummary(changelog: string, maxLength = 200): string {
        const lines = changelog.split('\n')
            .filter(l => l.startsWith('- '))
            .map(l => l.substring(2).trim());

        const summary = lines.slice(0, 3).join(', ');

        if (summary.length > maxLength) {
            return summary.substring(0, maxLength - 3) + '...';
        }

        return summary;
    }
}
