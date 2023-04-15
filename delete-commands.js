const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const { clientId_dev, clientId_live, guildId_dev, guildId_live, token_dev, token_live, currentset } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');

var token;
var clientId;
var guildId;
console.log(`Current set is ${currentset}`);
if (currentset == "live") {
    token = token_live;
    clientId = clientId_live;
    guildId = guildId_live;
} else if (currentset == "dev") {
    token = token_dev;
    clientId = clientId_dev;
    guildId = guildId_dev;
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started deleting application (/) commands.`);

        // for guild-based commands
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
            .then(() => console.log('Successfully deleted all guild commands.'))
            .catch(console.error);

        // for global commands
        rest.put(Routes.applicationCommands(clientId), { body: [] })
            .then(() => console.log('Successfully deleted all application commands.'))
            .catch(console.error);




    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});
client.once(Events.ClientReady, c => {
    console.log(`Servers: `);
    client.guilds.cache.forEach(guild => {
        console.log(`${guild.name} | ${guild.id}`);
    })
    client.destroy();
    process.exit(1);
});

client.login(token);