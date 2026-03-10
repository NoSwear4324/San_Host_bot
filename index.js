require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events } = require('discord.js');
const mongoose = require('mongoose');

// === ПОДКЛЮЧЕНИЕ К MONGODB ===
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err));

// === СХЕМА СТАТИСТИКИ ===
const hostStatsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    eventsHosted: { type: Number, default: 0 },
    totalRobux: { type: Number, default: 0 },
    byType: {
        community: { type: Number, default: 0 },
        plus: { type: Number, default: 0 },
        super: { type: Number, default: 0 },
        ultra: { type: Number, default: 0 },
        ultimate: { type: Number, default: 0 },
        extreme: { type: Number, default: 0 },
        godly: { type: Number, default: 0 }
    }
});

const HostStats = mongoose.model('HostStats', hostStatsSchema);

// === КЛИЕНТ DISCORD ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// === КОНФИГУРАЦИЯ ===
const EVENT_TYPES = {
    community: { name: 'Community', min: 5, max: 25, channelId: '1475487079164149913' },
    plus: { name: 'Plus', min: 25, max: 99, channelId: '1475486974252023872' },
    super: { name: 'Super', min: 100, max: 499, channelId: '1475486893859930263' },
    ultra: { name: 'Ultra', min: 500, max: 999, channelId: '1475486697876754593' },
    ultimate: { name: 'Ultimate', min: 1000, max: 1999, channelId: '1475486579664617472' },
    extreme: { name: 'Extreme', min: 2000, max: 4999, channelId: '1475486418972184640' },
    godly: { name: 'Godly', min: 5000, max: 10000, channelId: '1475485770235117658' }
};

const EVENT_ROLES = {
    community: '1480488494240366775',
    plus: '1480488553397096508',
    super: '1480488633055313981',
    ultra: '1480488736302174260',
    ultimate: '1480488801515344105',
    extreme: '1480488892078489680',
    godly: '1480488963914465340'
};

const PING_ROLES = {
    community: '1480533620535066635',
    plus: '1480533677095260291',
    super: '1480533717071171615',
    ultra: '1480533781612855437',
    ultimate: '1480533827108602089',
    extreme: '1480533870909587508',
    godly: '1480533912127017043'
};

const ADMIN_ROLES = [
    '1475552294203424880',
    '1475552827626619050'
];
const eventRatings = new Map();

// === ФУНКЦИИ БД ===

async function getStats(userId) {
    let stats = await HostStats.findOne({ userId });
    if (!stats) {
        stats = await HostStats.create({
            userId,
            eventsHosted: 0,
            totalRobux: 0,
            byType: { community: 0, plus: 0, super: 0, ultra: 0, ultimate: 0, extreme: 0, godly: 0 }
        });
    }
    return stats;
}

async function updateStats(userId, updates) {
    await HostStats.findOneAndUpdate({ userId }, updates, { upsert: true, new: true });
}

