require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events, Partials } = require('discord.js');
const mongoose = require('mongoose');

// ────────────────────────────────────────────────
// MongoDB Connection
// ────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

mongoose.connection.on('error', err => console.error('MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));

// ────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────
const hostStatsSchema = new mongoose.Schema({
    userId:       { type: String, required: true, unique: true },
    eventsHosted: { type: Number, default: 0 },
    totalRobux:   { type: Number, default: 0 },
    totalLikes:   { type: Number, default: 0 },
    totalDislikes:{ type: Number, default: 0 },
    byType: {
        community: { type: Number, default: 0 },
        plus:      { type: Number, default: 0 },
        super:     { type: Number, default: 0 },
        ultra:     { type: Number, default: 0 },
        ultimate:  { type: Number, default: 0 },
        extreme:   { type: Number, default: 0 },
        godly:     { type: Number, default: 0 }
    }
}, { timestamps: true });

const eventSchema = new mongoose.Schema({
    messageId:  { type: String, required: true, unique: true },
    channelId:  { type: String, required: true },
    host:       { type: String, required: true },
    type:       { type: String, required: true },
    robux:      { type: Number, required: true },
    likes:      { type: Number, default: 0 },
    dislikes:   { type: Number, default: 0 },
    voters:     [{ userId: String, vote: { type: String, enum: ['like', 'dislike'] } }],
    active:     { type: Boolean, default: true }
}, { timestamps: true });

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const Event = mongoose.model('Event', eventSchema);

// ────────────────────────────────────────────────
// Client
// ────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// === CONFIGURATION ===
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
    community: '1480488494240366775', plus: '1480488553397096508', super: '1480488633055313981',
    ultra: '1480488736302174260', ultimate: '1480488801515344105', extreme: '1480488892078489680', godly: '1480488963914465340'
};

const PING_ROLES = {
    community: '1480533620535066635', plus: '1480533677095260291', super: '1480533717071171615',
    ultra: '1480533781612855437', ultimate: '1480533827108602089', extreme: '1480533870909587508', godly: '1480533912127017043'
};

const ADMIN_ROLES = ['1475552294203424880', '1475552827626619050']; // Change this to your actual Admin/Staff Role IDs

// ────────────────────────────────────────────────
// Cache
// ────────────────────────────────────────────────
const activeEvents = new Map();

// ────────────────────────────────────────────────
// Helper Functions
// ────────────────────────────────────────────────
async function getStats(userId) {
    let stats = await HostStats.findOne({ userId });
    if (!stats) {
        stats = await HostStats.create({
            userId,
            eventsHosted: 0,
            totalRobux: 0,
            totalLikes: 0,
            totalDislikes: 0,
            byType: Object.fromEntries(Object.keys(EVENT_TYPES).map(k => [k, 0]))
        });
    }
    return stats;
}

async function getEventRating(messageId) {
    if (activeEvents.has(messageId)) {
        return activeEvents.get(messageId);
    }
    const event = await Event.findOne({ messageId, active: true });
    if (event) {
        const rating = {
            _id: event._id,
            host: event.host,
            type: event.type,
            robux: event.robux,
            likes: event.likes,
            dislikes: event.dislikes,
            voters: new Map(event.voters.map(v => [v.userId, v.vote]))
        };
        activeEvents.set(messageId, rating);
        return rating;
    }
    return null;
}

function getBadge(likes, dislikes) {
    const total = likes + dislikes;
    if (total === 0) return { text: 'No ratings yet', color: 0x2F3136, percent: 0 };
    const percent = Math.round((likes / total) * 100);
    if (percent >= 90) return { text: '🏆 Diamond', color: 0xB9F2FF, percent };
    if (percent >= 80) return { text: '🥇 Gold', color: 0xFFD700, percent };
    if (percent >= 70) return { text: '🥈 Silver', color: 0xC0C0C0, percent };
    if (percent >= 60) return { text: '🥉 Bronze', color: 0xCD7F32, percent };
    return { text: '⚠️ Low', color: 0xFF4500, percent };
}

async function updateEventEmbed(message, ev) {
    if (!message) return;

    const total = ev.likes + ev.dislikes;
    const percent = total > 0 ? Math.round((ev.likes / total) * 100) : 0;
    const { text: badge, color } = getBadge(ev.likes, ev.dislikes);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 ${EVENT_TYPES[ev.type]?.name || 'Unknown'} Event`)
        .setDescription(`<@${ev.host}> is hosting an event (${ev.robux} R$)`)
        .addFields(
            { name: '👍', value: `${ev.likes}`, inline: true },
            { name: '👎', value: `${ev.dislikes}`, inline: true },
            { name: '⭐', value: total === 0 ? '—' : `${percent}% • ${badge}`, inline: true }
        )
        .setFooter({ text: 'React: 👍 / 👎' })
        .setTimestamp();

    try {
        await message.edit({ 
            content: PING_ROLES[ev.type] ? `<@&${PING_ROLES[ev.type]}>` : null, 
            embeds: [embed] 
        });
    } catch (err) {
        if (err.code === 10008) {
            activeEvents.delete(message.id);
            await Event.findOneAndUpdate({ messageId: message.id }, { active: false });
        } else {
            console.error('Embed update error:', err);
        }
    }
}

// ────────────────────────────────────────────────
// Ready
// ────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 ${client.user.tag} is online`);
    
    const hostCount = await HostStats.countDocuments();
    console.log(`📊 Hosts in database: ${hostCount}`);
    
    const events = await Event.find({ active: true });
    for (const ev of events) {
        activeEvents.set(ev.messageId, {
            _id: ev._id,
            host: ev.host,
            type: ev.type,
            robux: ev.robux,
            likes: ev.likes,
            dislikes: ev.dislikes,
            voters: new Map(ev.voters.map(v => [v.userId, v.vote]))
        });
    }
    console.log(`🎮 Loaded ${activeEvents.size} active events`);

    client.user.setPresence({
        activities: [{ name: '-help • RBX Events', type: ActivityType.Watching }],
        status: 'online'
    });
});

