const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('4')
        .setDescription('make aware of the guideline 4')
        .addUserOption(option =>
            option.setName('mention')
                .setDescription('The member to mention')
                .setRequired(false)),
    async execute(interaction) {

        const exampleEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Guideline Rule 4')
            
        if (interaction.options.getUser('mention')==null){
            exampleEmbed.setDescription('🚫 Reminder: Please refrain from copying your message to multiple channels without allowing for a reasonable timeframe for a response first.\n👍 Thank you for helping maintain a smooth and respectful communication environment!')
        
        }else{
            exampleEmbed.setDescription(`🚫 Reminder: Please refrain from copying your message to multiple channels without allowing for a reasonable timeframe for a response first.\n👍 Thank you for helping maintain a smooth and respectful communication environment!\n That is for you: ${interaction.options.getUser('mention')}`)
        
        }
        await interaction.reply({ embeds: [exampleEmbed] });
    },
};