const {
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
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
    const button = new ButtonBuilder()
        .setCustomId('envWizard:usermodsNext')
        .setLabel('Weiter')
        .setStyle(ButtonStyle.Primary);
    return new ActionRowBuilder().addComponents(button);
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
    buildReviewComponents,
};