// ────────────────────────────────────────────────
// Messages / Commands
// ────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    // === CREATE EVENT ===
    if (EVENT_TYPES[cmd]) {
        const type = cmd;
        const cfg = EVENT_TYPES[type];

        if (message.channel.id !== cfg.channelId) {
            return message.reply(`❌ Only in <#${cfg.channelId}>`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
        }

        if (!message.member?.roles.cache.has(EVENT_ROLES[type])) {
            return message.reply(`❌ You need the **${cfg.name}** role`);
        }

        let robux = parseInt(args[0]) || cfg.min;
        if (isNaN(robux) || robux < cfg.min || robux > cfg.max) {
            return message.reply(`❌ Amount must be ${cfg.min}–${cfg.max} R$`);
        }

        await HostStats.findOneAndUpdate(
            { userId: message.author.id },
            {
                $inc: {
                    eventsHosted: 1,
                    totalRobux: robux,
                    [`byType.${type}`]: 1
                }
            },
            { upsert: true, new: true }
        );

        const ping = PING_ROLES[type] ? `<@&${PING_ROLES[type]}>` : '';
        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎮 ${cfg.name} Event`)
            .setDescription(`${message.author} is hosting an event for **${robux} R$**`)
            .addFields(
                { name: '👍', value: '0', inline: true },
                { name: '👎', value: '0', inline: true },
                { name: '⭐', value: 'no ratings yet', inline: true }
            )
            .setFooter({ text: 'Rate with reactions 👍 / 👎' })
            .setTimestamp();

        const msg = await message.channel.send({ content: ping, embeds: [embed] });

        const eventDoc = await Event.create({
            messageId: msg.id,
            channelId: msg.channel.id,
            host: message.author.id,
            type,
            robux,
            likes: 0,
            dislikes: 0,
            voters: []
        });

        activeEvents.set(msg.id, {
            _id: eventDoc._id,
            host: message.author.id,
            type,
            robux,
            likes: 0,
            dislikes: 0,
            voters: new Map()
        });

        await msg.react('👍');
        await msg.react('👎');
        return;
    }

    // === STATUS ===
    if (cmd === 'status') {
        const target = message.mentions.users.first() || message.author;
        const stats = await getStats(target.id);

        const eventStats = await Event.aggregate([
            { $match: { host: target.id, active: true } },
            { $group: { 
                _id: null, 
                likes: { $sum: '$likes' }, 
                dislikes: { $sum: '$dislikes' } 
            }}
        ]);
        
        const { likes = 0, dislikes = 0 } = eventStats[0] || {};
        const { text: badge, percent } = getBadge(likes, dislikes);

        const typesList = Object.entries(stats.byType)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${EVENT_TYPES[k]?.name || k}: **${v}**`)
            .join('\n') || 'has not hosted anything yet';

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
            .setTitle('📊 Host Statistics')
            .addFields(
                { name: '🎯 Events Hosted', value: `${stats.eventsHosted}`, inline: true },
                { name: '💰 Total Robux', value: `${stats.totalRobux}`, inline: true },
                { name: 'By Type', value: typesList, inline: false },
                { name: 'Rating', value: `${badge}\n👍 ${likes} • 👎 ${dislikes} • ${percent}%`, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // === TOP RATING ===
    if (cmd === 'toprating') {
        const top = await Event.aggregate([
            { $match: { active: true } },
            { $group: {
                _id: '$host',
                likes: { $sum: '$likes' },
                dislikes: { $sum: '$dislikes' },
                events: { $sum: 1 }
            }},
            { $addFields: {
                total: { $add: ['$likes', '$dislikes'] },
                percent: { 
                    $cond: [
                        { $gte: [{ $add: ['$likes', '$dislikes'] }, 5] },
                        { $round: [{ $multiply: [{ $divide: ['$likes', { $add: ['$likes', '$dislikes'] }] }, 100] }, 0] },
                        -1
                    ]
                }
            }},
            { $match: { total: { $gte: 5 } }},
            { $sort: { percent: -1, likes: -1 } },
            { $limit: 10 }
        ]);

        if (top.length === 0) return message.reply('❌ No data yet (need ≥5 votes per host)');

        const lines = top.map((e, i) => {
            const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `${m} <@${e._id}> — **${e.percent}%** (${e.likes}👍 / ${e.dislikes}👎)`;
        });

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Top Hosts')
            .setDescription(lines.join('\n'))
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // === HELP (FIXED) ===
    if (cmd === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📜 Commands')
            .setDescription('**Event Creation Commands**')
            .addFields(
                { name: '🎮 Event Types', value: 'Create events with different Robux amounts', inline: false },
                ...Object.entries(EVENT_TYPES).map(([k, v]) => ({
                    name: `-${k} [amount]`,
                    value: `${v.min}–${v.max} R$ • Channel: <#${v.channelId}>`,
                    inline: true
                })),
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '📊 Statistics', value: '`-status [@user]` — View host statistics\n`-toprating` — Top hosts by rating', inline: false },
                { name: '🔧 Admin Commands', value: '`-setstats @user <+/-number>` — Adjust Robux\n`-seteventstats @user <type> <number>` — Adjust event count', inline: false },
                { name: '❓ Help', value: '`-help` — Show this message', inline: false }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();
        
        return message.channel.send({ embeds: [embed] });
    }

    // === ADMIN: setstats ===
    if (cmd === 'setstats') {
        if (!message.member?.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id))) {
            return message.react('🚫');
        }
        const user = message.mentions.users.first();
        const val = args[1];
        if (!user || !val) return message.reply('❌ `-setstats @user <+/-number>`');

        const delta = parseInt(val);
        if (isNaN(delta)) return message.reply('❌ Invalid number');

        const stats = await getStats(user.id);
        const newVal = Math.max(0, stats.totalRobux + delta);
        await HostStats.updateOne({ userId: user.id }, { totalRobux: newVal });

        return message.reply(`✅ Robux: **${newVal}**`);
    }

    // === ADMIN: seteventstats ===
    if (cmd === 'seteventstats') {
        if (!message.member?.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id))) {
            return message.react('🚫');
        }
        const user = message.mentions.users.first();
        const type = args[1]?.toLowerCase();
        const val = args[2];
        if (!user || !EVENT_TYPES[type] || !val) {
            return message.reply('❌ `-seteventstats @user <type> <number>`');
        }

        const delta = parseInt(val);
        if (isNaN(delta)) return message.reply('❌ Invalid number');

        const stats = await getStats(user.id);
        const newCount = Math.max(0, (stats.byType[type] || 0) + delta);
        await HostStats.updateOne({ userId: user.id }, { [`byType.${type}`]: newCount });

        const fresh = await getStats(user.id);
        const total = Object.values(fresh.byType).reduce((a, b) => a + b, 0);
        await HostStats.updateOne({ userId: user.id }, { eventsHosted: total });

        return message.reply(`✅ ${EVENT_TYPES[type].name}: **${newCount}**`);
    }
});

