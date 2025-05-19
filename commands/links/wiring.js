const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wiring')
        .setDescription('Wiring diagramm for digital leds')
        .addStringOption(option =>
            option.setName('configuration')
                .setDescription('What voltage do you use?')
                .setRequired(false)
                .addChoices(
                    { name: '5V', value: '5' },
                    { name: '12V/24V', value: '12' },
                    { name: 'Multi Supply', value: 'mpsu' },
                    { name: 'Multi Strip', value: 'mstrip' },
                )
            ),
    async execute(interaction) {
        var number = interaction.options.getString('configuration');
        var embed
        switch (number) {
            case '12':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('WLED Wiring Help - 12V/24V')
                    .setURL('https://kno.wled.ge/basics/getting-started/')
                    .setDescription('Here is the recommended method for wiring your LEDs with WLED.')
                    .setImage('https://github.com/lost-hope/Satori-Images/blob/main/WLED_12VdigitalWiring.png?raw=true');
                break;
            case 'mpsu':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('WLED Wiring Help - Multi Supply')
                    .setURL('https://kno.wled.ge/basics/getting-started/')
                    .setDescription('Here is the recommended method for wiring your LEDs with WLED using multiple supplies.')
                    .setImage('https://github.com/lost-hope/Satori-Images/blob/main/WLED_MultisupplydigitalWiring.png?raw=true');
                break;
            case 'mstrip':  
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('WLED Wiring Help - Multi Strip')
                    .setURL('https://kno.wled.ge/basics/getting-started/')
                    .setDescription('Here is the recommended method for wiring multiple LED Strip with WLED.')
                    .setImage('https://github.com/lost-hope/Satori-Images/blob/main/WLED_MultistripdigitalWiring.png?raw=true');
                break;  
            default:
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('WLED Wiring Help - 5V')
                    .setURL('https://kno.wled.ge/basics/getting-started/')
                    .setDescription('Here is the recommended method for wiring your LEDs with WLED.')
                    .setImage('https://github.com/lost-hope/Satori-Images/blob/main/WLED_5VdigitalWiring.png?raw=true');
                break;
        }
        await interaction.reply({ embeds: [embed] });
    },
};