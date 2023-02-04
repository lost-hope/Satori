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
                .setRequired)
        .addIntegerOption(option =>
            option.setName("height")
                .setDescription("Your matrix height")
                .setMinValue(0)
                .setMaxValue(256)
                .setRequired)
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
        matrix_width = interaction.options.getInteger('width');
        matrix_height = interaction.options.getInteger('height');
        v_num = interaction.options.getInteger('vsegments') == null ? 2 : interaction.options.getInteger('vsegments');
        h_num = interaction.options.getInteger('hsegments') == null ? 2 : interaction.options.getInteger('hsegments');

        vsize = matrix_width / v_num;
        hsize = matrix_height / h_num;
        output = "```JS\n{\"on\":true,\"bri\":255,\"transition\":7,\"mainseg\":0,\"seg\":[\n{\"id\":0,\"start\":0,\"stop\":" + matrix_width / 2 + ",\"startY\":0,\"stopY\":" + matrix_height / 2 + "},\n{\"id\":1,\"start\":" + matrix_width / 2 + ",\"stop\":" + matrix_width + ",\"startY\":0,\"stopY\":" + matrix_height / 2 + "},\n{\"id\":2,\"start\":0,\"stop\":" + matrix_width / 2 + ",\"startY\":" + matrix_height / 2 + ",\"stopY\":" + matrix_height + "},\n{\"id\":3,\"start\":" + matrix_width / 2 + ",\"stop\":" + matrix_width + ",\"startY\":" + matrix_height / 2 + ",\"stopY\":" + matrix_height + "}]}\n```"
        console.log(output);
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Preset JSON')
            .addFields(
                { name: "Preset JSON", value: output });
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};