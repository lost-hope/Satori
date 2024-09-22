const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serg')
        .setDescription('Replies with the link to Serg\'s binary repository'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Serg\'s repository')
            .setURL('https://github.com/srg74/WLED-wemos-shield/tree/master/resources/Firmware')
            .setDescription('Here you can find serveral precompiled binaries for WLED')
            .setThumbnail('https://avatars.githubusercontent.com/u/28492985?v=4');
        await interaction.reply({ embeds: [embed] });
    },
};