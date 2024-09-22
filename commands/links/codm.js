const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('codm')
        .setDescription('Link to Prego\'s website (cod.m)'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Prego\'s boards (cod.m)')
            .setURL('https://shop.codm.de/')
            .setThumbnail('https://shop.codm.de/media/37/30/2a/1693566415/avatar.jpg');
        await interaction.reply({ embeds: [embed] });
    },
};