async function updateRatingEmbed(eventMessage, rating) {
    const totalRatings = rating.likes + rating.dislikes;
    const percent = totalRatings > 0 ? Math.round((rating.likes / totalRatings) * 100) : 0;
    
    let ratingText = 'No ratings yet';
    let color = 0x00AE86;

    if (totalRatings > 0) {
        if (percent >= 90) { ratingText = '🏆 Diamond'; color = 0xB9F2FF; }
        else if (percent >= 80) { ratingText = '🥇 Gold'; color = 0xFFD700; }
        else if (percent >= 70) { ratingText = '🥈 Silver'; color = 0xC0C0C0; }
        else if (percent >= 60) { ratingText = '🥉 Bronze'; color = 0xCD7F32; }
        else { ratingText = '⚠️ Low'; color = 0xFF4500; }
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 ${EVENT_TYPES[rating.type].name} Event`)
        .setDescription(`<@${rating.host}> is hosting a ${EVENT_TYPES[rating.type].name} Event! (${rating.robux} R$)`)
        .addFields(
            { name: '👍 Positive', value: `${rating.likes}`, inline: true },
            { name: '👎 Negative', value: `${rating.dislikes}`, inline: true },
            { name: '⭐ Score', value: totalRatings === 0 ? 'No ratings yet' : `${percent}% (${ratingText})`, inline: true }
        )
        .setFooter({ text: 'React to rate this event' })
        .setTimestamp();

    try {
        const pingRoleId = PING_ROLES[rating.type];
        const rolePing = pingRoleId && !pingRoleId.includes('your_') ? `<@&${pingRoleId}>` : '';
        await eventMessage.edit({ content: rolePing || ' ', embeds: [embed] });
    } catch (err) {
        console.error('Error updating rating embed:', err);
    }
}

// === СОБЫТИЯ ===

client.once(Events.ClientReady, async () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}`);
    const count = await HostStats.countDocuments();
    console.log(`📊 Loaded ${count} users from database`);
    client.user.setPresence({
        activities: [{ name: '-community, -plus, -super...', type: ActivityType.Watching }],
        status: 'online'
    });
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    
    const prefix = '-';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // === СОЗДАНИЕ ИВЕНТА ===
    if (EVENT_TYPES[command]) {
        const eventType = command;
        const eventInfo = EVENT_TYPES[eventType];
        
        let robux;
        if (!args[0] || isNaN(parseInt(args[0]))) {
            robux = eventInfo.min;
        } else {
            robux = parseInt(args[0]);
        }

        const allowedChannelId = eventInfo.channelId;
        if (!allowedChannelId || allowedChannelId.includes('your_')) {
            return message.reply({ content: `❌ Channel ID not configured!`, ephemeral: true });
        }

        if (message.channel.id !== allowedChannelId) {
            return message.reply({ content: `❌ You can only host ${eventInfo.name} events in <#${allowedChannelId}>!`, ephemeral: true });
        }

        const member = message.member;
        if (!member) return;

        const roleId = EVENT_ROLES[eventType];
        if (!roleId || roleId.includes('your_')) {
            return message.reply({ content: `❌ Role ID not configured!`, ephemeral: true });
        }

        if (!member.roles.cache.has(roleId)) {
            return message.reply({ content: `❌ You need the ${eventInfo.name} role!`, ephemeral: true });
        }

        if (!robux || robux < eventInfo.min || robux > eventInfo.max) {
            return message.reply({ 
                content: `❌ Invalid Robux! ${eventInfo.min}-${eventInfo.max} R$`, 
                ephemeral: true 
            });
        }

        // ✅ ОБНОВЛЕНИЕ СТАТИСТИКИ В БД
        await updateStats(message.author.id, {
            $inc: {
                eventsHosted: 1,
                totalRobux: robux,
                [`byType.${eventType}`]: 1
            }
        });

        const pingRoleId = PING_ROLES[eventType];
        const rolePing = pingRoleId && !pingRoleId.includes('your_') ? `<@&${pingRoleId}>` : '';

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎮 ${eventInfo.name} Event`)
            .setDescription(`${message.author} is starting a ${eventInfo.name} Event! (${robux} R$)`)
            .addFields(
                { name: '👍 Positive', value: '0', inline: true },
                { name: '👎 Negative', value: '0', inline: true },
                { name: '⭐ Score', value: 'No ratings yet', inline: true }
            )
            .setFooter({ text: 'React to rate this event' })
            .setTimestamp();

        const eventMessage = await message.channel.send({ content: rolePing || ' ', embeds: [embed] });
        
        eventRatings.set(eventMessage.id, {
            host: message.author.id,
            type: eventType,
            robux: robux,
            likes: 0,
            dislikes: 0,
            rated: []
        });
        
        await eventMessage.react('👍');
        await eventMessage.react('👎');
        return;
    }

    // === КОМАНДА: -status ===
    if (command === 'status') {
        const user = message.mentions.users.first() || message.author;
        const member = message.member;
        if (!member) return;

        const hostRoleIds = Object.values(EVENT_ROLES);
        const hasAnyHostRole = member.roles.cache.some(role => hostRoleIds.includes(role.id));

        if (!hasAnyHostRole) {
            return message.reply({ content: '❌ You need a host role!', ephemeral: true });
        }

        const stats = await getStats(user.id);

        let typeStats = '';
        for (const [type, count] of Object.entries(stats.byType)) {
            if (count > 0) {
                typeStats += `${EVENT_TYPES[type].name}: ${count} events\n`;
            }
        }
        if (!typeStats) typeStats = 'No events hosted yet\n';

        let totalLikes = 0;
        let totalDislikes = 0;
        eventRatings.forEach((rating) => {
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

    // === КОМАНДА: -setstats (Admin) ===
    if (command === 'setstats') {
        const member = message.member;
        if (!member) return;

        const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
        if (!hasAdminRole) {
            return message.reply({ content: '❌ No permission!', ephemeral: true });
        }

        const user = message.mentions.users.first();
        const robuxInput = args[1];

        if (!user || !robuxInput) {
            return message.reply({ content: '❌ Usage: `-setstats @user <robux>`', ephemeral: true });
        }

        const stats = await getStats(user.id);
        const currentRobux = stats.totalRobux;
        let newRobux, messageText;
        
        if (robuxInput.startsWith('-')) {
            const subtract = parseInt(robuxInput);
            newRobux = Math.max(0, currentRobux + subtract);
            messageText = `✅ Removed **${Math.abs(subtract)} R$**!`;
        } else {
            newRobux = parseInt(robuxInput);
            messageText = `✅ Set Robux to **${newRobux} R$**!`;
        }

        await updateStats(user.id, { totalRobux: newRobux });

        await message.reply({ content: messageText, ephemeral: true });
        return;
    }

    // === КОМАНДА: -seteventstats (Admin) ===
    if (command === 'seteventstats') {
        const member = message.member;
        if (!member) return;

        const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
        if (!hasAdminRole) {
            return message.reply({ content: '❌ No permission!', ephemeral: true });
        }

        const user = message.mentions.users.first();
        const eventType = args[1]?.toLowerCase();
        const countInput = args[2];

        if (!user || !eventType || !EVENT_TYPES[eventType] || !countInput) {
            return message.reply({ content: '❌ Usage: `-seteventstats @user <type> <count>`', ephemeral: true });
        }

        const stats = await getStats(user.id);
        const currentCount = stats.byType[eventType] || 0;
        let newCount, messageText;
        
        if (countInput.startsWith('-')) {
            const subtract = parseInt(countInput);
            newCount = Math.max(0, currentCount + subtract);
            messageText = `✅ Removed **${Math.abs(subtract)}** events!`;
        } else {
            newCount = parseInt(countInput);
            messageText = `✅ Set events to **${newCount}**!`;
        }

        await updateStats(user.id, { 
            [`byType.${eventType}`]: newCount
        });
        
        const updatedStats = await getStats(user.id);
        const totalEvents = Object.values(updatedStats.byType).reduce((a, b) => a + b, 0);
        await updateStats(user.id, { eventsHosted: totalEvents });

        await message.reply({ content: messageText, ephemeral: true });
        return;
    }

    // === КОМАНДА: -toprating ===
    if (command === 'toprating') {
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
            return message.reply({ content: '❌ No ratings yet (min 5 votes)!', ephemeral: true });
        }
        
        let leaderboard = '';
        sorted.forEach((entry, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboard += `${medal} <@${entry.hostId}> - ${entry.percent}% (${entry.likes}👍 / ${entry.dislikes}👎)\n`;
        });
        
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Top Rated Hosts')
            .setDescription(leaderboard)
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }

    // === КОМАНДА: -help ===
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
                { name: '-status [user]', value: 'View host statistics', inline: false },
                { name: '-help', value: 'Show this help message', inline: false },
                { name: '**Admin Commands:**', value: 'Requires admin role', inline: false },
                { name: '-setstats @user <robux>', value: 'Set or subtract Robux (use -50 to subtract)', inline: false },
                { name: '-seteventstats @user <type> <count>', value: 'Set event count for specific type', inline: false }
            )
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        return;
    }
});

// === ОБРАБОТКА РЕАКЦИЙ ===

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (!['👍', '👎'].includes(reaction.emoji.name)) return;

    const rating = eventRatings.get(reaction.message.id);
    if (!rating) return;

    if (rating.rated.includes(user.id)) {
        const msg = reaction.message;
        const otherEmoji = reaction.emoji.name === '👍' ? '👎' : '👍';
        const otherReaction = msg.reactions.resolve(otherEmoji);
        
        if (otherReaction) {
            const users = await otherReaction.users.fetch();
            if (users.has(user.id)) {
                await otherReaction.users.remove(user.id);
                if (otherEmoji === '👍') rating.likes = Math.max(0, rating.likes - 1);
                else rating.dislikes = Math.max(0, rating.dislikes - 1);
            }
        }
    } else {
        rating.rated.push(user.id);
    }

    if (reaction.emoji.name === '👍') rating.likes++;
    else if (reaction.emoji.name === '👎') rating.dislikes++;

    await updateRatingEmbed(reaction.message, rating);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (!['👍', '👎'].includes(reaction.emoji.name)) return;

    const rating = eventRatings.get(reaction.message.id);
    if (!rating) return;
    if (!rating.rated.includes(user.id)) return;

    rating.rated = rating.rated.filter(id => id !== user.id);

    if (reaction.emoji.name === '👍') rating.likes = Math.max(0, rating.likes - 1);
    else if (reaction.emoji.name === '👎') rating.dislikes = Math.max(0, rating.dislikes - 1);

    await updateRatingEmbed(reaction.message, rating);
});

// === ЗАПУСК ===
client.login(process.env.DISCORD_TOKEN);