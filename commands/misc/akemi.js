const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Change the avatar. Only usable every minute per user')
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Enter a Number between 0 and 50 or leave it empty for a random akemi.')
                .setRequired(false)
        )
    ,
    async execute(interaction, client) {
        index = 0;
        const avatarPath = path.join(__dirname.substring(0, __dirname.length - 9), 'akemi');
        const avatarFiles = fs.readdirSync(avatarPath).filter(file => file.endsWith('.png'));
        if ((interaction.options.getInteger('number') >= 0 && interaction.options.getInteger('number') <= 49) && interaction.options.getInteger('number') != null) {
            index = interaction.options.getInteger('number');
        } else {
            index = Math.floor(Math.random() * avatarFiles.length);
        }
        console.log(index);

        const picturePath = path.join(avatarPath, avatarFiles[index]);
        client.user.setAvatar(picturePath);
        await interaction.reply("POOF");
    },
};