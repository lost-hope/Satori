const { SlashCommandBuilder, EmbedBuilder, Options } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shifter')
        .setDescription('Information about Levelshifters').addStringOption(option =>
            option.setName('type')
                .setDescription('Choose a type to get the Wiring')
                .setRequired(false)
                .addChoices(
                    { name: 'SN74AHCT125', value: 'sn' },
                    { name: 'TXS0108', value: 'tx8' },
                    { name: 'Sactrificial Pixel', value: 'sp' }
                )),
    async execute(interaction) {
        var type = interaction.options.getString('type');
        var embed
        switch (type) {
            case 'tx8':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the TXS0108')
                    .setImage('https://media.discordapp.net/attachments/719873873071308821/1098951764276944906/image.png');
                break;
            case 'sn':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the SN74AHCT125')
                    .setImage('https://cdn.discordapp.com/attachments/757254961640898622/1016351826863460493/shifter.jpg');
                break;
            case 'sp':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the sacrificial pixel method')
                    .setDescription('By using a Diode in the 5V supply of a single pixel the needed Datalevel is dropped enough, so that the 3.3V of the ESP are enough.\n Be aware that the strip in the picture has the power connection in the center and data on top. Connect according to your strip.')
                    .setImage('https://media.discordapp.net/attachments/766627051100307477/1074720882246811838/ws-levelshift.png');
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