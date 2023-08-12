
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessagePayload, AttachmentBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('child_process');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('WLED Build bot'),
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const envInput = new TextInputBuilder()
                .setCustomId('envInput')
                .setLabel('Platformio Enviroment Config')
                .setPlaceholder('[env:esp32]\nextends = env:esp32dev\n...')
                .setStyle(TextInputStyle.Paragraph);

            const actionRow = new ActionRowBuilder().addComponents(envInput);

            const modal = new ModalBuilder()
                .setCustomId('buildModal')
                .setTitle('WLED Builder Bot')
                .addComponents(actionRow);

            await interaction.showModal(modal);
        } else if (interaction.isModalSubmit()) {
            envStartIndex = interaction.fields.getTextInputValue('envInput').search(/\[.*\]/)
            envEndIndex = interaction.fields.getTextInputValue('envInput').search(']')
            if (envStartIndex == -1) {
                await interaction.reply('Error finding the Enviroment name')
            } else {
                await interaction.reply('Cloning Repository');
                envName = interaction.fields.getTextInputValue('envInput').substring(envStartIndex + 5, envEndIndex);
                const gitPath = path.join(__dirname, 'wled');
                const child = spawn('git', ['clone', 'https://github.com/Aircoookie/WLED', gitPath]);
                child.on('close', code => {
                    interaction.editReply('Cloned Repository. Now adding the Enviroment');
                    const overridePath = path.join(gitPath, 'platformio_override.ini');
                    enviromentConfig = '[platformio]\ndefault_envs = ' + envName + '\n\n' + interaction.fields.getTextInputValue('envInput');
                    fs.writeFile(overridePath, enviromentConfig, function (err) { });
                    interaction.editReply('Enviroment Added. Building Firmware.⏳');
                    const build = spawn('pio', ['run', '-d', gitPath]);
                    fs.writeFile('commands/build/log.txt', 'Build Log:\n', function (err) { });
                    build.stdout.on("data", data => {
                        fs.appendFile('commands/build/log.txt', data, function (err) { });
                    });
                    build.stderr.on("data", data => {
                        fs.appendFile('commands/build/log.txt', data, function (err) { });
                    });
                    build.on('error', (error) => {
                        fs.appendFile('commands/build/log.txt', error, function (err) { });
                    });
                    build.on('close', code => {
                        if (code == 0) {
                            console.log(`child process exited with code ${code}`);
                            const firmwarePath = path.join(gitPath, 'build_output', 'firmware', envName + '.bin');
                            const file = new AttachmentBuilder(firmwarePath);
                            interaction.editReply({ content: '✔️Build sucessful. File is below.', files: [file] })
                        } else {
                            const file = new AttachmentBuilder('commands/build/log.txt');
                            interaction.editReply({ content: '❌Build unsucessful. Logfile is below.', files: [file] })
                        }
                    });
                })
            }




        }
    },
};