const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const { token_live, token_dev, currentset } = require('./config.json');
var token;
console.log(`Current set is ${currentset}`);
if (currentset == "live") {
    token = token_live;
} else if (currentset == "dev") {
    token = token_dev;
}

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