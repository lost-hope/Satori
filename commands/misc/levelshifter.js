const { SlashCommandBuilder, EmbedBuilder, Options } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shifter')
        .setDescription('Information about Levelshifters')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choose a type to get the Wiring')
                .setRequired(false)
                .addChoices(
                    { name: 'SN74AHCT125', value: 'sn' },
                    { name: 'TXS0108', value: 'tx8' },
                    { name: 'Sactrificial Pixel', value: 'sp' }
                ))
        .addStringOption(option =>
            option.setName('number')
                .setDescription('How many Channels on the SN74AHCT125?')
                .setRequired(false)
                .addChoices(
                    { name: '1', value: '1' },
                    { name: '2', value: '2' },
                    { name: '4', value: '4' }
                )
            ),
    async execute(interaction) {
        var type = interaction.options.getString('type');
        var number = interaction.options.getString('number');
        var embed
        switch (type) {
            case 'tx8':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the TXS0108')
                    .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/txs.png');
                break;
            case 'sn':
                if(number == '2') {
                    embed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Wiring of the SN74AHCT125')
                        .setImage('https://github.com/lost-hope/Satori-Images/blob/main/Shifter74HCT125_Dual.png?raw=true');
                } else if(number == '4') { 
                    embed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Wiring of the SN74AHCT125')
                        .setImage('https://github.com/lost-hope/Satori-Images/blob/main/Shifter74HCT125_Quad.png?raw=true');
                } else {
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the SN74AHCT125')
                    .setImage('https://github.com/lost-hope/Satori-Images/blob/main/Shifter74HCT125_Single.png?raw=true');
                }
            break;
            case 'sp':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the sacrificial pixel method')
                    .setDescription('By using a Diode in the 5V supply of a single pixel the needed Datalevel is dropped enough, so that the 3.3V of the ESP are enough.')
                    .setImage('https://raw.githubusercontent.com/lost-hope/Satori-Images/main/sacrificial.png');
                break;
            default:
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Levelshifters')
                    .setDescription('LEDs need 5V datalevel. ESP can only provide 3.3V. Find levelshifters here')
                    .setURL('https://kno.wled.ge/basics/compatible-hardware/#levelshifters')
                    .setThumbnail('https://raw.githubusercontent.com/Aircoookie/WLED/master/images/wled_logo_akemi.png');
                break;
        }
        await interaction.reply({ embeds: [embed] });
    },
};