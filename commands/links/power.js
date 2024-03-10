const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('power')
        .setDescription('WLED Power calculator'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Power calculator')
            .setURL('https://wled-calculator.github.io/');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};