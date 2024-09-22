const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analog')
        .setDescription('Wiring diagramm for analog leds')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('How many Channels?')
                .setRequired(false)
                .addChoices(
                    { name: '1', value: '1' },
                    { name: '3', value: '3' }
                )
            )
        ,
    async execute(interaction) {
        var number = interaction.options.getString('number');
        var embed
        switch (number) {
            case '1':
                embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('WLED Wiring Help')
                .setURL('https://kno.wled.ge/basics/getting-started/')
                .setDescription('WLED can also control analog LEDs, but you will need additional hardware like MOSFETs for that.\nThere are two recommended MOSFETs, that are working with the ESP, but there are more out there:\n`IRLZ44N`\n`STP55NF06L`\n Below is an pertial circuit. You need one Mosfet per color channel.')
                .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/analog1.png');
                break;
            case '3':
                embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('WLED Wiring Help')
                .setURL('https://kno.wled.ge/basics/getting-started/')
                .setDescription('WLED can also control analog LEDs, but you will need additional hardware like MOSFETs for that.\nThere are two recommended MOSFETs, that are working with the ESP, but there are more out there:\n`IRLZ44N`\n`STP55NF06L`\n Below is an pertial circuit. You need one Mosfet per color channel.')
                .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/analog3.png');
                break;
            default:
                embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('WLED Wiring Help')
                .setURL('https://kno.wled.ge/basics/getting-started/')
                .setDescription('WLED can also control analog LEDs, but you will need additional hardware like MOSFETs for that.\nThere are two recommended MOSFETs, that are working with the ESP, but there are more out there:\n`IRLZ44N`\n`STP55NF06L`\n Below is an pertial circuit. You need one Mosfet per color channel.')
                .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/analog.png');
                break;
        }
        await interaction.reply({ embeds: [embed] });
    },
};