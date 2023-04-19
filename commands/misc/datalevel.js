const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('datalevel')
        .setDescription('The mystery of the data level'),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('The mystery of the data level')
            .addFields(
                { name: "Datasheet WS2812B", value: "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf" },
                { name: "Needed data level of LED", value: " Looking at the datasheet page 3 we see that the minimal voltage for a high level input is `0.7*Vdd`. \n`Vdd` is the supply voltage of the LED, so 5V in this case. `0.7 * 5V = 3.5V`", inline: true },
                { name: "Data level output of ESP", value: "The ESP can only output 3.3V.", inline: true },
                { name: "Conclusion", value: "The output of the ESP is in theory not high enough to drive the WS2812B LEDs. \nA levelshifter does fix that issue by changing the datalevel from 3.3V to 5V." },
                { name: "But it works without one in Video XY", value: "As said above: \" ...in theory...\". Values from the Datasheet and the reality are two different things. \nThe values in the datasheet mean that it can garantee a good read of a HIGH level at 3.5V or more. It can work below 3.5V, but there is a chance does not get a good read.  " },
                { name: "And now?", value: "If you want a reliable setup, then integrate a recommended levelshifter. Check the /shifter command for those." }
            )
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};