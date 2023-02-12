const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sn74ahct125')
        .setDescription('Wiring of the SN74AHCT125'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Wiring of the SN74AHCT125')
            .setImage('https://cdn.discordapp.com/attachments/757254961640898622/1016351826863460493/shifter.jpg');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};