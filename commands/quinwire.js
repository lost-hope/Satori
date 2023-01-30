const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quinwire')
        .setDescription('Quindor\'s Wiring Guide'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Quindor\'s Wiring Guide')
            .setURL('https://quinled.info/2020/10/03/quinled-dig-quad-wiring-guide/')
            .setThumbnail('https://quinled.info/wp-content/uploads/2018/08/logo-QuinLED2.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};