const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('24vpower')
        .setDescription('Calculate')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choose a LED Type')
                .setChoices(
                    { name: 'WS2811', value: 'WS2811' },
                    { name: 'SK6812', value: 'SK6812' },
                    { name: 'TM1814', value: 'TM1814' },
                    { name: 'WS2814', value: 'WS2814' },
                    { name: 'WS28xx NEON COB-RGB', value: 'WS28xx' },
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
                amps_max = led_num * 0.0081875;    //RGB White 100%
                amps_avg = led_num * 0.00404861;    //Avg Amps per LED
                break;
            case 'SK6812':
                amps_max = led_num * 0.00536528;    //RGB White 100%
                amps_avg = led_num * 0.002416;    //Avg Amps per LED
                break;
            case 'TM1814':
                amps_max = led_num * 0.013136;    //RGB White 100%
                amps_avg = led_num * 0.006005;    //Avg Amps per LED
                break;
            case 'WS2814':
                amps_max = led_num * 0.00888472;    //RGB White 100%
                amps_avg = led_num * 0.00361528;    //Avg Amps per LED
                break;
            case 'WS28xx':
                amps_max = led_num * 0.015583;    //RGB White 100%
                amps_avg = led_num * 0.006083;    //Avg Amps per LED
                break;

            default:
                break;
        }
        power_avg = amps_avg * 24;
        power_max = amps_max * 24;

        power_avg = Math.round((power_avg + Number.EPSILON) * 100) / 100;
        power_max = Math.round((power_max + Number.EPSILON) * 100) / 100;
        amps_avg = Math.round((amps_avg + Number.EPSILON) * 100) / 100;
        amps_max = Math.round((amps_max + Number.EPSILON) * 100) / 100;
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Estimated Power Requirements (for 24V LEDs)')
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