const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analog')
        .setDescription('Wiring diagramm for analog leds'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('WLED Wiring Help')
            .setURL('https://kno.wled.ge/basics/getting-started/')
            .setDescription('WLED can also control analog LEDs, but you will need additional hardware like MOSFETs for that.\nThere are two recommended MOSFETs, that are working with the ESP, but there are more out there:\n`IRLZ44N`\n`STP55NF06L`\n Below is an pertial circuit. You need one Mosfet per color channel.')
            .setImage('https://i.ibb.co/86vsym1/image.png');
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};