const http = require('http');
http.createServer((req, res) => {
    res.write("I'm alive");
    res.end();
}).listen(8080);

require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Типы ивентов с ценами и каналами
const EVENT_TYPES = {
    community: { name: 'Community', min: 5, max: 25, channelId: '1475487079164149913' },
    plus: { name: 'Plus', min: 25, max: 99, channelId: '1475486974252023872' },
    super: { name: 'Super', min: 100, max: 499, channelId: '1475486893859930263' },
    ultra: { name: 'Ultra', min: 500, max: 999, channelId: '1475486697876754593' },
    ultimate: { name: 'Ultimate', min: 1000, max: 1999, channelId: '1475486579664617472' },
    extreme: { name: 'Extreme', min: 2000, max: 4999, channelId: '1475486418972184640' },
    godly: { name: 'Godly', min: 5000, max: 10000, channelId: '1475485770235117658' }
};

// ID ролей для каждого типа ивента (для доступа)
const EVENT_ROLES = {
    community: '1480488494240366775',
    plus: '1480488553397096508',
    super: '1480488633055313981',
    ultra: '1480488736302174260',
    ultimate: '1480488801515344105',
    extreme: '1480488892078489680',
    godly: '1480488963914465340'
};

// ID ролей для пинга при создании ивента
const PING_ROLES = {
    community: '1480533620535066635',
    plus: '1480533677095260291',
    super: '1480533717071171615',
    ultra: '1480533781612855437',
    ultimate: '1480533827108602089',
    extreme: '1480533870909587508',
    godly: '1480533912127017043'
};

// ID ролей для доступа к командам редактирования статистики
const ADMIN_ROLES = [
    '1475552294203424880',
    '1475552827626619050',
    '1476518047438209076'
];

// Путь к файлу статистики
const STATS_FILE = path.join(__dirname, 'hostStats.json');

// Статистика хостов
let hostStats = new Map();

// Загрузка статистики из файла
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = fs.readFileSync(STATS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            hostStats = new Map(Object.entries(parsed));
            console.log(`Loaded stats for ${hostStats.size} users`);
        }
    } catch (err) {
        console.error('Error loading stats:', err);
        hostStats = new Map();
    }
}

