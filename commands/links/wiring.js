const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wiring')
        .setDescription('Wiring diagramm for digital leds'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Wiring Help')
            .setURL('https://kno.wled.ge/basics/getting-started/')
            .setDescription('Here is the recommended method for wiring your LEDs with WLED.')
            .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/wiring.png');
        await interaction.reply({ embeds: [embed] });
    },
};