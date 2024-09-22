const { SlashCommandBuilder, EmbedBuilder, userMention } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('4')
        .setDescription('make aware of the guideline 4')
        .addUserOption(option =>
            option.setName('mention')
                .setDescription('The member to mention')
                .setRequired(false)),
    async execute(interaction) {

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Guideline Rule 4')
            
        if (interaction.options.getUser('mention')==null){
            embed.setDescription('🚫 Reminder: Please refrain from copying your message to multiple channels without allowing for a reasonable timeframe for a response first.\n👍 Thank you for helping maintain a smooth and respectful communication environment!')
        
        }else{
            const user = userMention(interaction.options.getUser('mention'));
            embed.setDescription(`🚫 Reminder: Please refrain from copying your message to multiple channels without allowing for a reasonable timeframe for a response first.\n👍 Thank you for helping maintain a smooth and respectful communication environment!\n `)
        }
        await interaction.reply({ embeds: [embed]});
    },
};