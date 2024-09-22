const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('issues')
        .setDescription('WLED Github Issues'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED GitHub Issues')
            .setURL('https://github.com/Aircoookie/WLED/issues')
        await interaction.reply({ embeds: [embed] });
    },
};