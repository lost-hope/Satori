const catalog = require('./envWizardCatalog');
const { generateEnvIni } = require('./envWizardGenerator');
const { createSession, getSession, updateSession, clearSession } = require('./envWizardState');
const envWizardUI = require('./envWizardUI');
const buildRunner = require('./buildRunner');
const buildQueue = require('./buildQueue');

const SESSION_EXPIRED_MESSAGE = 'Session abgelaufen, bitte `/buildenv` erneut ausführen';

/**
 * Components + content for the usermods step. Shared by every transition that (re-)renders this
 * step (entering it from "features", picking usermods within a category, and adding an external
 * usermod via the modal) so the "Eigene UserMods: ..." summary line never drifts out of sync.
 */
function buildUsermodsStepPayload(session) {
    return {
        content: session.externalUsermods.length > 0 ? `Eigene UserMods: ${session.externalUsermods.join(', ')}` : '',
        embeds: [],
        components: [...envWizardUI.buildUsermodRows(session.selectedUsermods), envWizardUI.buildUsermodsNextRow()],
    };
}

async function handleChatInput(interaction) {
    const { branch, error } = await buildRunner.resolveBranchOption(interaction);

    if (error) {
        await interaction.reply({
            embeds: [buildRunner.errorEmbed('❌', [{ name: 'Error', value: error }])],
        });
        return;
    }

    createSession(interaction.user.id, { branch });

    await interaction.reply({ components: [envWizardUI.buildBoardCategoryRow()], ephemeral: true });
}

async function handleComponent(interaction) {
    const userId = interaction.user.id;
    const session = getSession(userId);

    if (!session) {
        const payload = { content: SESSION_EXPIRED_MESSAGE, components: [], embeds: [] };
        if (typeof interaction.update === 'function') {
            await interaction.update(payload);
        } else {
            await interaction.reply(payload);
        }
        return;
    }

    const { customId } = interaction;

    if (customId === 'envWizard:boardCategory') {
        updateSession(userId, { boardCategoryId: interaction.values[0], step: 'board' });
        await interaction.update({ components: [envWizardUI.buildBoardRow(interaction.values[0])] });
        return;
    }

    if (customId === 'envWizard:board') {
        const board = catalog.getBoardById(interaction.values[0]);
        updateSession(userId, { boardId: board.id, selectedUsermods: [...board.defaultUsermods], step: 'features' });
        await interaction.update({ components: [envWizardUI.buildFeatureRow([])] });
        return;
    }

    if (customId === 'envWizard:features') {
        updateSession(userId, { selectedFeatureFlags: interaction.values, step: 'usermods' });
        await interaction.update(buildUsermodsStepPayload(getSession(userId)));
        return;
    }

    if (customId.startsWith('envWizard:usermods:')) {
        const categoryId = customId.split(':')[2];
        const categoryUsermodIds = catalog.getUsermodsByCategory(categoryId).map((u) => u.id);
        const retained = session.selectedUsermods.filter((id) => !categoryUsermodIds.includes(id));
        const selectedUsermods = [...retained, ...interaction.values];
        updateSession(userId, { selectedUsermods });
        await interaction.update(buildUsermodsStepPayload(getSession(userId)));
        return;
    }

    if (customId === 'envWizard:addUsermod') {
        await interaction.showModal(envWizardUI.buildAddUsermodModal());
        return;
    }

    if (customId === 'envWizard:usermodsNext') {
        const generatedIni = generateEnvIni({
            boardId: session.boardId,
            selectedFeatureFlags: session.selectedFeatureFlags,
            selectedUsermods: session.selectedUsermods,
            externalUsermods: session.externalUsermods,
        });
        updateSession(userId, { step: 'review', generatedIni });
        const { embed, row } = envWizardUI.buildReviewComponents(generatedIni);
        await interaction.update({ embeds: [embed], components: [row] });
        return;
    }

    if (customId === 'envWizard:confirm') {
        const { branch, generatedIni } = session;
        clearSession(userId);

        await interaction.update({ content: 'Queued...', embeds: [], components: [] });

        buildQueue.enqueue({
            label: `buildenv:${userId}:${Date.now()}`,
            onQueued: (position) => {
                safeEditReply(interaction, `⏳ Queued (position ${position}).`);
            },
            onStart: () => {
                safeEditReply(interaction, '🔧 Build started...');
            },
            run: () => buildRunner.runOneBuild(interaction, generatedIni, branch),
        });
        return;
    }

    if (customId === 'envWizard:restart') {
        const { branch } = session;
        createSession(userId, { branch });
        await interaction.update({ components: [envWizardUI.buildBoardCategoryRow()] });
        return;
    }

    if (customId === 'envWizard:cancel') {
        clearSession(userId);
        await interaction.update({ content: 'Abgebrochen.', embeds: [], components: [] });
        return;
    }

    const unknownStepPayload = {
        content: 'Unbekannter Schritt, bitte `/buildenv` erneut ausführen.',
        embeds: [],
        components: [],
    };
    if (typeof interaction.update === 'function') {
        await interaction.update(unknownStepPayload);
    } else {
        await interaction.reply(unknownStepPayload);
    }
}

async function handleModalSubmit(interaction) {
    const userId = interaction.user.id;
    const session = getSession(userId);

    if (!session) {
        const payload = { content: SESSION_EXPIRED_MESSAGE, components: [], embeds: [] };
        if (typeof interaction.update === 'function') {
            await interaction.update(payload);
        } else {
            await interaction.reply(payload);
        }
        return;
    }

    const rawText = interaction.fields.getTextInputValue('envWizard:externalUsermodsInput');
    const newLines = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const externalUsermods = Array.from(new Set([...session.externalUsermods, ...newLines]));

    updateSession(userId, { externalUsermods });
    await interaction.update(buildUsermodsStepPayload(getSession(userId)));
}

async function safeEditReply(interaction, payload) {
    try {
        await interaction.editReply(payload);
    } catch (err) {
        console.error('Konnte Discord-Antwort nicht aktualisieren:', err);
    }
}

module.exports = { handleChatInput, handleComponent, handleModalSubmit };
