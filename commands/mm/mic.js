const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mic')
        .setDescription('MoonMod Microphone Recommendations'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('MoonMod Mics')
            .setURL('https://mm.kno.wled.ge/WLEDSR/First-Time-Setup/#sound-settings-getting-started-with-common-microphones')
            .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
        await interaction.reply({ embeds: [embed] });
    },
};