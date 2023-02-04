const { SlashCommandBuilder, EmbedBuilder, Options } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('matrixsegment')
        .setDescription('Split a Matrix into 4 equal segments WIP')
        .addIntegerOption(option =>
            option.setName("width")
                .setDescription("Your matrix width")
                .setMinValue(0)
                .setMaxValue(256)
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName("height")
                .setDescription("Your matrix height")
                .setMinValue(0)
                .setMaxValue(256)
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName("vsegments")
                .setDescription("Number of vertical segments")
                .setMinValue(0)
                .setMaxValue(10))
        .addIntegerOption(option =>
            option.setName("hsegments")
                .setDescription("Number of horizontal segments")
                .setMinValue(0)
                .setMaxValue(10)),
    async execute(interaction) {
        matrixWidth = interaction.options.getInteger('width');
        matrixHeight = interaction.options.getInteger('height');
        vNum = interaction.options.getInteger('vsegments') == null ? 2 : interaction.options.getInteger('vsegments');
        hNum = interaction.options.getInteger('hsegments') == null ? 2 : interaction.options.getInteger('hsegments');
        vSize = Math.round(matrixHeight / vNum);
        hSize = Math.round(matrixWidth / hNum);

        let outputJson = "```JS\n{\"on\":true,\"bri\":255,\"transition\":7,\"mainseg\":0,\"seg\":[\n";
        let outputLayout = "```"
        index = 0;
        for (let h = 0; h < hNum; h++) {
            for (let w = 0; w < vNum; w++) {
                outputJson += "{\"id\":" + index + ",\"start\":" + w * vSize + ",\"stop\":" + ((w * vSize) + vSize) + ",\"startY\":" + h * hSize + ",\"stopY\":" + +((h * hSize) + hSize) + "},\n"
                outputLayout += index + " ";
                index++;
            }
            outputLayout += "\n";
        }
        outputLayout += "\n```";
        outputJson += "]}\n```";
        console.log(outputJson);
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Preset JSON')
            .addFields(
                { name: "Matrix Size", value: "" + matrixWidth + "x" + matrixHeight, inline: true },
                { name: "Segment Size", value: "" + vNum + "x" + hNum, inline: true },
                { name: "Segment Layout", value: outputLayout, inline: true },

                { name: "Preset JSON", value: outputJson });
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};