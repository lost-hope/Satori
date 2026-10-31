const DEFAULT_ENV_NAME = 'custom_build';

function generateEnvIni({ boardId, selectedFeatureFlags, selectedUsermods, externalUsermods, envName } = {}) {
    // Validate required parameter
    if (!boardId) {
        throw new Error('boardId is required');
    }

    // Use provided envName or default
    const finalEnvName = envName || DEFAULT_ENV_NAME;

    // Initialize lines with header and extends
    const lines = [
        `[env:${finalEnvName}]`,
        `extends = env:${boardId}`,
    ];

    // Process usermods: catalog ("bare") usermods share one line, dedupe and sort; each external
    // usermod (a "name = url"/URL/owner-repo spec) needs its OWN continuation line - the sanitizer
    // classifies a custom_usermods line as either entirely bare tokens or exactly one external
    // entry, never a mix, so a bare token and an external spec can never share a line.
    const bareUsermods = selectedUsermods ? Array.from(new Set(selectedUsermods)).sort() : [];
    const externals = externalUsermods ? Array.from(new Set(externalUsermods)).sort() : [];
    if (bareUsermods.length > 0 || externals.length > 0) {
        lines.push(`custom_usermods = ${bareUsermods.join(' ')}`);
        for (const external of externals) {
            lines.push(`\t${external}`);
        }
    }

    // Process feature flags: dedupe, sort, and add with inheritance of board build_flags
    if (selectedFeatureFlags && selectedFeatureFlags.length > 0) {
        const deduped = Array.from(new Set(selectedFeatureFlags)).sort();
        lines.push(`build_flags = \${env:${boardId}.build_flags}`);
        for (const flag of deduped) {
            lines.push(`\t-D ${flag}`);
        }
    }

    return lines.join('\n') + '\n';
}

module.exports = { generateEnvIni, DEFAULT_ENV_NAME };
