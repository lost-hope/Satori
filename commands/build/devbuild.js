
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessagePayload, AttachmentBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('child_process');
let isCommandRunning = false;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('devbuild')
        .setDescription('WLED Build bot - Dev Branch'),
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            if (isCommandRunning) {
                interaction.reply('Wait for the other Buildprocess to be finished first')
            } else {
                const envInput = new TextInputBuilder()
                    .setCustomId('envInput')
                    .setLabel('Platformio Enviroment Config')
                    .setPlaceholder('[env:esp32]\nextends = env:esp32dev\n...')
                    .setStyle(TextInputStyle.Paragraph);

                const actionRow = new ActionRowBuilder().addComponents(envInput);

                const modal = new ModalBuilder()
                    .setCustomId('devbuildModal')
                    .setTitle('WLED Builder Bot')
                    .addComponents(actionRow);

                await interaction.showModal(modal);
            }
        } else if (interaction.isModalSubmit()) {
            isCommandRunning = true;
            envStartIndex = interaction.fields.getTextInputValue('envInput').search(/\[.*\]/)
            envEndIndex = interaction.fields.getTextInputValue('envInput').search(']')
            if (envStartIndex == -1) {
                const embed = new EmbedBuilder()
                    .setTitle('❌')
                    .setFields(
                        { name: "Error", value: 'Error finding the Enviroment name' },
                        { name: "Received Input", value: interaction.fields.getTextInputValue('envInput') }
                    )
                isCommandRunning = false;
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply('Cloning Repository');
                envName = interaction.fields.getTextInputValue('envInput').substring(envStartIndex + 5, envEndIndex);
                const gitPath = path.join(__dirname, 'devwled');
                const child = spawn('git', ['pull'], { cwd: gitPath });
                child.on('close', code => {
                    //const npm_ci = spawn('npm.cmd',['ci'], { cwd: gitPath }); //windows
                    const npm_ci = spawn('npm',['ci'], { cwd: gitPath }); //linux
                    npm_ci.on('close', code => {
                        interaction.editReply('Cloned Repository. Now adding the Enviroment');
                        const overridePath = path.join(gitPath, 'platformio_override.ini');
                        enviromentConfig = '[platformio]\ndefault_envs = ' + envName + '\n\n' + interaction.fields.getTextInputValue('envInput');
                        fs.writeFile(overridePath, enviromentConfig, function (err) { });
                        interaction.editReply('Enviroment Added. Building Firmware.⏳');
                        const build = spawn('pio', ['run', '-j 1', '-d', gitPath]);
                        fs.writeFile('commands/build/devlog.txt', 'Build Log:\n', function (err) { });
                        build.stdout.on("data", data => {
                            fs.appendFile('commands/build/devlog.txt', data, function (err) { });
                        });
                        build.stderr.on("data", data => {
                            fs.appendFile('commands/build/devlog.txt', data, function (err) { });
                        });
                        build.on('error', (error) => {
                            fs.appendFile('commands/build/devlog.txt', error, function (err) { });
                        });
                        build.on('close', code => {
                            isCommandRunning = false;
                            if (code == 0) {
                                console.log(`child process exited with code ${code}`);
                                const firmwarePath = path.join(gitPath, 'build_output', 'firmware', envName + '.bin');
                                const file = new AttachmentBuilder(firmwarePath);
                                const overrideFile = new AttachmentBuilder(overridePath);
                                interaction.editReply({ content: '✅Build sucessful. Files are below.', files: [file, overrideFile] })
                            } else {
                                const file = new AttachmentBuilder('commands/build/devlog.txt');
                                const overrideFile = new AttachmentBuilder(overridePath);
                                interaction.editReply({ content: '❌Build unsucessful. Logfile and Enviroment file are below.', files: [file, overrideFile] })
                            }
                        });
                })
            })
            }
        }
    },
};