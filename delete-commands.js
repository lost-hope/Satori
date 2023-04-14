const { REST, Routes } = require('discord.js');
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

const commands = [];

const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        commands.push(command.data.toJSON());
    }
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