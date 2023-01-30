const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whyaremysegmentsgone')
        .setDescription('WLED Segments'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Segments')
            .setURL('https://kno.wled.ge/features/segments/')
            .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};