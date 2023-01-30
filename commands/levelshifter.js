const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shift')
        .setDescription('Find reccomended levelshifters'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Level Shifters')
            .setURL('https://kno.wled.ge/basics/compatible-hardware/#levelshifters')
            .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};