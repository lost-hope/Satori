const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tony')
        .setDescription('Link to tonyno\'s website'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('tonyno\'s boards (sjm)')
            .setURL('https://www.tindie.com/stores/sjmelectronics')
            .setThumbnail('https://cdn.tindiemedia.com/images/resize/TCrs6fJyUKyiOJEKYP3dpGGplb0=/p/125x125/i/307043/profiles/2024-06-05T15%3A54%3A02.950Z-logo%20g.png');
        await interaction.reply({ embeds: [embed] });
    },
};