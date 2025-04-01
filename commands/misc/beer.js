const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('node:path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


module.exports = {
    data: new SlashCommandBuilder()
        .setName('kb')
        .setDescription('Beer?')
        .addBooleanOption(option =>
            option.setName('surprise')
                .setDescription('I cant decide')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('mention')
                .setDescription('The member to mention')
                .setRequired(false))
    ,
    async execute(interaction) {
        let embed = null;
        if (interaction.options.getBoolean('surprise') != null) {
            surprise = interaction.options.getBoolean('surprise');
        } else {
            surprise = false;
        }
        if (surprise == true) {
            let response = await fetch("https://api.punkapi.com/v2/beers/random");
            let jsonData = await response.json();
            embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(jsonData[0].name)
                .setImage(jsonData[0].image_url)
                .setURL(`https://api.punkapi.com/v2/beers/${jsonData[0].id}`)
                .addFields()
        } else {
            embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setImage('https://github.com/lost-hope/Satori-Images/blob/main/beer.jpg?raw=true')
                .addFields()
        }
        if (interaction.options.getUser('mention') != null) {
            embed.setDescription(`${interaction.user} would like ${interaction.options.getUser('mention')} to have a beer`)
        }

        await interaction.reply({ embeds: [embed] });
    },
};