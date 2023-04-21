const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resistor')
        .setDescription('Resistor in Dataline'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Data Resistor')
            .setURL('https://quinled.info/data-signal-cable-conditioning/')
            .setThumbnail('https://quinled.info/wp-content/uploads/2018/08/logo-QuinLED2.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};