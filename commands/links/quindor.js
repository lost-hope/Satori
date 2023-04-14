const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quin')
        .setDescription('Link to Quindors website'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Quindor')
            .setURL('https://quinled.info')
            .setThumbnail('https://quinled.info/wp-content/uploads/2018/08/logo-QuinLED2.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};