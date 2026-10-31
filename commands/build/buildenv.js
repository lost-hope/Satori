const { SlashCommandBuilder } = require('discord.js');
const envWizardRunner = require('./lib/envWizardRunner');
const buildRunner = require('./lib/buildRunner');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buildenv')
        .setDescription('Geführte Erstellung einer WLED-Build-Umgebung')
        .addStringOption((option) =>
            option
                .setName('branch')
                .setDescription('Branch or tag (default: repository default branch)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async execute(interaction) {
        await envWizardRunner.handleChatInput(interaction);
    },
    async autocomplete(interaction) {
        await buildRunner.autocompleteBranch(interaction);
    },
    async handleComponent(interaction) {
        await envWizardRunner.handleComponent(interaction);
    },
    async handleModalSubmit(interaction) {
        await envWizardRunner.handleModalSubmit(interaction);
    },
};
