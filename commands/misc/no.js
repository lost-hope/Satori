const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('node:path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));



module.exports = {
    data: new SlashCommandBuilder()
        .setName('no')
        .setDescription('No!')


    ,
    async execute(interaction) {
        let embed = null;
        const fs = require("fs");

        function randomIndex(size) {
            return Math.floor(Math.random() * size);
        }

        const quotes = JSON.parse(fs.readFileSync("reasons.json", { encoding: "utf-8", flag: "r" }));

        const selectedQuote = quotes[randomIndex(quotes.length)];
        embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("No!")
            .setDescription(selectedQuote)

        await interaction.reply({ embeds: [embed] });
    },
};