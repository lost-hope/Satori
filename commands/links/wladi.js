const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wladi')
        .setDescription('Link to Wladi\'s website'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Wladi\'s boards')
            .setURL('https://shop.myhome-control.de')
            .setThumbnail('https://shop.myhome-control.de/media/c0/c2/4d/1637341403/icon.png');
        await interaction.reply({ embeds: [embed] });
    },
};