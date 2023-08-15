const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all commands'),

    async execute(interaction, client) {

        const page1 = new EmbedBuilder()
            .setColor('Red')
            .setTitle('General help and most important links')
            .setDescription('Page 1 - General help and most important links.\nPage 2 - More links to different helpful sites.\nPage 3 - Calculators and other tools\nPage 4 - Special Links for MoonMod\nYou can use the tab key to autocomplete.\nRequired options are in square and optional in round brackets')
            .addFields(
                { name: "/help", value: "Displays this help" },
                { name: "/kb", value: "Links to the knowledgebase (kb for short)" },
                { name: "/install", value: "Links to the webinstaller" },
                { name: "/getting-started", value: "Links to the getting started guide on kb" },
                { name: "/shifter (type)", value: "Recommended shifters or wiring diagrams for a specific one" },
                { name: "/wiring", value: "Wiring schematic for digital LEDs" },
                { name: "/analog", value: "Wiring schematic for analog LEDs" },
                { name: "/datalevel", value: "Technical explanation for the datalevel" },
            )
            .setTimestamp()
            .setFooter({ text: "General help and most important links." })

        const page2 = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('Command Help - Page 2')
            .addFields(
                { name: "/forum", value: "Link to the WLED forum" },
                { name: "/faq", value: "WLED FAQ" },
                { name: "/hardware", value: "Link to a list of recommended hardware" },
                { name: "/issues", value: "Link to the github issues page" },
                { name: "/fx", value: "Link to a list of retired effects and replacements" },
                { name: "/quindor", value: "Quindor's Website" },
                { name: "/wladi", value: "Wladi's Boards" },
                { name: "/quinwire", value: "Quindor's Wiring Guide" },
                { name: "/serg", value: "Precompiled binaries made by Serg" },
                { name: "/sergtin", value: "Serg's Tindie store" },
                { name: "/twi", value: "TwilightLords's Tindie store" },
                { name: "/whyaremysegmentsgone", value: "Why are my segments gone?" },
                { name: "/merch", value: "WLED Merch store" },
            )
            .setTimestamp()
            .setFooter({ text: "More links to different helpful sites." })
        const page3 = new EmbedBuilder()
            .setColor('Green')
            .setTitle('Command Help - Page 3')
            .addFields(
                { name: "/build", value: "Builds a Firmware with an given enviroment config." },
                { name: "/mmbuild", value: "Builds a MoonModules Firmware with an given enviroment config." },
                { name: "/5vpower [type] [number]", value: "Calculates the needed power and current for a give type and number for 5V LED strips" },
                { name: "/12vpower [type] [number]", value: "Calculates the needed power and current for a give type and number for 12V LED strips" },
                { name: "/24vpower [type] [number]", value: "Calculates the needed power and current for a give type and number for 12V LED strips" },
                { name: "/matrixsegment [width] [height] [vertical segments] [horizontal segment]", value: "Outputs a preset to split up a matrix in multiple segments" },
                { name: "/avatar ", value: "||POOF!||" },
            )
            .setTimestamp()
            .setFooter({ text: "Calculators and other tools" })

        const page4 = new EmbedBuilder()
            .setColor('DarkBlue')
            .setTitle('MoonMod')
            .addFields(
                { name: "/mmkb", value: "Link to the MoonMod Knowledgebase" },
                { name: "/mic", value: "MoonMod Microphone Recommendations" },
                { name: "/mminstall", value: "Links to an alternative webinstaller, that works better with audioreactive versions." },
                { name: "/mmgithub", value: "Links to the MoonMod Github" },
            )
            .setTimestamp()
            .setFooter({ text: "MoonMod" })

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("page1")
                    .setLabel("Help and Links.")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("page2")
                    .setLabel("More links")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId("page3")
                    .setLabel("Calculators and Tools")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId("page4")
                    .setLabel("MoonMod")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            )

        const message = await interaction.reply({ embeds: [page1], components: [button] });
        const collector = await message.createMessageComponentCollector();

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id)
                return await i.reply({ content: `Only ${interaction.user.tag} can use these buttons`, ephemeral: true });
            if (i.customId === "page1") {
                button.components[0].setDisabled(true);
                button.components[1].setDisabled(false);
                button.components[2].setDisabled(false);
                button.components[3].setDisabled(false);
                await i.update({ embeds: [page1], components: [button] });
            } else if (i.customId === "page2") {
                button.components[0].setDisabled(false);
                button.components[1].setDisabled(true);
                button.components[2].setDisabled(false);
                button.components[3].setDisabled(false);
                await i.update({ embeds: [page2], components: [button] });
            } else if (i.customId === "page3") {
                button.components[0].setDisabled(false);
                button.components[1].setDisabled(false);
                button.components[2].setDisabled(true);
                button.components[3].setDisabled(false);
                await i.update({ embeds: [page3], components: [button] });
            } else if (i.customId === "page4") {
                button.components[0].setDisabled(false);
                button.components[1].setDisabled(false);
                button.components[2].setDisabled(false);
                button.components[3].setDisabled(true);
                await i.update({ embeds: [page4], components: [button] });
            }

        })



    }
}