// Сохранение статистики в файл
function saveStats() {
    try {
        const obj = Object.fromEntries(hostStats);
        fs.writeFileSync(STATS_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error('Error saving stats:', err);
    }
}

client.on('clientReady', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    loadStats();
    client.user.setPresence({
        activities: [{ name: '-community <robux>, -plus <robux>...', type: ActivityType.Watching }],
        status: 'online'
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = '-';
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Проверка: является ли команда типом ивента
    if (EVENT_TYPES[command]) {
        const eventType = command;
        const eventInfo = EVENT_TYPES[eventType];
        const robux = parseInt(args[0]);

        // Проверка канала
        const allowedChannelId = eventInfo.channelId;
        if (!allowedChannelId || allowedChannelId === `your_${eventType}_channel_id`) {
            return message.reply({ content: `❌ Channel ID not configured for ${eventInfo.name} events!`, ephemeral: true });
        }
        
        if (message.channel.id !== allowedChannelId) {
            return message.reply({ content: `❌ You can only host ${eventInfo.name} events in <#${allowedChannelId}>!`, ephemeral: true });
        }

        // Проверка на роль
        const member = message.member;
        const roleId = EVENT_ROLES[eventType];
        
        if (!roleId || roleId === `your_${eventType}_role_id`) {
            return message.reply({ content: `❌ Role ID not configured for ${eventInfo.name} events!`, ephemeral: true });
        }
        
        const hasRole = member.roles.cache.has(roleId);

        if (!hasRole) {
            return message.reply({ content: `❌ You need the ${eventInfo.name} role to host ${eventInfo.name} events!`, ephemeral: true });
        }

        // Проверка цены
        if (!robux || robux < eventInfo.min || robux > eventInfo.max) {
            return message.reply({ content: `❌ Invalid Robux amount! For ${eventInfo.name}: ${eventInfo.min}-${eventInfo.max} R$\nExample: \`-${command} ${eventInfo.min}\``, ephemeral: true });
        }

        // Обновление статистики хоста
        if (!hostStats.has(message.author.id)) {
            hostStats.set(message.author.id, createEmptyStats());
        }
        const stats = hostStats.get(message.author.id);
        stats.eventsHosted++;
        stats.totalRobux += robux;
        stats.byType[eventType]++;

        // Сохранение статистики
        saveStats();

        // Пинг роли для этого типа ивента
        const pingRoleId = PING_ROLES[eventType];
        const rolePing = pingRoleId && pingRoleId !== `your_${eventType}_ping_role_id` ? `<@&${pingRoleId}>` : '';

        await message.channel.send(`${message.author} is starting a ${eventInfo.name} Event! (${robux} R$)\n\n${rolePing}`);
        return;
    }

    // Команда: -status [user]
    if (command === 'status') {
        const user = message.mentions.users.first() || message.author;
        
        // Проверка: есть ли у пользователя любая роль хоста
        const member = message.member;
        const hostRoleIds = Object.values(EVENT_ROLES);
        const hasAnyHostRole = member.roles.cache.some(role => hostRoleIds.includes(role.id));
        
        if (!hasAnyHostRole) {
            return message.reply({ 
                content: '❌ You need a host role to view stats!', 
                ephemeral: true 
            });
        }
        
        const stats = hostStats.get(user.id) || createEmptyStats();

        let typeStats = '';
        for (const [type, count] of Object.entries(stats.byType)) {
            if (count > 0) {
                const eventName = EVENT_TYPES[type].name;
                typeStats += `${eventName}: ${count} events\n`;
            }
        }

        if (!typeStats) {
            typeStats = 'No events hosted yet\n';
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Host Status')
            .setDescription(`**User:** ${user.tag}`)
            .addFields(
                { name: '🎯 Total Events', value: `${stats.eventsHosted}`, inline: true },
                { name: '💰 Total Robux', value: `${stats.totalRobux} R$`, inline: true },
                { name: '**Events by Type:**', value: typeStats, inline: false }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        return;
    }

    // Команда: -setstats <user> <robux>
    if (command === 'setstats') {
        // Проверка: есть ли у пользователя роль администратора
        const member = message.member;
        const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));

        if (!hasAdminRole) {
            return message.reply({
                content: '❌ You don\'t have permission to use this command!',
                ephemeral: true
            });
        }

        const user = message.mentions.users.first();
        const robux = parseInt(args[1]);

        if (!user || !robux || robux < 0) {
            return message.reply({
                content: '❌ Usage: `-setstats @user <robux>`',
                ephemeral: true
            });
        }

        if (!hostStats.has(user.id)) {
            hostStats.set(user.id, createEmptyStats());
        }

        const stats = hostStats.get(user.id);
        stats.totalRobux = robux;

        // Сохранение статистики
        saveStats();

        await message.reply({
            content: `✅ Set **${user.tag}**'s total Robux to **${robux} R$**!`,
            ephemeral: true
        });
        return;
    }

    // Команда: -seteventstats <user> <type> <count>
    if (command === 'seteventstats') {
        // Проверка: есть ли у пользователя роль администратора
        const member = message.member;
        const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));

        if (!hasAdminRole) {
            return message.reply({
                content: '❌ You don\'t have permission to use this command!',
                ephemeral: true
            });
        }

        const user = message.mentions.users.first();
        const eventType = args[1]?.toLowerCase();
        const count = parseInt(args[2]);

        if (!user || !eventType || !EVENT_TYPES[eventType] || !count || count < 0) {
            const types = Object.keys(EVENT_TYPES).join(', ');
            return message.reply({
                content: `❌ Usage: \`-seteventstats @user <type> <count>\`\nTypes: ${types}`,
                ephemeral: true
            });
        }

        if (!hostStats.has(user.id)) {
            hostStats.set(user.id, createEmptyStats());
        }

        const stats = hostStats.get(user.id);
        stats.byType[eventType] = count;
        stats.eventsHosted = Object.values(stats.byType).reduce((a, b) => a + b, 0);

        // Сохранение статистики
        saveStats();

        await message.reply({
            content: `✅ Set **${user.tag}**'s ${EVENT_TYPES[eventType].name} events to **${count}**!`,
            ephemeral: true
        });
        return;
    }
});

function createEmptyStats() {
    return {
        eventsHosted: 0,
        totalRobux: 0,
        byType: {
            community: 0,
            plus: 0,
            super: 0,
            ultra: 0,
            ultimate: 0,
            extreme: 0,
            godly: 0
        }
    };
}

client.login(process.env.DISCORD_TOKEN);