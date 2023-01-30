const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sergtin')
        .setDescription('Serg\`s Tindie Store'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Serg\'s Tindie Store')
            .setURL('https://www.tindie.com/stores/serg74/')
            .setThumbnail('https://secure.gravatar.com/avatar/ead1204b39f0b40f2a763045cb448764?d=retro&s=125');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};