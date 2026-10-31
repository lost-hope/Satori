const DEFAULT_ENV_NAME = 'custom_build';

function generateEnvIni({ boardId, selectedFeatureFlags, selectedUsermods, envName } = {}) {
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

    // Process usermods: dedupe and sort
    if (selectedUsermods && selectedUsermods.length > 0) {
        const deduped = Array.from(new Set(selectedUsermods)).sort();
        lines.push(`custom_usermods = ${deduped.join(' ')}`);
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
