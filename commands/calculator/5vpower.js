const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('5vpower')
        .setDescription('Calculate')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choose a LED Type')
                .setChoices(
                    { name: 'WS2812B', value: 'WS2812' },
                    { name: 'WS2812-ECO', value: 'WS2812-ECO' },
                    { name: 'WS2811', value: 'WS2811' },
                    { name: 'SK6812', value: 'SK6812' },
                    { name: 'APA102', value: 'APA102' },
                    { name: 'WS2812 COB', value: 'WS2812 COB' },
                    { name: 'SK6812 COB', value: 'SK6812 COB' }
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
            case 'WS2812':
                amps_max = led_num * 65/5/300;    //RGB White 100%
                amps_avg = led_num * 39.9/5/300;    //LEDs RGB White 50%
                break;
            case 'WS2812-ECO':
                amps_max = led_num * 46.8/5/300;    //RGB White 100%
                amps_avg = led_num * 24.8/5/300;    //LEDs RGB White 50%
                break;
            case 'SK6812':
                amps_max = led_num * 49/5/300;    //RGBW White 100%
                amps_avg = led_num * 26.3/5/300;   //LEDs RGB White 50%
                break;
            case 'APA102':
                amps_max = led_num * 88.1/5/300;    //RGB White 100%
                amps_avg = led_num * 45.4/5/300;    //LEDs RGB White 50%
                break;
            case 'WS2811':
                amps_max = led_num * 29.74/5/100;    //RGB White 100%
                amps_avg = led_num * 19.19/5/100;    //LEDs RGB White 50%
                break;
            case 'WS2812 COB':
                amps_max = led_num * 31.33/5/300;    //RGB White 100%
                amps_avg = led_num * 18.62/5/300;    //LEDs RGB White 50%
                break;
            case 'SK6812 COB':
                amps_max = led_num * 150/5/1660;    //RGB White 100%
                amps_avg = led_num * 85.55/5/1660;    //LEDs RGB White 50%
                break;

            default:
                break;
        }
        power_avg = amps_avg * 5;
        power_max = amps_max * 5;

        power_avg = Math.round((power_avg + Number.EPSILON) * 100) / 100;
        power_max = Math.round((power_max + Number.EPSILON) * 100) / 100;
        amps_avg = Math.round((amps_avg + Number.EPSILON) * 100) / 100;
        amps_max = Math.round((amps_max + Number.EPSILON) * 100) / 100;
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Estimated Power Requirements (for 5v LEDs)')
            .setDescription('These are extremely rough estimates only!')
            .addFields(
                { name: "LED Type", value: "" + led_type, inline: true },
                { name: "Number of LEDs", value: "" + led_num, inline: true },
                { name: "Maximum Amperage", value: "" + amps_max + "A", inline: false },
                { name: "Maximum Wattage", value: "" + power_max + "W", inline: true },
                { name: "Average Amperage", value: "" + amps_avg + "A", inline: false },
                { name: "Average Wattage", value: "" + power_avg + "W", inline: true },
                { name: "Credits", value: "Data measured by Quindor. \nhttps://quinled.info/2020/03/12/digital-led-power-usage/" }
            );

        await interaction.reply({ embeds: [exampleEmbed], ephemeral: hidden });
    },
};