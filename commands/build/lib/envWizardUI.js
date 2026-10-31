const {
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const catalog = require('./envWizardCatalog');

/**
 * Builds a select-menu option, marking it pre-selected when its value is in `selectedValues`.
 */
function buildOption(value, label, selectedValues) {
    const option = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
    if (selectedValues && selectedValues.includes(value)) {
        option.setDefault(true);
    }
    return option;
}

/**
 * Wraps a select menu in its own action row, with minValues 0 (nothing is required)
 * and maxValues equal to the number of offered options (multi-select).
 */
function buildSelectRow(customId, placeholder, options) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(Math.max(options.length, 1))
        .addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
}

function buildBoardCategoryRow() {
    const options = catalog.getBoardCategories().map((category) => buildOption(category.id, category.label));
    return buildSelectRow('envWizard:boardCategory', 'Board-Kategorie auswählen', options);
}

function buildBoardRow(categoryId) {
    const options = catalog.getBoardsByCategory(categoryId).map((board) => buildOption(board.id, board.label));
    return buildSelectRow('envWizard:board', 'Board auswählen', options);
}

function buildFeatureRow(selectedFlags) {
    const options = catalog.getFeatures().map((feature) => buildOption(feature.flag, feature.label, selectedFlags));
    return buildSelectRow('envWizard:features', 'Features deaktivieren (optional)', options);
}

function buildUsermodRows(selectedUsermods) {
    return catalog.getUsermodCategories().map((category) => {
        const options = catalog
            .getUsermodsByCategory(category.id)
            .map((usermod) => buildOption(usermod.id, usermod.label, selectedUsermods));
        return buildSelectRow(`envWizard:usermods:${category.id}`, category.label, options);
    });
}

function buildUsermodsNextRow() {
    const nextButton = new ButtonBuilder()
        .setCustomId('envWizard:usermodsNext')
        .setLabel('Weiter')
        .setStyle(ButtonStyle.Primary);
    const addUsermodButton = new ButtonBuilder()
        .setCustomId('envWizard:addUsermod')
        .setLabel('➕ Eigenes UserMod')
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder().addComponents(nextButton, addUsermodButton);
}

/**
 * Modal for adding one or more out-of-tree usermods (e.g. "name = https://github.com/...").
 * Submissions ADD to the session's existing external-usermod list - the field is intentionally
 * always empty when opened, never pre-filled with what was already added.
 */
function buildAddUsermodModal() {
    const input = new TextInputBuilder()
        .setCustomId('envWizard:externalUsermodsInput')
        .setLabel('Eigene UserMods (ein Eintrag pro Zeile)')
        .setPlaceholder('mein-mod = https://github.com/<user>/mein-mod.git')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
    const row = new ActionRowBuilder().addComponents(input);
    return new ModalBuilder().setCustomId('envWizard:addUsermodModal').setTitle('Eigenes UserMod hinzufügen').addComponents(row);
}

function buildReviewComponents(generatedIni) {
    const embed = new EmbedBuilder()
        .setTitle('Build-Umgebung – Vorschau')
        .setDescription(`\`\`\`ini\n${generatedIni}\n\`\`\``);

    const confirmButton = new ButtonBuilder()
        .setCustomId('envWizard:confirm')
        .setLabel('Bestätigen')
        .setStyle(ButtonStyle.Success);
    const restartButton = new ButtonBuilder()
        .setCustomId('envWizard:restart')
        .setLabel('Neu starten')
        .setStyle(ButtonStyle.Secondary);
    const cancelButton = new ButtonBuilder()
        .setCustomId('envWizard:cancel')
        .setLabel('Abbrechen')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(confirmButton, restartButton, cancelButton);

    return { embed, row };
}

module.exports = {
    buildBoardCategoryRow,
    buildBoardRow,
    buildFeatureRow,
    buildUsermodRows,
    buildUsermodsNextRow,
    buildAddUsermodModal,
    buildReviewComponents,
};
