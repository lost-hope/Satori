const { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    cooldown: 60,
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Change the avatar. Only usable every minute per user')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Type the name')
                .setAutocomplete(true)
                .setRequired(false)
        ),
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const avatarPath = path.join(__dirname.substring(0, __dirname.length - 14), 'akemi');
        const avatarFiles = fs.readdirSync(avatarPath).filter(file => file.endsWith('.png'));
        const choices = avatarFiles;
        const filtered = choices.filter(choice => choice.includes(focusedValue)).slice(0, 24);
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    },
    async execute(interaction, client) {
        index = 0;
        const avatarPath = path.join(__dirname.substring(0, __dirname.length - 14), 'akemi');
        const avatarFiles = fs.readdirSync(avatarPath).filter(file => file.endsWith('.png'));
        var picturePath = path.join(avatarPath, "000_base.png");
        if (interaction.options.getString('name') != null) {
            picturePath = path.join(avatarPath, interaction.options.getString('name'));
        } else {
            index = Math.floor(Math.random() * avatarFiles.length);
            picturePath = path.join(avatarPath, avatarFiles[index]);
        }
        client.user.setAvatar(picturePath);
        await interaction.reply("POOF");
    }
};