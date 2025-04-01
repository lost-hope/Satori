const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('install')
        .setDescription('WLED web installer'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED web installer')
            .setURL('https://www.youtube.com/watch?v=xvFZjo5PgG0')
            .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
        await interaction.reply({ embeds: [embed] });
    },
};