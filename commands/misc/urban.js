const { SlashCommandBuilder, EmbedBuilder, Options } = require('discord.js');
const { apikey } = require('../../config.json');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('urbandictionary')
        .setDescription('Feel old and dont understand the young people')
        .addStringOption(option =>
            option.setName('phrase')
                .setDescription('Phrase to look up.')
                .setRequired(true)
        ),
    async execute(interaction) {
        var phrase = interaction.options.getString('phrase');
        const url = 'https://mashape-community-urban-dictionary.p.rapidapi.com/define?term=' + phrase;
        const options = {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': apikey,
                'X-RapidAPI-Host': 'mashape-community-urban-dictionary.p.rapidapi.com'
            }
        };

        try {
            const response = await fetch(url, options);
            let jsonData = await response.json();
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle("Urban Dictionary")
                .setURL(jsonData.list[0].permalink)
                .addFields(
                    { name: "Word/Phrase", value: jsonData.list[0].word },
                    { name: "Definition", value: jsonData.list[0].definition.replaceAll("[", "").replaceAll("]", "") },
                    { name: "Example", value: jsonData.list[0].example.replaceAll("[", "").replaceAll("]", "") })
                .setFooter({ text: "powered by urbandictionary.com", iconURL: 'https://www.urbandictionary.com/favicon-32x32.png' })
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
        }
    },
};