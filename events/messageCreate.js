const { Events } = require('discord.js');
const fs = require('node:fs');

module.exports = {
    name: Events.MessageCreate,
    async execute(client, message) {
        console.log(message.channelId);
        fs.appendFile('log_messages.csv',`\n${Date.now()};${message.guildId};${message.guild};${message.channel};${message.channelId}`, function (err) { });
    },
};