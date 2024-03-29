const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('12vpower')
        .setDescription('Calculate')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choose a LED Type')
                .setChoices(
                    { name: 'WS2811', value: 'WS2811' },
                    { name: 'WS2811 Single', value: 'WS2811 Single' },
                    { name: 'WS2811 COB', value: 'WS2811 COB' },
                    { name: 'WS2814', value: 'WS2814' },
                    { name: 'WS2815', value: 'WS2815' },
                    { name: 'BTF2815 (UCS1903)', value: 'BTF2815' },
                    { name: 'SK6812 Single', value: 'SK6812 Single' },
                    { name: 'SK6812 per 3', value: 'SK6812 per 3' },
                    { name: 'GS8208', value: 'GS8208' }
                )
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Enter your number of LEDs')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('hidden')
                .setDescription('Default is a hidden message')
                .setRequired(false))

    ,
    async execute(interaction) {
        led_type = interaction.options.getString('type');
        led_num = interaction.options.getInteger('number');
        if (interaction.options.getBoolean('hidden') != null) {
            hidden = interaction.options.getBoolean('hidden');
        } else {
            hidden = true;
            if (interaction.guildId == '473448917040758787' && interaction.channelId == '766627051100307477') {
                hidden = false;
            }
        }
        power_max = 0;
        power_avg = 0;
        amps_max = 0;
        amps_avg = 0;
        switch (led_type) {
            case 'WS2811':
                amps_max = led_num * 75/12/300;    //RGB White 100%
                amps_avg = led_num * 30.50/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'WS2811 Single':
                amps_max = led_num * 67.20/12/300;    //RGB White 100%
                amps_avg = led_num * 28.16/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'WS2814':
                amps_max = led_num * 64.11/12/300;    //RGB White 100%
                amps_avg = led_num * 25.86/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'WS2815':
                amps_max = led_num * 48.60/12/300;    //RGB White 100%
                amps_avg = led_num * 50/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'WS2815':
                amps_max = led_num * 48.60/12/300;    //RGB White 100%
                amps_avg = led_num * 50/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'BTF2815':
                amps_max = led_num * 46.69/12/300;    //RGB White 100%
                amps_avg = led_num * 46.84/12/300;    //Effect 1 (Police All) 100%
                break;
            case 'SK6812 single':
                amps_max = led_num * 163.8/12/300;    //RGB+White 100%
                amps_avg = led_num * 43.25/12/300;    //WLED v14 - Flow 100%
                break;
            case 'SK6812 per 3':
                amps_max = led_num * 43.34/12/300;    //RGB+White 100%
                amps_avg = led_num * 23.17/12/300;    //WLED v14 - Flow 100%
                break;
            case 'GS8208':
                amps_max = led_num * 45.63/12/300;    //RGB White 100%
                amps_avg = led_num * 37.43/12/300;    //WLED v14 - Flow 100%
                break;
            case 'WS2811 COB':
                amps_max = led_num * 61.36/12/1200;    //RGB White 100%
                amps_avg = led_num * 25.78/12/1200;    //WLED v14 - Flow 100%
                break;

            default:
                break;
        }
        power_avg = amps_avg * 12;
        power_max = amps_max * 12;

        power_avg = Math.round((power_avg + Number.EPSILON) * 100) / 100;
        power_max = Math.round((power_max + Number.EPSILON) * 100) / 100;
        amps_avg = Math.round((amps_avg + Number.EPSILON) * 100) / 100;
        amps_max = Math.round((amps_max + Number.EPSILON) * 100) / 100;
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Estimated Power Requirements (for 12V LEDs)')
            .setDescription('These are extremely rough estimates only!')
            .addFields(
                { name: "LED Type", value: "" + led_type, inline: true },
                { name: "Number of LEDs", value: "" + led_num, inline: true },
                { name: "Maximum Amperage", value: "" + amps_max + "A", inline: false },
                { name: "Maximum Power", value: "" + power_max + "W", inline: true },
                { name: "Average Amperage", value: "" + amps_avg + "A", inline: false },
                { name: "Average Power", value: "" + power_avg + "W", inline: true },
                { name: "Credits", value: "Data measured by Quindor.\nhttps://quinled.info/2020/03/12/digital-led-power-usage/" }
            );

        await interaction.reply({ embeds: [exampleEmbed], ephemeral: hidden });
    },
};