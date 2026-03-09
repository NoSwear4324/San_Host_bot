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
const ADMIN_ROLES = ['1480488494240366775'];

// Путь к файлу статистики
const STATS_FILE = path.join(__dirname, 'hostStats.json');

// Статистика хостов
let hostStats = new Map();

// Хранилище рейтингов ивентов
const eventRatings = new Map();

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
        activities: [{ name: '-community, -plus, -super...', type: ActivityType.Watching }],
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
        
        // Если не указано число, используем минимальное значение
        let robux;
        if (!args[0] || isNaN(parseInt(args[0]))) {
            robux = eventInfo.min;
        } else {
            robux = parseInt(args[0]);
        }

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

        const eventMessage = await message.channel.send(`${message.author} is starting a ${eventInfo.name} Event! (${robux} R$)\n\n${rolePing}\n\n**React below to rate this event:**\n👍 Good | 👎 Bad`);
        
        // Сохраняем информацию о рейтинге для этого сообщения
        eventRatings.set(eventMessage.id, {
            host: message.author.id,
            type: eventType,
            robux: robux,
            likes: 0,
            dislikes: 0,
            rated: []
        });
        
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

        // Подсчёт рейтинга
        let totalLikes = 0;
        let totalDislikes = 0;
        eventRatings.forEach((rating, eventId) => {
            if (rating.host === user.id) {
                totalLikes += rating.likes;
                totalDislikes += rating.dislikes;
            }
        });
        
        const totalRatings = totalLikes + totalDislikes;
        const ratingPercent = totalRatings > 0 ? Math.round((totalLikes / totalRatings) * 100) : 0;
        let ratingLevel = '⭐ No ratings yet';
        if (totalRatings > 0) {
            if (ratingPercent >= 90) ratingLevel = '🏆 Diamond Host';
            else if (ratingPercent >= 80) ratingLevel = '🥇 Gold Host';
            else if (ratingPercent >= 70) ratingLevel = '🥈 Silver Host';
            else if (ratingPercent >= 60) ratingLevel = '🥉 Bronze Host';
            else ratingLevel = '⚠️ Low Rated Host';
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Host Status')
            .setDescription(`**User:** ${user.tag}`)
            .addFields(
                { name: '🎯 Total Events', value: `${stats.eventsHosted}`, inline: true },
                { name: '💰 Total Robux', value: `${stats.totalRobux} R$`, inline: true },
                { name: '**Events by Type:**', value: typeStats, inline: false },
                { name: '⭐ Rating', value: `${ratingLevel}\n👍 ${totalLikes} | 👎 ${totalDislikes} (${ratingPercent}% positive)`, inline: false }
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
        let robuxInput = args[1];

        if (!user || !robuxInput) {
            return message.reply({
                content: '❌ Usage: `-setstats @user <robux>` or `-setstats @user -50` to subtract',
                ephemeral: true
            });
        }

        if (!hostStats.has(user.id)) {
            hostStats.set(user.id, createEmptyStats());
        }

        const stats = hostStats.get(user.id);
        const currentRobux = stats.totalRobux;
        
        // Проверка: отрицательное число (отнимание) или положительное (установка)
        let newRobux;
        let message_text;
        
        if (robuxInput.startsWith('-')) {
            // Отнимаем
            const subtract = parseInt(robuxInput);
            newRobux = Math.max(0, currentRobux + subtract); // subtract уже отрицательный
            message_text = `✅ Removed **${Math.abs(subtract)} R$** from **${user.tag}**! (${currentRobux} → ${newRobux} R$)`;
        } else {
            // Устанавливаем
            newRobux = parseInt(robuxInput);
            message_text = `✅ Set **${user.tag}**'s total Robux to **${newRobux} R$**!`;
        }

        stats.totalRobux = newRobux;

        // Сохранение статистики
        saveStats();

        await message.reply({
            content: message_text,
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
        let countInput = args[2];

        if (!user || !eventType || !EVENT_TYPES[eventType] || !countInput) {
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
        const currentCount = stats.byType[eventType];
        
        // Проверка: отрицательное число (отнимание) или положительное (установка)
        let newCount;
        let message_text;
        
        if (countInput.startsWith('-')) {
            // Отнимаем
            const subtract = parseInt(countInput);
            newCount = Math.max(0, currentCount + subtract); // subtract уже отрицательный
            message_text = `✅ Removed **${Math.abs(subtract)} ${EVENT_TYPES[eventType].name}** events from **${user.tag}**! (${currentCount} → ${newCount})`;
        } else {
            // Устанавливаем
            newCount = parseInt(countInput);
            message_text = `✅ Set **${user.tag}**'s ${EVENT_TYPES[eventType].name} events to **${newCount}**!`;
        }

        stats.byType[eventType] = newCount;
        stats.eventsHosted = Object.values(stats.byType).reduce((a, b) => a + b, 0);

        // Сохранение статистики
        saveStats();

        await message.reply({
            content: message_text,
            ephemeral: true
        });
        return;
    }

    // Команда: -rating (ответ на сообщение ивента)
    if (command === 'rating') {
        // Проверяем, есть ли ответ на сообщение
        if (!message.reference || !message.reference.messageId) {
            return message.reply({
                content: '❌ Reply to an event message to view its rating!',
                ephemeral: true
            });
        }
        
        const eventId = message.reference.messageId;
        
        if (!eventRatings.has(eventId)) {
            return message.reply({
                content: '❌ This is not a valid event message!',
                ephemeral: true
            });
        }
        
        const rating = eventRatings.get(eventId);
        const totalRatings = rating.likes + rating.dislikes;
        const percent = totalRatings > 0 ? Math.round((rating.likes / totalRatings) * 100) : 0;
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Event Rating')
            .setDescription(`**Host:** <@${rating.host}>\n**Type:** ${EVENT_TYPES[rating.type].name} (${rating.robux} R$)`)
            .addFields(
                { name: '👍 Positive', value: `${rating.likes}`, inline: true },
                { name: '👎 Negative', value: `${rating.dislikes}`, inline: true },
                { name: '⭐ Rating', value: `${percent}% positive`, inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }

    // Команда: -toprating
    if (command === 'toprating') {
        // Считаем рейтинг для каждого хоста
        const hostRatings = new Map();
        
        eventRatings.forEach((rating) => {
            if (!hostRatings.has(rating.host)) {
                hostRatings.set(rating.host, { likes: 0, dislikes: 0, events: 0 });
            }
            const data = hostRatings.get(rating.host);
            data.likes += rating.likes;
            data.dislikes += rating.dislikes;
            data.events++;
        });
        
        // Сортируем по проценту положительных (минимум 5 голосов)
        const sorted = Array.from(hostRatings.entries())
            .filter(([_, data]) => data.likes + data.dislikes >= 5)
            .map(([hostId, data]) => {
                const total = data.likes + data.dislikes;
                const percent = Math.round((data.likes / total) * 100);
                return { hostId, likes: data.likes, dislikes: data.dislikes, percent, events: data.events };
            })
            .sort((a, b) => b.percent - a.percent || b.likes - a.likes)
            .slice(0, 10);
        
        if (sorted.length === 0) {
            return message.reply({
                content: '❌ No ratings yet!',
                ephemeral: true
            });
        }
        
        let leaderboard = '';
        sorted.forEach((entry, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboard += `${medal} <@${entry.hostId}> - ${entry.percent}% (${entry.likes}👍 / ${entry.dislikes}👎) in ${entry.events} events\n`;
        });
        
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Top Rated Hosts')
            .setDescription(leaderboard)
            .setFooter({ text: 'Minimum 5 ratings required' })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }

    // Команда: -help
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 RBX Host Bot Commands')
            .setDescription('**Host Commands:**')
            .addFields(
                { name: '-community <robux>', value: `Host Community event (${EVENT_TYPES.community.min}-${EVENT_TYPES.community.max} R$)`, inline: false },
                { name: '-plus <robux>', value: `Host Plus event (${EVENT_TYPES.plus.min}-${EVENT_TYPES.plus.max} R$)`, inline: false },
                { name: '-super <robux>', value: `Host Super event (${EVENT_TYPES.super.min}-${EVENT_TYPES.super.max} R$)`, inline: false },
                { name: '-ultra <robux>', value: `Host Ultra event (${EVENT_TYPES.ultra.min}-${EVENT_TYPES.ultra.max} R$)`, inline: false },
                { name: '-ultimate <robux>', value: `Host Ultimate event (${EVENT_TYPES.ultimate.min}-${EVENT_TYPES.ultimate.max} R$)`, inline: false },
                { name: '-extreme <robux>', value: `Host Extreme event (${EVENT_TYPES.extreme.min}-${EVENT_TYPES.extreme.max} R$)`, inline: false },
                { name: '-godly <robux>', value: `Host Godly event (${EVENT_TYPES.godly.min}-${EVENT_TYPES.godly.max} R$)`, inline: false },
                { name: '-status [user]', value: 'View host statistics & rating', inline: false },
                { name: '-rating', value: 'Reply to event to view its rating', inline: false },
                { name: '-toprating', value: 'Show top rated hosts', inline: false },
                { name: '-help', value: 'Show this help message', inline: false },
                { name: '**Admin Commands:**', value: 'Requires admin role (Creator, Head Admin, Co Owner)', inline: false },
                { name: '-setstats @user <robux>', value: 'Set Robux or use -50 to subtract', inline: false },
                { name: '-seteventstats @user <type> <count>', value: 'Set events or use -5 to subtract', inline: false }
            )
            .setFooter({ text: 'Each event type has its own channel and role requirement' })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
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

// Обработка реакций для рейтинга
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (!['👍', '👎'].includes(reaction.emoji.name)) return;
    
    const rating = eventRatings.get(reaction.message.id);
    if (!rating) return;
    
    // Если уже голосовал, убираем старый голос
    if (rating.rated.includes(user.id)) {
        return;
    }
    
    rating.rated.push(user.id);
    
    if (reaction.emoji.name === '👍') {
        rating.likes++;
    } else if (reaction.emoji.name === '👎') {
        rating.dislikes++;
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (!['👍', '👎'].includes(reaction.emoji.name)) return;
    
    const rating = eventRatings.get(reaction.message.id);
    if (!rating) return;
    
    if (!rating.rated.includes(user.id)) return;
    rating.rated = rating.rated.filter(id => id !== user.id);
    
    if (reaction.emoji.name === '👍') {
        rating.likes = Math.max(0, rating.likes - 1);
    } else if (reaction.emoji.name === '👎') {
        rating.dislikes = Math.max(0, rating.dislikes - 1);
    }
});

client.login(process.env.DISCORD_TOKEN);
