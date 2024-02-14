const { Events, Collection } = require('discord.js');
const fs = require('node:fs');

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                fs.appendFile('log.txt', `No command matching ${interaction.commandName} was found.`, function (err) { });
                return;
            }

            const { cooldowns } = client;

            if (!cooldowns.has(command.data.name)) {
                cooldowns.set(command.data.name, new Collection());
            }
            const now = Date.now();
            const timestamps = cooldowns.get(command.data.name);
            const defaultCooldownDuration = 3;
            const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    return interaction.reply({ content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, ephemeral: true });
                }
            }
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

            try {
                fs.appendFile('log.csv',`\n${Date.now()};${interaction.guildId};${interaction.user.id};${command.data.name};${interaction.options.getString('type')}`, function (err) { });
                console.log(`${Date.now()};${interaction.guildId};${interaction.user.id};${command.data.name};${interaction.options.getString('type')}`);
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                fs.appendFile('log.txt', error, function (err) { });
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }

        } else if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'buildModal') {
                command = interaction.client.commands.get('build');
                try {
                    await command.execute(interaction, client);
                } catch (error) {
                    console.error(error);
                    fs.appendFile('log.txt', error, function (err) { });
                    await interaction.reply({ content: 'There was an error while executing this input!', ephemeral: true });
                }
            } else if (interaction.customId === 'mmbuildModal') {
                command = interaction.client.commands.get('mmbuild');
                try {
                    await command.execute(interaction, client);
                } catch (error) {
                    console.error(error);
                    fs.appendFile('log.txt', error, function (err) { });
                    await interaction.reply({ content: 'There was an error while executing this input!', ephemeral: true });
                }
            }
        }
    },
};