const { SlashCommandBuilder } = require('discord.js');
const buildRunner = require('./lib/buildRunner');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('WLED Build Bot')
        .addStringOption((option) =>
            option
                .setName('branch')
                .setDescription('Branch or tag (default: repository default branch)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            await buildRunner.handleChatInput(interaction);
        } else if (interaction.isModalSubmit()) {
            await buildRunner.handleModalSubmit(interaction);
        }
    },
    async autocomplete(interaction) {
        await buildRunner.autocompleteBranch(interaction);
    },
};
