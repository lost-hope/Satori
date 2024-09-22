const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forum')
        .setDescription('WLED Discourse Forum'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Discourse Forum')
            .setURL('https://wled.discourse.group')
            .setThumbnail('https://canada1.discourse-cdn.com/free1/uploads/wled/original/2X/7/763d13f95d4624b9f36f6e708a344b3b0b1b7ae6.png');
        await interaction.reply({ embeds: [embed] });
    },
};