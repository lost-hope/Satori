const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('txs0108')
        .setDescription('Wiring of the TXS0108'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Wiring of the TXS0108')
            .setImage('https://media.discordapp.net/attachments/719873873071308821/1059968358616940634/image.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};