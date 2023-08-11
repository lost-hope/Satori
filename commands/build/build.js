
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder,TextInputStyle, ActionRowBuilder} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('WLED Build bot'),
    async execute(interaction) {
        if(interaction.isChatInputCommand()){
        const envInput = new TextInputBuilder()
        .setCustomId('envInput')
        .setLabel('Platformio Enviroment Config')
        .setPlaceholder('[esp32_DMX]\nextends = esp32dev\nbuild_flags = ${common.build_flags_esp32}\n\t-D WLED_ENABLE_DMX}')
        .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder().addComponents(envInput);

        const modal = new ModalBuilder()
        .setCustomId('buildModal')
        .setTitle('WLED Builder Bot')
        .addComponents(actionRow);
        
        await interaction.showModal(modal);
        }else if (interaction.isModalSubmit()){
            envStartIndex = interaction.fields.getTextInputValue('envInput').search(/\[.*\]/)
            envEndIndex = interaction.fields.getTextInputValue('envInput').search(']')
            if(envStartIndex==-1){
                await interaction.reply('Error finding the Enviroment name')
            }else{
                envName = interaction.fields.getTextInputValue('envInput').substring(envStartIndex+1,envEndIndex);
                
                await interaction.reply(envName);
            }

                        
            
            
        }
    },
};