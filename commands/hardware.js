const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hardware')
        .setDescription('WLED Compatible Hardware'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Compatible Hardware')
            .setURL('https://kno.wled.ge/basics/compatible-hardware/')
            .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};