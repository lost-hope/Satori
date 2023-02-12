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
                    { name: 'TXS0108', value: 'tx8' }
                )),
    async execute(interaction) {
        var type = interaction.options.getString('type');
        var embed
        switch (type) {
            case 'tx8':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the TXS0108')
                    .setImage('https://media.discordapp.net/attachments/719873873071308821/1059968358616940634/image.png');
                break;
            case 'sn':
                embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Wiring of the SN74AHCT125')
                    .setImage('https://cdn.discordapp.com/attachments/757254961640898622/1016351826863460493/shifter.jpg');
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