// ────────────────────────────────────────────────
// Reactions
// ────────────────────────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    const emoji = reaction.emoji.name;
    if (!['👍', '👎'].includes(emoji)) return;

    const ev = await getEventRating(reaction.message.id);
    if (!ev) return;

    const vote = emoji === '👍' ? 'like' : 'dislike';
    const prev = ev.voters.get(user.id);

    if (prev === vote) return;

    if (prev) {
        if (prev === 'like') ev.likes = Math.max(0, ev.likes - 1);
        else ev.dislikes = Math.max(0, ev.dislikes - 1);
    }

    if (vote === 'like') ev.likes++;
    else ev.dislikes++;
    ev.voters.set(user.id, vote);

    await Event.findOneAndUpdate(
        { messageId: reaction.message.id },
        { 
            likes: ev.likes, 
            dislikes: ev.dislikes,
            voters: Array.from(ev.voters.entries()).map(([userId, vote]) => ({ userId, vote }))
        }
    );

    await updateEventEmbed(reaction.message, ev);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    const emoji = reaction.emoji.name;
    if (!['👍', '👎'].includes(emoji)) return;

    const ev = await getEventRating(reaction.message.id);
    if (!ev) return;

    const vote = emoji === '👍' ? 'like' : 'dislike';
    if (ev.voters.get(user.id) !== vote) return;

    if (vote === 'like') ev.likes = Math.max(0, ev.likes - 1);
    else ev.dislikes = Math.max(0, ev.dislikes - 1);
    ev.voters.delete(user.id);

    await Event.findOneAndUpdate(
        { messageId: reaction.message.id },
        { 
            likes: ev.likes, 
            dislikes: ev.dislikes,
            voters: Array.from(ev.voters.entries()).map(([userId, vote]) => ({ userId, vote }))
        }
    );

    await updateEventEmbed(reaction.message, ev);
});

// ────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────
client.on(Events.MessageDelete, async (message) => {
    activeEvents.delete(message.id);
    await Event.findOneAndUpdate({ messageId: message.id }, { active: false });
});

// ────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});