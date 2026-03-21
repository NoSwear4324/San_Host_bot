require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');

// ────────────────────────────────────────────────
// MongoDB Connection with Retry Logic
// ────────────────────────────────────────────────
async function connectWithRetry() {
    try {
        await mongoose.connect(process.env.MONGO_URL, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            maxPoolSize: 20,
            minPoolSize: 5,
            retryWrites: true,
            w: 'majority'
        });
        console.log('✅ MongoDB connected');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('🔄 Retrying in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    }
}
connectWithRetry();

mongoose.connection.on('error', err => console.error('🔴 MongoDB error:', err.message));
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

const ticTacToeSchema = new mongoose.Schema({
    messageId:   { type: String, required: true, unique: true },
    channelId:   { type: String, required: true },
    playerX:     { type: String, required: true },
    playerO:     { type: String, required: true },
    currentTurn: { type: String, required: true },
    board:       { type: [String], required: true },
    winner:      { type: String, default: null },
    active:      { type: Boolean, default: true }
}, { timestamps: true });

const battleSchema = new mongoose.Schema({
    messageId:    { type: String, required: true, unique: true },
    channelId:    { type: String, required: true },
    host:         { type: String, required: true },
    participants: [{ userId: String, hp: Number, maxHp: Number, attack: Number, item: String }],
    round:        { type: Number, default: 0 },
    alive:        [{ userId: String }],
    winner:       { type: String, default: null },
    active:       { type: Boolean, default: true }
}, { timestamps: true });

// 🔥 FIX: HILO схема — добавлены players массив
const hiloSchema = new mongoose.Schema({
    messageId:    { type: String, required: true, unique: true },
    channelId:    { type: String, required: true },
    host:         { type: String, required: true },
    players:      [{ 
        userId: String, 
        score: { type: Number, default: 0 }, 
        highScore: { type: Number, default: 0 },
        currentNumber: { type: Number, default: 0 }
    }],
    currentNumber:{ type: Number, required: true },
    currentTurn:  { type: String, required: true },
    active:       { type: Boolean, default: true }
}, { timestamps: true });

// ────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────
const HostStats = mongoose.model('HostStats', hostStatsSchema);
const Event = mongoose.model('Event', eventSchema);
const TicTacToe = mongoose.model('TicTacToe', ticTacToeSchema);
const Battle = mongoose.model('Battle', battleSchema);
const HiLo = mongoose.model('HiLo', hiloSchema);

// ────────────────────────────────────────────────
// Client
// ────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageMessageContent,
        GatewayIntentBits.DirectMessageReactions,
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

const ADMIN_ROLES = ['1475552294203424880', '1475552827626619050'];
const HOST_BLACKLIST_ROLE = '1482828757965340978'; // Replace with actual blacklist role ID

// ────────────────────────────────────────────────
// Cache
// ────────────────────────────────────────────────
const activeEvents = new Map();
const activeTicTacToe = new Map();
const activeBattles = new Map();
const activeHiLo = new Map();
const overlapCooldowns = new Map();

// ────────────────────────────────────────────────
// Game Constants
// ────────────────────────────────────────────────
const OVERLAP_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

const BATTLE_ITEMS = [
    { name: '🗡️ Sword', damage: 15, heal: 0 },
    { name: '🔫 Gun', damage: 20, heal: 0 },
    { name: '💣 Bomb', damage: 30, heal: 0 },
    { name: '🛡️ Shield', damage: 5, heal: 0 },
    { name: '🧪 Potion', damage: 0, heal: 25 },
    { name: '❤️ Blood Pack', damage: 0, heal: 40 },
    { name: '⚡ Lightning', damage: 25, heal: 0 },
    { name: '🔥 Fire', damage: 18, heal: 0 },
    { name: '❄️ Ice', damage: 12, heal: 10 },
    { name: '🌟 Miracle', damage: 50, heal: 0 },
    { name: '💀 Poison', damage: 35, heal: -10 },
    { name: '🍖 Meat', damage: 0, heal: 20 },
    { name: '🔪 Knife', damage: 12, heal: 0 },
    { name: '🪓 Axe', damage: 25, heal: 0 },
    { name: '🏹 Bow', damage: 18, heal: 0 },
    { name: '🪄 Wand', damage: 22, heal: 0 },
    { name: '💎 Crystal', damage: 30, heal: 0 },
    { name: '🌿 Herb', damage: 0, heal: 15 },
    { name: '☢️ Nuke', damage: 50, heal: 0 },
    { name: '🔨 Hammer', damage: 20, heal: 0 },
    { name: '⛓️ Chain', damage: 15, heal: 0 },
    { name: '🧨 Dynamite', damage: 35, heal: 0 },
    { name: '🍺 Beer', damage: 0, heal: 10 },
    { name: '💉 Serum', damage: 0, heal: 30 },
    { name: '🌵 Cactus', damage: 10, heal: 0 },
    { name: '🍄 Mushroom', damage: 0, heal: 20 },
    { name: '🔮 Orb', damage: 28, heal: 0 },
    { name: '📯 Horn', damage: 15, heal: 0 },
    { name: '🪃 Boomerang', damage: 20, heal: 0 },
    { name: '🎯 Dart', damage: 10, heal: 0 }
];

// ────────────────────────────────────────────────
// Helper Functions
// ────────────────────────────────────────────────
async function getStats(userId) {
    try {
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
    } catch (err) {
        console.error('Error in getStats:', err.message);
        return null;
    }
}

async function getEventRating(messageId) {
    try {
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
    } catch (err) {
        console.error('Error in getEventRating:', err.message);
        return null;
    }
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
    try {
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

        await message.edit({ 
            content: PING_ROLES[ev.type] ? `<@&${PING_ROLES[ev.type]}>` : null, 
            embeds: [embed] 
        });
    } catch (err) {
        if (err.code === 10008) {
            activeEvents.delete(message.id);
            await Event.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error);
        } else {
            console.error('Embed update error:', err.message);
        }
    }
}

// ────────────────────────────────────────────────
// Process Signal Handlers (Railway Safe Shutdown)
// ────────────────────────────────────────────────
process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    await mongoose.connection.close().catch(console.error);
    await client.destroy().catch(console.error);
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    await mongoose.connection.close().catch(console.error);
    await client.destroy().catch(console.error);
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ────────────────────────────────────────────────
// Ready Event
// ────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 ${client.user.tag} is online`);
    
    try {
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

        const tttGames = await TicTacToe.find({ active: true });
        for (const game of tttGames) {
            activeTicTacToe.set(game.messageId, {
                _id: game._id,
                playerX: game.playerX,
                playerO: game.playerO,
                currentTurn: game.currentTurn,
                board: game.board,
                winner: game.winner,
                active: game.active
            });
        }
        console.log(`⭕ Loaded ${activeTicTacToe.size} active Tic-Tac-Toe games`);

        // 🔥 FIX: Battle — правильная конвертация
        const battles = await Battle.find({ active: true });
        for (const battle of battles) {
            const participantsMap = new Map(
                battle.participants.map(p => [
                    p.userId, 
                    { hp: p.hp, maxHp: p.maxHp, attack: p.attack, item: p.item }
                ])
            );
            const aliveSet = new Set(battle.alive.map(a => a.userId));
            
            activeBattles.set(battle.messageId, {
                _id: battle._id,
                host: battle.host,
                participants: participantsMap,
                round: battle.round,
                alive: aliveSet,
                winner: battle.winner,
                active: battle.active
            });
        }
        console.log(`⚔️ Loaded ${activeBattles.size} active battles`);

        // 🔥 FIX: HILO — правильная конвертация players массив → Map
const hiloGames = await HiLo.find({ active: true });
for (const game of hiloGames) {
    const playersMap = new Map(
        game.players.map(p => [
            p.userId,
            { score: p.score, highScore: p.highScore, currentNumber: p.currentNumber }
        ])
    );
    
    activeHiLo.set(game.messageId, {
        _id: game._id,
        host: game.host,
        players: playersMap,  // ✅ Map
        currentTurn: game.currentTurn,
        currentNumber: game.currentNumber,
        active: game.active
    });
}
console.log(`📈 Loaded ${activeHiLo.size} active Hi-Lo games`);

        // Restore overlap cooldowns from recent events (by channel)
        const recentEvents = await Event.find({ active: true })
            .sort({ createdAt: -1 })
            .limit(20);

        for (const ev of recentEvents) {
            const elapsed = Date.now() - new Date(ev.createdAt).getTime();
            if (elapsed < OVERLAP_COOLDOWN_MS) {
                overlapCooldowns.set(ev.channelId, {
                    hostId: ev.host,
                    timestamp: new Date(ev.createdAt).getTime(),
                    channelId: ev.channelId,
                    robux: ev.robux
                });
            }
        }
        console.log(`⏳ Restored ${overlapCooldowns.size} overlap cooldowns`);

        client.user.setPresence({
            activities: [{ name: '-help • RBX Events & Games', type: ActivityType.Watching }],
            status: 'online'
        });

        // Register slash commands
        await registerSlashCommands();
    } catch (err) {
        console.error('Error during client ready:', err.message);
    }
});

// ────────────────────────────────────────────────
// Slash Commands Registration
// ────────────────────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('ttt')
        .setDescription('🎮 Play Tic-Tac-Toe with a friend')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The user you want to challenge')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('battle')
        .setDescription('⚔️ Start a Battle Royale game')
        .addIntegerOption(option =>
            option.setName('time')
                .setDescription('Time to join (10-300 seconds, default: 30)')
                .setMinValue(10)
                .setMaxValue(300)
        ),
    new SlashCommandBuilder()
        .setName('hilo')
        .setDescription('📈 Play HILO - guess higher or lower')
        .addIntegerOption(option =>
            option.setName('time')
                .setDescription('Time to join (10-300 seconds, default: 30)')
                .setMinValue(10)
                .setMaxValue(300)
        ),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('📊 View your host statistics')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to view stats for')
        ),
    new SlashCommandBuilder()
        .setName('toprating')
        .setDescription('🏆 Show top rated hosts'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📜 Show all commands'),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerSlashCommands() {
    try {
        console.log('🔄 Registering slash commands...');
        
        // Register globally (works everywhere via DM)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        
        console.log('✅ Slash commands registered globally');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error.message);
    }
}

// ────────────────────────────────────────────────
// Messages / Commands
// ────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    // Проверка: некоторые команды работают только на сервере
    const isDM = !message.guild;

    try {
        // === CREATE EVENT ===
        if (EVENT_TYPES[cmd]) {
            // События работают только на сервере
            if (isDM) {
                return message.reply('❌ Event creation is only available on the server!');
            }

            const type = cmd;
            const cfg = EVENT_TYPES[type];

            if (message.channel.id !== cfg.channelId) {
                return message.reply(`❌ Only in <#${cfg.channelId}>`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }

            if (!message.member?.roles.cache.has(EVENT_ROLES[type])) {
                return message.reply(`❌ You need the **${cfg.name}** role`);
            }

            // Check if user is blacklisted from hosting
            if (message.member?.roles.cache.has(HOST_BLACKLIST_ROLE)) {
                return message.reply(`❌ You are blacklisted from hosting events!`);
            }

            // Check overlap for this channel
            const overlap = overlapCooldowns.get(message.channel.id);
            if (overlap && (Date.now() - overlap.timestamp) < OVERLAP_COOLDOWN_MS) {
                const remaining = OVERLAP_COOLDOWN_MS - (Date.now() - overlap.timestamp);
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);

                const overlapEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⛔ OVERLAP DETECTED')
                    .setDescription(`Someone already created an event in this channel recently!`)
                    .addFields(
                        { name: '👤 Last host', value: `<@${overlap.hostId}>`, inline: true },
                        { name: '💰 Amount', value: `${overlap.robux} R$`, inline: true },
                        { name: '⏳ Remaining', value: `${minutes} min. ${seconds} sec.`, inline: true }
                    )
                    .setFooter({ text: 'Wait for the cooldown to end or create in a different channel!' })
                    .setTimestamp();

                return message.reply({ embeds: [overlapEmbed] });
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

            // Set overlap cooldown for this channel
            overlapCooldowns.set(message.channel.id, {
                hostId: message.author.id,
                timestamp: Date.now(),
                channelId: message.channel.id,
                robux
            });

            await msg.react('👍').catch(console.error);
            await msg.react('👎').catch(console.error);
            return;
        }

        // === STATUS ===
        if (cmd === 'status') {
            const target = message.mentions.users.first() || message.author;
            const stats = await getStats(target.id);
            if (!stats) return message.reply('❌ Could not fetch stats');

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

        // === HELP ===
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
                    { name: '🎮 Games', value: '`-ttt @user` — Tic-Tac-Toe\n`-battle [time]` — Battle Royale\n`-hilo [time]` — HILO', inline: false },
                    { name: '🔧 Admin Commands', value: '`-setstats @user <+/-number>` — Adjust Robux\n`-seteventstats @user <type> <number>` — Adjust event count', inline: false },
                    { name: '❓ Help', value: '`-help` — Show this message', inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // ────────────────────────────────────────────────
        // TIC-TAC-TOE COMMAND 🔥 FIX — Вход работает
        // ────────────────────────────────────────────────
if (cmd === 'ttt') {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot) {
        return message.reply('❌ Mention a valid user to play against (not a bot)');
    }
    if (opponent.id === message.author.id) {
        return message.reply('❌ You cannot play against yourself');
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⭕ Tic-Tac-Toe Challenge')
        .setDescription(`**<@${message.author.id}>** challenged **<@${opponent.id}>** to a game of Tic-Tac-Toe!\n\n<@${opponent.id}>, do you accept?`)
        .setFooter({ text: 'Challenge expires in 30 seconds' })
        .setTimestamp(Date.now() + 30000);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ttt_accept')
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('ttt_decline')
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === opponent.id && !i.user.bot,
        time: 30000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'ttt_decline') {
            try {
                await interaction.update({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('⭕ Tic-Tac-Toe')
                        .setDescription(`<@${opponent.id}> declined the challenge!`)
                        .setTimestamp()],
                    components: []
                });
            } catch (e) {}
            return;
        }

        if (interaction.customId === 'ttt_accept') {
            const board = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
            const gameEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('⭕ Tic-Tac-Toe')
                .setDescription(`**<@${message.author.id}>** vs **<@${opponent.id}>**\n\n<@${message.author.id}> is **X** - Your turn!\n\n${renderBoard(board)}`)
                .setFooter({ text: 'Click a button to place your mark' })
                .setTimestamp();

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_0').setLabel('1').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_1').setLabel('2').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_2').setLabel('3').setStyle(ButtonStyle.Secondary)
                );
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_3').setLabel('4').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_4').setLabel('5').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_5').setLabel('6').setStyle(ButtonStyle.Secondary)
                );
            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_6').setLabel('7').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_7').setLabel('8').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('ttt_8').setLabel('9').setStyle(ButtonStyle.Secondary)
                );

            try {
                await interaction.update({ embeds: [gameEmbed], components: [row1, row2, row3] });
            } catch (e) {}

            // ✅ Создаём в БД
            try {
                await TicTacToe.create({
                    messageId: msg.id,
                    channelId: msg.channel.id,
                    playerX: message.author.id,
                    playerO: opponent.id,
                    currentTurn: message.author.id,
                    board,
                    winner: null,
                    active: true
                });
                console.log('✅ TTT created in database');
            } catch (err) {
                console.error('❌ Failed to create TTT in DB:', err.message);
                return;
            }

            // ✅ Добавляем в кэш
            activeTicTacToe.set(msg.id, {
                _id: msg.id,
                playerX: message.author.id,
                playerO: opponent.id,
                currentTurn: message.author.id,
                board: [...board],  // ✅ Копия массива
                winner: null,
                active: true
            });
            console.log('✅ TTT added to cache. Players:', message.author.id, 'vs', opponent.id);
        }
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            try {
                await msg.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⭕ Tic-Tac-Toe')
                        .setDescription(`<@${opponent.id}> didn't respond in time!`)
                        .setTimestamp()],
                    components: []
                });
            } catch (e) {}
        }
    });

    return;
}
        // ────────────────────────────────────────────────
        // BATTLE COMMAND 🔥 FIX — Вход работает
        // ────────────────────────────────────────────────
if (cmd === 'battle') {
    let timeSeconds = 30;
    if (args[0]) {
        const parsed = parseInt(args[0]);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) {
            timeSeconds = parsed;
        }
    }

    const startTime = Math.floor(Date.now() / 1000) + timeSeconds;
    
    const embed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle('⚔️ Battle Royale')
        .setDescription('**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!')
        .addFields(
            { name: '👥 Participants', value: '**0** / ∞\n*No one has joined yet*', inline: false },
            { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
            { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
        )
        .setFooter({ text: 'Click "Join" or "Leave" before battle starts!' })
        .setTimestamp(startTime * 1000);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('battle_join')
                .setLabel('Join Battle')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId('battle_leave')
                .setLabel('Leave')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🚪')
        );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const participants = new Map();

    async function updateParticipantsEmbed() {
        const participantList = Array.from(participants.entries())
            .map(([id, data]) => `• <@${id}> ❤️ ${data.hp}/${data.maxHp}`)
            .join('\n') || '*No one has joined yet*';
        
        const newEmbed = EmbedBuilder.from(embed.toJSON())
            .setFields(
                { name: '👥 Participants', value: `**${participants.size}** / ∞\n${participantList}`, inline: false },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
            );
        try { await msg.edit({ embeds: [newEmbed] }); } catch (e) {}
    }

    const collector = msg.createMessageComponentCollector({
        filter: i => ['battle_join', 'battle_leave'].includes(i.customId) && !i.user.bot,
        time: timeSeconds * 1000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'battle_join') {
            if (!participants.has(interaction.user.id)) {
                participants.set(interaction.user.id, { hp: 100, maxHp: 100, attack: 10, item: 'None' });
                await interaction.reply({ content: '✅ You joined the battle! Good luck! 🍀', ephemeral: true });
                await updateParticipantsEmbed();
            } else {
                await interaction.reply({ content: '⚠️ You are already in this battle!', ephemeral: true });
            }
            return;
        }

        if (interaction.customId === 'battle_leave') {
            if (participants.has(interaction.user.id)) {
                participants.delete(interaction.user.id);
                await interaction.reply({ content: '🚪 You left the battle!', ephemeral: true });
                await updateParticipantsEmbed();
            } else {
                await interaction.reply({ content: '❌ You are not in this battle!', ephemeral: true });
            }
            return;
        }
    });

    collector.on('end', async (collected, reason) => {
        console.log('🔪 Battle collector ended. Reason:', reason, 'Participants:', participants.size);
        
        // ✅ Проверка количества участников
        if (participants.size < 2) {
            console.log('❌ Battle cancelled - not enough players');
            try {
                await msg.edit({ 
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF4500)
                        .setTitle('❌ Battle Cancelled')
                        .setDescription(`Not enough participants (need at least 2, got **${participants.size}**)\nBetter luck next time! 🍀`)
                    ], 
                    components: [] 
                });
            } catch (e) {}
            return;
        }

        const participantsArray = Array.from(participants.entries()).map(([userId, data]) => ({
            userId,
            hp: data.hp,
            maxHp: data.maxHp,
            attack: data.attack,
            item: data.item
        }));

        // ✅ Создаём в БД
        try {
            await Battle.create({
                messageId: msg.id,
                channelId: msg.channel.id,
                host: message.author.id,
                participants: participantsArray,
                round: 0,
                alive: participantsArray.map(p => ({ userId: p.userId })),
                winner: null
            });
            console.log('✅ Battle created in database');
        } catch (err) {
            console.error('❌ Failed to create battle in DB:', err.message);
            return;
        }

        // ✅ Добавляем в кэш с ПРАВИЛЬНЫМИ структурами (Map и Set)
        activeBattles.set(msg.id, {
            _id: msg.id,
            host: message.author.id,
            participants: new Map(participants),  // ✅ Map
            round: 0,
            alive: new Set(participants.keys()),  // ✅ Set
            winner: null,
            active: true
        });
        console.log('✅ Battle added to cache. Alive:', participants.size);

        const startEmbed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('⚔️ Battle Started!')
            .setDescription(`**${participants.size} fighters entered the arena!**\n\n${Array.from(participants.keys()).map(id => `🗡️ <@${id}>`).join('\n')}`)
            .addFields({ name: '📊 Starting HP', value: Array.from(participants.keys()).map(id => `• <@${id}>: ❤️ 100/100`).join('\n') })
            .setFooter({ text: 'No leaving allowed - fight to the end!' })
            .setTimestamp(startTime * 1000);

        try {
            await msg.edit({ embeds: [startEmbed], components: [] });
            console.log('✅ Battle start message edited');
        } catch (err) {
            console.error('❌ Failed to edit start message:', err.message);
        }
        
        // ✅ Запускаем первый раунд через 3 секунды
        setTimeout(() => {
            const battle = activeBattles.get(msg.id);
            console.log('⏰ Timeout fired. Battle in cache:', !!battle, 'Active:', battle?.active);
            if (battle && battle.active) {
                console.log('🎮 Starting Battle Round 1, alive:', battle.alive.size);
                startBattleRound(msg, battle);
            } else {
                console.log('❌ Battle not found or not active, skipping round 1');
            }
        }, 3000);
    });

    return;
}

        // === HILO ===
        // ────────────────────────────────────────────────
// HILO COMMAND 🔥 FIX — Вход работает
// ────────────────────────────────────────────────
if (cmd === 'hilo') {
    let timeSeconds = 30;
    if (args[0]) {
        const parsed = parseInt(args[0]);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) {
            timeSeconds = parsed;
        }
    }

    const startTime = Math.floor(Date.now() / 1000) + timeSeconds;
    const startNumber = Math.floor(Math.random() * 100) + 1;

    const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('📈 HILO')
        .setDescription('**Guess Higher or Lower!**\n❌ Wrong guess = **Eliminated**\n🏆 Last player standing wins!')
        .addFields(
            { name: '👥 Players', value: '**0** / ∞\n*No one has joined yet*', inline: false },
            { name: '🔢 Starting Number', value: `**${startNumber}**`, inline: true },
            { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
            { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
        )
        .setFooter({ text: 'Click "Join" or "Leave" before game starts!' })
        .setTimestamp(startTime * 1000);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('hilo_join')
                .setLabel('Join HILO')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📈'),
            new ButtonBuilder()
                .setCustomId('hilo_leave')
                .setLabel('Leave')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🚪')
        );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const players = new Map();

    async function updatePlayersEmbed() {
        const list = Array.from(players.keys()).map(id => `✅ <@${id}>`).join('\n') || '*No one has joined yet*';
        const newEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📈 HILO')
            .setDescription('**Guess Higher or Lower!**\n❌ Wrong guess = **Eliminated**\n🏆 Last player standing wins!')
            .setFields(
                { name: '👥 Players', value: `**${players.size}** / ∞\n${list}`, inline: false },
                { name: '🔢 Starting Number', value: `**${startNumber}**`, inline: true },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
            )
            .setFooter({ text: 'Click "Join" or "Leave" before game starts!' })
            .setTimestamp(startTime * 1000);
        await msg.edit({ embeds: [newEmbed] }).catch(console.error);
    }

    const collector = msg.createMessageComponentCollector({
        filter: i => ['hilo_join', 'hilo_leave'].includes(i.customId) && !i.user.bot,
        time: timeSeconds * 1000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'hilo_join') {
            if (!players.has(interaction.user.id)) {
                players.set(interaction.user.id, { score: 0, highScore: 0, currentNumber: startNumber });
                console.log('📈 Player joined:', interaction.user.tag, 'Total:', players.size);
                // Сначала обновляем эмбед, потом отвечаем
                await updatePlayersEmbed();
                await interaction.reply({ content: '✅ You joined HILO! Good luck! 🍀', ephemeral: true });
            } else {
                await interaction.reply({ content: '⚠️ You are already in this game!', ephemeral: true });
            }
            return;
        }

        if (interaction.customId === 'hilo_leave') {
            if (players.has(interaction.user.id)) {
                players.delete(interaction.user.id);
                console.log('📈 Player left:', interaction.user.tag, 'Total:', players.size);
                // Сначала обновляем эмбед, потом отвечаем
                await updatePlayersEmbed();
                await interaction.reply({ content: '🚪 You left HILO!', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ You are not in this game!', ephemeral: true });
            }
            return;
        }
    });

    collector.on('end', async (collected, reason) => {
        console.log('📈 HILO collector ended. Reason:', reason, 'Players:', players.size);

        // ✅ Проверка количества игроков
        if (players.size < 2) {
            console.log('❌ HILO cancelled - not enough players');
            try {
                await msg.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(0x00AE86)
                        .setTitle('❌ HILO Cancelled')
                        .setDescription(`Not enough players (need at least 2, got **${players.size}**)`)],
                    components: []
                });
            } catch (e) {}
            return;
        }

        const playersArray = Array.from(players.entries()).map(([userId, data]) => ({
            userId,
            score: data.score,
            highScore: data.highScore,
            currentNumber: data.currentNumber
        }));

        // ✅ Создаём в БД
        try {
            const firstPlayer = Array.from(players.keys())[0];
            await HiLo.create({
                messageId: msg.id,
                channelId: msg.channel.id,
                host: message.author.id,
                players: playersArray,
                currentNumber: startNumber,
                currentTurn: firstPlayer,  // ✅ Добавляем currentTurn
                active: true
            });
            console.log('✅ HILO created in database');
        } catch (err) {
            console.error('❌ Failed to create HILO in DB:', err.message);
            return;
        }

        // ✅ Добавляем в кэш с ПРАВИЛЬНОЙ структурой (Map)
        activeHiLo.set(msg.id, {
            _id: msg.id,
            host: message.author.id,
            players: new Map(players),  // ✅ Map
            currentNumber: startNumber,
            votes: new Map(),  // ✅ Голоса игроков
            active: true
        });
        console.log('✅ HILO added to cache. Players:', players.size);

        // 🔥 ПИНГ ВСЕХ ИГРОКОВ + СПИСОК ЖИВЫХ
        const playerPings = Array.from(players.keys()).map(id => `<@${id}>`).join(' ');
        const playerList = Array.from(players.keys()).map(id => `✅ <@${id}>`).join('\n');

        await msg.edit({
            content: `📈 **HILO Started!** ${playerPings}`,
            embeds: [new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle('📈 HILO - Game Started!')
                .setDescription(`**${players.size} players joined!**\n\nFirst number: **${startNumber}**\n\nGet ready to vote!`)
                .addFields(
                    { name: '👥 Players', value: playerList, inline: false }
                )
                .setFooter({ text: 'Game in progress...' })
                .setTimestamp()],
            components: []
        });
        console.log('✅ HILO start message edited');

        // ✅ Запускаем первый раунд через 2 секунды
        setTimeout(() => {
            const game = activeHiLo.get(msg.id);
            if (game && game.active && game.players.size >= 1) {
                console.log('📈 Starting HILO Round 1, players:', game.players.size);
                startHiloRound(msg, game);
            } else {
                console.log('❌ Cannot start round - game:', !!game, 'active:', game?.active, 'players:', game?.players.size);
            }
        }, 2000);
    });

    return;
}
 
        // === ADMIN: setstats ===
        if (cmd === 'setstats') {
            // Админ-команды работают только на сервере
            if (isDM) {
                return message.reply('❌ This command is only available on the server!');
            }
            if (!message.member?.roles.cache.some(r => ADMIN_ROLES.includes(r.id))) {
                return message.react('🚫');
            }
            const user = message.mentions.users.first();
            const val = args[1];
            if (!user || !val) return message.reply('❌ `-setstats @user <+/-number>`');

            const delta = parseInt(val);
            if (isNaN(delta)) return message.reply('❌ Invalid number');

            const stats = await getStats(user.id);
            if (!stats) return message.reply('❌ Could not fetch user stats');
            
            const newVal = Math.max(0, stats.totalRobux + delta);
            await HostStats.updateOne({ userId: user.id }, { totalRobux: newVal });

            return message.reply(`✅ Robux: **${newVal}**`);
        }

        // === ADMIN: seteventstats ===
        if (cmd === 'seteventstats') {
            // Админ-команды работают только на сервере
            if (isDM) {
                return message.reply('❌ This command is only available on the server!');
            }
            if (!message.member?.roles.cache.some(r => ADMIN_ROLES.includes(r.id))) {
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
            if (!stats) return message.reply('❌ Could not fetch user stats');
            
            const newCount = Math.max(0, (stats.byType[type] || 0) + delta);
            await HostStats.updateOne({ userId: user.id }, { [`byType.${type}`]: newCount });

            const fresh = await getStats(user.id);
            const total = Object.values(fresh.byType).reduce((a, b) => a + b, 0);
            await HostStats.updateOne({ userId: user.id }, { eventsHosted: total });

            return message.reply(`✅ ${EVENT_TYPES[type].name}: **${newCount}**`);
        }
    } catch (err) {
        console.error('Error handling command:', cmd, err.message);
        try {
            await message.reply('❌ An error occurred while processing your command.').catch(() => {});
        } catch (e) {}
    }
});

// ────────────────────────────────────────────────
// Slash Commands Handler
// ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        
        try {
            // === /ttt ===
            if (commandName === 'ttt') {
                const opponent = interaction.options.getUser('opponent');
                
                if (opponent.bot) {
                    return interaction.reply({ content: '❌ You cannot play against a bot!', ephemeral: true });
                }
                if (opponent.id === interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot play against yourself!', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('⭕ Tic-Tac-Toe Challenge')
                    .setDescription(`**<@${interaction.user.id}>** challenged **<@${opponent.id}>** to a game of Tic-Tac-Toe!\n\n<@${opponent.id}>, do you accept?`)
                    .setFooter({ text: 'Challenge expires in 30 seconds' })
                    .setTimestamp(Date.now() + 30000);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('ttt_accept')
                            .setLabel('Accept')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId('ttt_decline')
                            .setLabel('Decline')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
                const msg = await interaction.fetchReply();

                const collector = msg.createMessageComponentCollector({
                    filter: i => i.user.id === opponent.id && !i.user.bot,
                    time: 30000
                });

                collector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.customId === 'ttt_decline') {
                        await buttonInteraction.update({
                            embeds: [new EmbedBuilder()
                                .setColor(0xFF0000)
                                .setTitle('⭕ Tic-Tac-Toe')
                                .setDescription(`<@${opponent.id}> declined the challenge!`)
                                .setTimestamp()],
                            components: []
                        });
                        return;
                    }

                    if (buttonInteraction.customId === 'ttt_accept') {
                        const board = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
                        const gameEmbed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('⭕ Tic-Tac-Toe')
                            .setDescription(`**<@${interaction.user.id}>** vs **<@${opponent.id}>**\n\n<@${interaction.user.id}> is **X** - Your turn!\n\n${renderBoard(board)}`)
                            .setFooter({ text: 'Click a button to place your mark' })
                            .setTimestamp();

                        const row1 = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder().setCustomId('ttt_0').setLabel('1').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_1').setLabel('2').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_2').setLabel('3').setStyle(ButtonStyle.Secondary)
                            );
                        const row2 = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder().setCustomId('ttt_3').setLabel('4').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_4').setLabel('5').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_5').setLabel('6').setStyle(ButtonStyle.Secondary)
                            );
                        const row3 = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder().setCustomId('ttt_6').setLabel('7').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_7').setLabel('8').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('ttt_8').setLabel('9').setStyle(ButtonStyle.Secondary)
                            );

                        await buttonInteraction.update({ embeds: [gameEmbed], components: [row1, row2, row3] });

                        // Create in DB
                        try {
                            await TicTacToe.create({
                                messageId: msg.id,
                                channelId: msg.channel.id,
                                playerX: interaction.user.id,
                                playerO: opponent.id,
                                currentTurn: interaction.user.id,
                                board,
                                winner: null,
                                active: true
                            });
                        } catch (err) {
                            console.error('❌ Failed to create TTT in DB:', err.message);
                            return;
                        }

                        activeTicTacToe.set(msg.id, {
                            _id: msg.id,
                            playerX: interaction.user.id,
                            playerO: opponent.id,
                            currentTurn: interaction.user.id,
                            board: [...board],
                            winner: null,
                            active: true
                        });
                    }
                });

                collector.on('end', async (collected) => {
                    if (collected.size === 0) {
                        try {
                            await msg.edit({
                                embeds: [new EmbedBuilder()
                                    .setColor(0xFFA500)
                                    .setTitle('⭕ Tic-Tac-Toe')
                                    .setDescription(`<@${opponent.id}> didn't respond in time!`)
                                    .setTimestamp()],
                                components: []
                            });
                        } catch (e) {}
                    }
                });
                return;
            }

            // === /battle ===
            if (commandName === 'battle') {
                let timeSeconds = interaction.options.getInteger('time') || 30;
                const startTime = Math.floor(Date.now() / 1000) + timeSeconds;

                const embed = new EmbedBuilder()
                    .setColor(0xFF4500)
                    .setTitle('⚔️ Battle Royale')
                    .setDescription('**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!')
                    .addFields(
                        { name: '👥 Participants', value: '**0** / ∞\n*No one has joined yet*', inline: false },
                        { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                        { name: '🎮 Host', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Click "Join" or "Leave" before battle starts!' })
                    .setTimestamp(startTime * 1000);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('battle_join')
                            .setLabel('Join Battle')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('⚔️'),
                        new ButtonBuilder()
                            .setCustomId('battle_leave')
                            .setLabel('Leave')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🚪')
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
                const msg = await interaction.fetchReply();

                const participants = new Map();

                async function updateParticipantsEmbed() {
                    const participantList = Array.from(participants.entries())
                        .map(([id, data]) => `• <@${id}> ❤️ ${data.hp}/${data.maxHp}`)
                        .join('\n') || '*No one has joined yet*';

                    const newEmbed = EmbedBuilder.from(embed.toJSON())
                        .setFields(
                            { name: '👥 Participants', value: `**${participants.size}** / ∞\n${participantList}`, inline: false },
                            { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                            { name: '🎮 Host', value: `<@${interaction.user.id}>`, inline: true }
                        );
                    try { await msg.edit({ embeds: [newEmbed] }); } catch (e) {}
                }

                const collector = msg.createMessageComponentCollector({
                    filter: i => ['battle_join', 'battle_leave'].includes(i.customId) && !i.user.bot,
                    time: timeSeconds * 1000
                });

                collector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.customId === 'battle_join') {
                        if (!participants.has(buttonInteraction.user.id)) {
                            participants.set(buttonInteraction.user.id, { hp: 100, maxHp: 100, attack: 10, item: 'None' });
                            await buttonInteraction.reply({ content: '✅ You joined the battle! Good luck! 🍀', ephemeral: true });
                            await updateParticipantsEmbed();
                        } else {
                            await buttonInteraction.reply({ content: '⚠️ You are already in this battle!', ephemeral: true });
                        }
                        return;
                    }

                    if (buttonInteraction.customId === 'battle_leave') {
                        if (participants.has(buttonInteraction.user.id)) {
                            participants.delete(buttonInteraction.user.id);
                            await buttonInteraction.reply({ content: '🚪 You left the battle!', ephemeral: true });
                            await updateParticipantsEmbed();
                        } else {
                            await buttonInteraction.reply({ content: '❌ You are not in this battle!', ephemeral: true });
                        }
                        return;
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (participants.size < 2) {
                        try {
                            await msg.edit({
                                embeds: [new EmbedBuilder()
                                    .setColor(0xFF4500)
                                    .setTitle('❌ Battle Cancelled')
                                    .setDescription(`Not enough participants (need at least 2, got **${participants.size}**)\nBetter luck next time! 🍀`)
                                ],
                                components: []
                            });
                        } catch (e) {}
                        return;
                    }

                    const participantsArray = Array.from(participants.entries()).map(([userId, data]) => ({
                        userId,
                        hp: data.hp,
                        maxHp: data.maxHp,
                        attack: data.attack,
                        item: data.item
                    }));

                    try {
                        await Battle.create({
                            messageId: msg.id,
                            channelId: msg.channel.id,
                            host: interaction.user.id,
                            participants: participantsArray,
                            round: 0,
                            alive: participantsArray.map(p => ({ userId: p.userId })),
                            winner: null
                        });
                    } catch (err) {
                        console.error('❌ Failed to create battle in DB:', err.message);
                        return;
                    }

                    activeBattles.set(msg.id, {
                        _id: msg.id,
                        host: interaction.user.id,
                        participants: new Map(participants),
                        round: 0,
                        alive: new Set(participants.keys()),
                        winner: null,
                        active: true
                    });

                    const startEmbed = new EmbedBuilder()
                        .setColor(0xFF4500)
                        .setTitle('⚔️ Battle Started!')
                        .setDescription(`**${participants.size} fighters entered the arena!**\n\n${Array.from(participants.keys()).map(id => `🗡️ <@${id}>`).join('\n')}`)
                        .addFields({ name: '📊 Starting HP', value: Array.from(participants.keys()).map(id => `• <@${id}>: ❤️ 100/100`).join('\n') })
                        .setFooter({ text: 'No leaving allowed - fight to the end!' })
                        .setTimestamp(startTime * 1000);

                    try { await msg.edit({ embeds: [startEmbed], components: [] }); } catch (e) {}

                    setTimeout(() => {
                        const battle = activeBattles.get(msg.id);
                        if (battle && battle.active) {
                            startBattleRound(msg, battle);
                        }
                    }, 3000);
                });
                return;
            }

            // === /hilo ===
            if (commandName === 'hilo') {
                let timeSeconds = interaction.options.getInteger('time') || 30;
                const startTime = Math.floor(Date.now() / 1000) + timeSeconds;
                const startNumber = Math.floor(Math.random() * 100) + 1;

                const embed = new EmbedBuilder()
                    .setColor(0x00AE86)
                    .setTitle('📈 HILO')
                    .setDescription('**Guess Higher or Lower!**\n❌ Wrong guess = **Eliminated**\n🏆 Last player standing wins!')
                    .addFields(
                        { name: '👥 Players', value: '**0** / ∞\n*No one has joined yet*', inline: false },
                        { name: '🔢 Starting Number', value: `**${startNumber}**`, inline: true },
                        { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                        { name: '🎮 Host', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Click "Join" or "Leave" before game starts!' })
                    .setTimestamp(startTime * 1000);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('hilo_join')
                            .setLabel('Join HILO')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📈'),
                        new ButtonBuilder()
                            .setCustomId('hilo_leave')
                            .setLabel('Leave')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🚪')
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
                const msg = await interaction.fetchReply();

                const players = new Map();

                async function updatePlayersEmbed() {
                    const list = Array.from(players.keys()).map(id => `✅ <@${id}>`).join('\n') || '*No one has joined yet*';
                    const newEmbed = new EmbedBuilder()
                        .setColor(0x00AE86)
                        .setTitle('📈 HILO')
                        .setDescription('**Guess Higher or Lower!**\n❌ Wrong guess = **Eliminated**\n🏆 Last player standing wins!')
                        .setFields(
                            { name: '👥 Players', value: `**${players.size}** / ∞\n${list}`, inline: false },
                            { name: '🔢 Starting Number', value: `**${startNumber}**`, inline: true },
                            { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                            { name: '🎮 Host', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setFooter({ text: 'Click "Join" or "Leave" before game starts!' })
                        .setTimestamp(startTime * 1000);
                    await msg.edit({ embeds: [newEmbed] }).catch(console.error);
                }

                const collector = msg.createMessageComponentCollector({
                    filter: i => ['hilo_join', 'hilo_leave'].includes(i.customId) && !i.user.bot,
                    time: timeSeconds * 1000
                });

                collector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.customId === 'hilo_join') {
                        if (!players.has(buttonInteraction.user.id)) {
                            players.set(buttonInteraction.user.id, { score: 0, highScore: 0, currentNumber: startNumber });
                            await updatePlayersEmbed();
                            await buttonInteraction.reply({ content: '✅ You joined HILO! Good luck! 🍀', ephemeral: true });
                        } else {
                            await buttonInteraction.reply({ content: '⚠️ You are already in this game!', ephemeral: true });
                        }
                        return;
                    }

                    if (buttonInteraction.customId === 'hilo_leave') {
                        if (players.has(buttonInteraction.user.id)) {
                            players.delete(buttonInteraction.user.id);
                            await buttonInteraction.reply({ content: '🚪 You left the game!', ephemeral: true });
                            await updatePlayersEmbed();
                        } else {
                            await buttonInteraction.reply({ content: '❌ You are not in this game!', ephemeral: true });
                        }
                        return;
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (players.size < 2) {
                        try {
                            await msg.edit({
                                embeds: [new EmbedBuilder()
                                    .setColor(0xFF4500)
                                    .setTitle('❌ HILO Cancelled')
                                    .setDescription(`Not enough players (need at least 2, got **${players.size}**)\nBetter luck next time! 🍀`)
                                ],
                                components: []
                            });
                        } catch (e) {}
                        return;
                    }

                    const playersArray = Array.from(players.entries()).map(([userId, data]) => ({
                        userId,
                        score: data.score,
                        highScore: data.highScore,
                        currentNumber: data.currentNumber || startNumber
                    }));

                    try {
                        await HiLo.create({
                            messageId: msg.id,
                            channelId: msg.channel.id,
                            host: interaction.user.id,
                            players: playersArray,
                            currentNumber: startNumber,
                            currentTurn: playersArray[0].userId,
                            active: true
                        });
                    } catch (err) {
                        console.error('❌ Failed to create HILO in DB:', err.message);
                        return;
                    }

                    activeHiLo.set(msg.id, {
                        _id: msg.id,
                        host: interaction.user.id,
                        players: new Map(players),
                        currentTurn: playersArray[0].userId,
                        currentNumber: startNumber,
                        active: true
                    });

                    const startEmbed = new EmbedBuilder()
                        .setColor(0x00AE86)
                        .setTitle('📈 HILO Game Started!')
                        .setDescription(`**${players.size} players joined!**\n\nCurrent number: **${startNumber}**`)
                        .setFooter({ text: 'Get ready to guess Higher or Lower!' })
                        .setTimestamp();

                    try { await msg.edit({ embeds: [startEmbed], components: [] }); } catch (e) {}

                    setTimeout(() => {
                        const game = activeHiLo.get(msg.id);
                        if (game && game.active) {
                            startHiLoRound(msg, game);
                        }
                    }, 3000);
                });
                return;
            }

            // === /status ===
            if (commandName === 'status') {
                const target = interaction.options.getUser('user') || interaction.user;
                const stats = await getStats(target.id);
                if (!stats) {
                    return interaction.reply({ content: '❌ Could not fetch stats', ephemeral: true });
                }

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

                return interaction.reply({ embeds: [embed] });
            }

            // === /toprating ===
            if (commandName === 'toprating') {
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

                if (top.length === 0) {
                    return interaction.reply({ content: '❌ No data yet (need ≥5 votes per host)', ephemeral: true });
                }

                const lines = top.map((e, i) => {
                    const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    return `${m} <@${e._id}> — **${e.percent}%** (${e.likes}👍 / ${e.dislikes}👎)`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🏆 Top Hosts')
                    .setDescription(lines.join('\n'))
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // === /help ===
            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📜 Commands')
                    .setDescription('**Event Creation Commands** (Main Server Only)')
                    .addFields(
                        { name: '🎮 Event Types', value: 'Create events with different Robux amounts', inline: false },
                        ...Object.entries(EVENT_TYPES).map(([k, v]) => ({
                            name: `-${k} [amount]`,
                            value: `${v.min}–${v.max} R$`,
                            inline: true
                        })),
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: '📊 Statistics', value: '`-status [@user]` — View host statistics\n`-toprating` — Top hosts by rating', inline: false },
                        { name: '🎮 Games', value: '`/ttt @user` — Tic-Tac-Toe\n`/battle [time]` — Battle Royale\n`/hilo [time]` — HILO', inline: false },
                        { name: '🔧 Admin Commands', value: '`-setstats @user <+/-number>` — Adjust Robux\n`-seteventstats @user <type> <number>` — Adjust event count', inline: false },
                        { name: '❓ Help', value: '`-help` or `/help` — Show this message', inline: false }
                    )
                    .setFooter({ text: `Requested by ${interaction.user.tag}` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error handling slash command:', commandName, error.message);
            const errorMsg = { content: '❌ An error occurred while processing your command.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMsg);
            } else {
                await interaction.reply(errorMsg);
            }
        }
        return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
        const customId = interaction.customId;

        try {
            // HILO JOIN/LEAVE - обрабатывается в коллекторе команды hilo
            if (['hilo_join', 'hilo_leave'].includes(customId)) {
                return interaction.deferUpdate().catch(() => {});
            }

            if (customId === 'hilo_higher' || customId === 'hilo_lower') {
                const game = activeHiLo.get(interaction.message.id);
                if (!game || !game.active) return;

                // Проверяем что игрок всё ещё в игре
                if (!game.players.has(interaction.user.id)) {
                    return interaction.reply({ content: '❌ You are eliminated! You cannot vote.', ephemeral: true });
                }

                // Сохраняем голос игрока
                const vote = customId === 'hilo_higher' ? 'higher' : 'lower';
                game.votes.set(interaction.user.id, vote);

                await interaction.reply({
                    content: `✅ Voted: **${vote === 'higher' ? '⬆️ Higher' : '⬇️ Lower'}**`,
                    ephemeral: true
                });
                return;
            }

            if (customId.startsWith('ttt_')) {
                const game = activeTicTacToe.get(interaction.message.id);
                if (!game || game.winner) return;

                if (game.currentTurn !== interaction.user.id) {
                    return interaction.reply({ content: '❌ Not your turn!', ephemeral: true });
                }

                const index = parseInt(customId.split('_')[1]);
                if (isNaN(index) || index < 0 || index > 8) return;
                if (game.board[index] === 'X' || game.board[index] === 'O') {
                    return interaction.reply({ content: '❌ This cell is already taken!', ephemeral: true });
                }

                game.board[index] = game.playerX === interaction.user.id ? 'X' : 'O';

                const winner = checkTicTacToeWinner(game.board);

                if (winner) {
                    game.winner = winner;
                    await TicTacToe.findOneAndUpdate({ messageId: interaction.message.id }, {
                        board: game.board,
                        winner: winner,
                        active: false
                    });
                    activeTicTacToe.delete(interaction.message.id);

                    let desc = '';
                    if (winner === 'draw') {
                        desc = "🤝 It's a draw!";
                    } else {
                        const winnerId = winner === 'X' ? game.playerX : game.playerO;
                        desc = `🎉 **<@${winnerId}>** wins with **${winner}**!`;
                    }

                    const embed = new EmbedBuilder()
                        .setColor(winner === 'draw' ? 0xFFA500 : 0x00FF00)
                        .setTitle('⭕ Tic-Tac-Toe - Game Over')
                        .setDescription(desc)
                        .addFields({ name: 'Final Board', value: renderBoard(game.board) })
                        .setTimestamp();

                    await interaction.update({ embeds: [embed], components: [] });
                } else {
                    game.currentTurn = game.playerX === interaction.user.id ? game.playerO : game.playerO;
                    await TicTacToe.findOneAndUpdate({ messageId: interaction.message.id }, {
                        board: game.board,
                        currentTurn: game.currentTurn
                    });

                    const currentPlayer = game.currentTurn;
                    const isPlayerX = game.playerX === currentPlayer;

                    const embed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('⭕ Tic-Tac-Toe')
                        .setDescription(`**<@${game.playerX}>** vs **<@${game.playerO}>**\n\n<@${currentPlayer}>'s turn! (<@${currentPlayer}> is **${isPlayerX ? 'X' : 'O'}**)\n\n${renderBoard(game.board)}`)
                        .setFooter({ text: 'Click a button to place your mark' })
                        .setTimestamp();

                    const createRow = (start, end) => new ActionRowBuilder()
                        .addComponents(
                            ...Array.from({ length: end - start + 1 }, (_, i) => {
                                const idx = start + i;
                                return new ButtonBuilder()
                                    .setCustomId(`ttt_${idx}`)
                                    .setLabel(game.board[idx])
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(game.board[idx] !== String(idx + 1));
                            })
                        );

                    await interaction.update({
                        embeds: [embed],
                        components: [createRow(0, 2), createRow(3, 5), createRow(6, 8)]
                    });
                }
                return;
            }
        } catch (err) {
            console.error('Error in InteractionCreate:', err.message);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
            }
        }
    }
});

// ────────────────────────────────────────────────
// Reactions Handler
// ────────────────────────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    const emoji = reaction.emoji.name;
    if (!['👍', '👎'].includes(emoji)) return;

    try {
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
    } catch (err) {
        console.error('Error in MessageReactionAdd:', err.message);
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    const emoji = reaction.emoji.name;
    if (!['👍', '👎'].includes(emoji)) return;

    try {
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
    } catch (err) {
        console.error('Error in MessageReactionRemove:', err.message);
    }
});

// ────────────────────────────────────────────────
// Tic-Tac-Toe Functions 🔥 FIX
// ────────────────────────────────────────────────
function checkTicTacToeWinner(board) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of wins) {
        if (board[a] && board[a] !== '1' && board[a] !== '2' && board[a] !== '3' && 
            board[a] !== '4' && board[a] !== '5' && board[a] !== '6' && 
            board[a] !== '7' && board[a] !== '8' && board[a] !== '9' &&
            board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    // ✅ Проверка на ничью — только X и O на доске
    if (!board.some(cell => cell !== 'X' && cell !== 'O')) {
        return 'draw';
    }
    return null;
}

function renderBoard(board) {
    return `\`\`\`\n ${board[0]} │ ${board[1]} │ ${board[2]} \n───┼───┼───\n ${board[3]} │ ${board[4]} │ ${board[5]} \n───┼───┼───\n ${board[6]} │ ${board[7]} │ ${board[8]} \n\`\`\``;
}

// ────────────────────────────────────────────────
// Battle Functions 🔥 FIX — Победитель не зависает
// ────────────────────────────────────────────────
async function startBattleRound(message, battle) {
    try {
        if (!battle?.active) {
            console.log('⚠️ Battle not active, skipping round');
            return;
        }
        
        const round = ++battle.round;
        let aliveArray = Array.from(battle.alive);
        
        console.log('🎮 Battle Round', round, '- Alive:', aliveArray.length);
        
        // ✅ ПРОВЕРКА ПОБЕДИТЕЛЯ — в начале раунда
        if (aliveArray.length === 1) {
            battle.winner = aliveArray[0];
            battle.active = false;
            
            await Battle.findOneAndUpdate({ messageId: message.id }, {
                winner: battle.winner,
                active: false,
                round: battle.round
            }).catch(console.error);
            
            activeBattles.delete(message.id);
            
            const winnerData = battle.participants.get(battle.winner);
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('⚔️ Battle - Game Over!')
                .setDescription(`🏆 Winner: **<@${battle.winner}>** with **${winnerData?.hp || 0} HP** remaining!`)
                .setTimestamp();
            
            try {
                await message.edit({ 
                    content: `🎉 **<@${battle.winner}>** WINS THE BATTLE!`, 
                    embeds: [embed], 
                    components: [] 
                });
                console.log('✅ Battle winner announced successfully');
            } catch (err) {
                console.error('❌ Failed to edit message for winner:', err.message);
            }
            return; // ✅ Важно: выходим из функции
        }

        if (aliveArray.length === 0) {
            battle.active = false;
            await Battle.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error);
            activeBattles.delete(message.id);
            return;
        }

        const events = [];
        const shuffled = [...aliveArray].sort(() => Math.random() - 0.5);

        for (const userId of shuffled) {
            // ✅ ПРОВЕРКА: игрок всё ещё жив? (мог умереть в этом же раунде)
            if (!battle.alive.has(userId)) continue;
            
            const player = battle.participants.get(userId);
            if (!player) continue;
            
            const item = BATTLE_ITEMS[Math.floor(Math.random() * BATTLE_ITEMS.length)];
            player.item = item.name;

            // ✅ Получаем актуальный список живых (мог измениться)
            aliveArray = Array.from(battle.alive);
            const targets = aliveArray.filter(id => id !== userId);
            if (targets.length === 0) continue;
            
            const targetId = targets[Math.floor(Math.random() * targets.length)];
            const target = battle.participants.get(targetId);
            if (!target) continue;

            let eventText = '';
            const rng = Math.random();
            
            if (item.heal > 0) {
                player.hp = Math.min(player.maxHp, player.hp + item.heal);
                eventText = `<@${userId}> found **${item.name}** and healed for **${item.heal} HP**! (${player.hp}/${player.maxHp})`;
            } else if (item.damage > 0) {
                const damage = Math.floor(player.attack * (1 + item.damage / 20) * (0.8 + Math.random() * 0.4));
                const crit = rng > 0.8;
                const finalDamage = crit ? Math.floor(damage * 1.5) : damage;
                target.hp -= finalDamage;
                
                eventText = `<@${userId}> got **${item.name}** and dealt **${finalDamage} damage** to <@${targetId}>! ${crit ? '💥 CRITICAL!' : ''}`;
                
                if (target.hp <= 0) {
                    target.hp = 0;
                    battle.alive.delete(targetId);
                    eventText += `\n☠️ <@${targetId}> was eliminated!`;
                }
            } else if (item.heal < 0) {
                player.hp = Math.max(0, player.hp + item.heal);
                eventText = `<@${userId}> got cursed with **${item.name}** and lost **${Math.abs(item.heal)} HP**! (${player.hp}/${player.maxHp})`;
                if (player.hp <= 0) {
                    battle.alive.delete(userId);
                    eventText += `\n☠️ <@${userId}> was eliminated!`;
                }
            }

            events.push(eventText);
            
            await Battle.findOneAndUpdate(
                { messageId: message.id, 'participants.userId': userId },
                { $set: { 'participants.$.hp': player.hp, 'participants.$.item': player.item } }
            ).catch(console.error);
        }

        // ✅ Сохраняем в БД
        await Battle.findOneAndUpdate({ messageId: message.id }, {
            round: battle.round,
            alive: Array.from(battle.alive).map(id => ({ userId: id }))
        }).catch(console.error);
        
        // ✅ Формируем список живых
        const aliveList = Array.from(battle.alive)
            .map(id => {
                const p = battle.participants.get(id);
                if (!p) return null;
                const hpPercent = Math.round((p.hp / p.maxHp) * 100);
                const hpBar = '❤️'.repeat(Math.ceil(hpPercent / 20)) + '🖤'.repeat(5 - Math.ceil(hpPercent / 20));
                return `• <@${id}> ${hpBar} ${p.hp}/${p.maxHp}`;
            })
            .filter(Boolean)
            .join('\n') || 'None';

        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`⚔️ Battle - Round ${round}`)
            .setDescription(events.length > 0 ? events.join('\n\n') : '🤷 Nothing happened this round...')
            .addFields(
                { name: `📊 Alive (${battle.alive.size})`, value: aliveList },
                { name: '💀 Eliminated', value: `${Array.from(battle.participants.keys()).length - battle.alive.size}` }
            )
            .setFooter({ text: battle.alive.size > 1 ? 'Next round in 5 seconds...' : 'Determining winner...' })
            .setTimestamp();

        try {
            await message.edit({ embeds: [embed], components: [] });
        } catch (err) {
            console.error('❌ Failed to edit message:', err.message);
        }

        // ✅ ПРОВЕРКА ПОБЕДИТЕЛЯ — после обработки урона!
        aliveArray = Array.from(battle.alive);
        if (aliveArray.length <= 1) {
            console.log('🏆 Winner detected after round!', aliveArray.length);
            
            if (aliveArray.length === 1) {
                battle.winner = aliveArray[0];
            }
            battle.active = false;
            
            await Battle.findOneAndUpdate({ messageId: message.id }, {
                winner: battle.winner,
                active: false,
                round: battle.round
            }).catch(console.error);
            
            activeBattles.delete(message.id);
            
            if (battle.winner) {
                const winnerData = battle.participants.get(battle.winner);
                const winEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('⚔️ Battle - Game Over!')
                    .setDescription(`🏆 Winner: **<@${battle.winner}>** with **${winnerData?.hp || 0} HP** remaining!`)
                    .setTimestamp();
                
                try {
                    await message.edit({ 
                        content: `🎉 **<@${battle.winner}>** WINS THE BATTLE!`, 
                        embeds: [winEmbed], 
                        components: [] 
                    });
                    console.log('✅ Battle winner announced successfully');
                } catch (err) {
                    console.error('❌ Failed to edit message for winner:', err.message);
                }
            }
            return; // ✅ Выходим, не запускаем следующий раунд!
        }

        // ✅ Запускаем следующий раунд только если есть 2+ живых
        if (battle.alive.size > 1 && battle.active) {
            setTimeout(() => {
                const freshBattle = activeBattles.get(message.id);
                if (freshBattle?.active) {
                    startBattleRound(message, freshBattle);
                }
            }, 5000);
        }
        
    } catch (err) {
        console.error('❌ Error in startBattleRound:', err.message);
    }
}

// ────────────────────────────────────────────────
// HILO Functions 🔥 SIMULTANEOUS MODE
// ────────────────────────────────────────────────
async function startHiloRound(message, game) {
    try {
        // ✅ Проверки активности
        if (!game) {
            console.log('⚠️ HILO startHiloRound - game is null');
            return;
        }
        
        if (!game.active) {
            console.log('⚠️ HILO startHiloRound - game not active');
            return;
        }

        console.log('📈 startHiloRound called. Players:', game.players.size, 'Active:', game.active);

        // Проверка победителя (остался 1 игрок)
        if (game.players.size === 1) {
            console.log('🏆 HILO Winner detected!');
            const winnerId = Array.from(game.players.keys())[0];
            const winner = game.players.get(winnerId);

            game.active = false;
            activeHiLo.delete(message.id);

            const winEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏆 HILO - WINNER!')
                .setDescription(`**🎉 <@${winnerId}> wins the game!**\n\nFinal High Score: **${winner.highScore}**`)
                .setTimestamp();

            await message.edit({
                content: `🏆 **<@${winnerId}>** WINS HILO!`,
                embeds: [winEmbed],
                components: []
            });

            await HiLo.findOneAndUpdate({ messageId: message.id }, { active: false });
            console.log('✅ HILO winner announced');
            return;
        }

        // Проверка - если игроков 0
        if (game.players.size === 0) {
            console.log('❌ HILO - No players left!');
            game.active = false;
            activeHiLo.delete(message.id);
            await message.edit({
                content: '❌ HILO - No players left!',
                embeds: [],
                components: []
            });
            return;
        }

        const currentNumber = game.currentNumber;
        const voteTime = Math.floor(Date.now() / 1000) + 15; // 15 секунд

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📈 HILO')
            .setDescription(`**All players guess simultaneously!**\n\nCurrent number: **${currentNumber}**\n\nYou have **15 seconds** to vote!`)
            .addFields(
                { name: '⏱️ Time left', value: `<t:${voteTime}:R>`, inline: true },
                { name: '👥 Players', value: `${game.players.size}`, inline: true }
            )
            .setFooter({ text: 'Vote now or be eliminated!' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('hilo_higher')
                    .setLabel('Higher')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('⬆️'),
                new ButtonBuilder()
                    .setCustomId('hilo_lower')
                    .setLabel('Lower')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⬇️')
            );

        await message.edit({ embeds: [embed], components: [row] });
        console.log('📈 HILO Round started, waiting for votes...');

        // Ждём 15 секунд на голосование
        game.timer = setTimeout(async () => {
            if (game.active && game.players.size >= 1) {
                await processHiloVotes(message, game);
            }
        }, 15000);
    } catch (err) {
        console.error('Error in startHiloRound:', err.message);
    }
}

async function processHiloVotes(message, game) {
    try {
        if (!game?.active) {
            console.log('⚠️ HILO processHiloVotes - game not active');
            return;
        }

        const currentNumber = game.currentNumber;
        const newNumber = Math.floor(Math.random() * 100) + 1;
        const eliminated = [];
        const survivors = [];
        const noVote = [];

        console.log(`📈 Processing votes: ${game.votes.size} votes from ${game.players.size} players`);

        // Проверяем всех игроков
        for (const userId of game.players.keys()) {
            const player = game.players.get(userId);
            if (!player) continue;

            const guess = game.votes.get(userId);

            // Если игрок не голосовал - выбывает
            if (!guess) {
                noVote.push(`<@${userId}>`);
                eliminated.push(`<@${userId}>`);
                game.players.delete(userId);
                continue;
            }

            const isHigher = guess === 'higher';
            let correct = false;

            if (isHigher && newNumber > currentNumber) correct = true;
            if (!isHigher && newNumber < currentNumber) correct = true;

            if (correct) {
                player.highScore++;
                survivors.push(`<@${userId}>`);
            } else {
                eliminated.push(`<@${userId}>`);
                game.players.delete(userId);
            }
        }

        // 🔥 СПИСОК ЖИВЫХ ИГРОКОВ
        const aliveList = Array.from(game.players.keys()).map(id => `❤️ <@${id}>`).join('\n') || 'None';

        const resultEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📈 HILO - Results')
            .setDescription(`**Old number: ${currentNumber}**\n**New number: ${newNumber}**\n\n${newNumber > currentNumber ? '⬆️ Higher won!' : newNumber < currentNumber ? '⬇️ Lower won!' : '➡️ Same number!'}`)
            .addFields(
                { name: `✅ Survivors (${survivors.length})`, value: survivors.length > 0 ? survivors.join('\n') : 'None', inline: true },
                { name: `❌ Eliminated (${eliminated.length})`, value: eliminated.length > 0 ? eliminated.join('\n') : 'None', inline: true },
                { name: `❤️ Still in game (${game.players.size})`, value: aliveList, inline: false }
            );

        if (noVote.length > 0) {
            resultEmbed.addFields({ name: `⏱️ Didn't vote (${noVote.length})`, value: noVote.join('\n'), inline: false });
        }

        resultEmbed
            .setFooter({ text: `Remaining players: ${game.players.size}` })
            .setTimestamp();

        await message.edit({ embeds: [resultEmbed], components: [] });
        console.log(`📈 HILO Results - Survivors: ${survivors.length}, Eliminated: ${eliminated.length}, No vote: ${noVote.length}`);

        // Очищаем голоса
        game.votes.clear();

        // Проверка победителя
        if (game.players.size <= 1) {
            console.log(`📈 HILO - Game over, ${game.players.size} players left`);
            setTimeout(async () => {
                if (game.active && game.players.size === 1) {
                    const winnerId = Array.from(game.players.keys())[0];
                    const winner = game.players.get(winnerId);

                    game.active = false;
                    activeHiLo.delete(message.id);

                    // 🔥 ПИНГ ПОБЕДИТЕЛЯ
                    const winEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('🏆 HILO - WINNER!')
                        .setDescription(`**🎉 <@${winnerId}> wins the game!**\n\nFinal High Score: **${winner.highScore}**`)
                        .setTimestamp();

                    await message.edit({
                        content: `🏆 **<@${winnerId}>** WINS HILO!`,
                        embeds: [winEmbed],
                        components: []
                    });

                    await HiLo.findOneAndUpdate({ messageId: message.id }, { active: false });
                    console.log('✅ HILO winner announced');
                } else if (game.players.size === 0) {
                    // Никто не выиграл
                    game.active = false;
                    activeHiLo.delete(message.id);

                    await message.edit({
                        content: '❌ HILO - No winner!',
                        embeds: [new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ HILO - No Winner')
                            .setDescription('Everyone was eliminated!')
                            .setTimestamp()],
                        components: []
                    });

                    await HiLo.findOneAndUpdate({ messageId: message.id }, { active: false });
                }
            }, 3000);
            return;
        }

        // Новый раунд
        game.currentNumber = newNumber;

        await HiLo.findOneAndUpdate(
            { messageId: message.id },
            { currentNumber: newNumber }
        );

        // Запускаем следующий раунд только если игра активна
        setTimeout(async () => {
            if (game.active && game.players.size > 1) {
                await startHiloRound(message, game);
            } else {
                console.log('⚠️ HILO - Skipping round, game ended or not enough players');
            }
        }, 3000);
    } catch (err) {
        console.error('❌ Error in processHiloVotes:', err.message);
    }
}

// ────────────────────────────────────────────────
// Cleanup on Message Delete
// ────────────────────────────────────────────────
client.on(Events.MessageDelete, async (message) => {
    try {
        activeEvents.delete(message.id);
        activeTicTacToe.delete(message.id);
        activeBattles.delete(message.id);
        activeHiLo.delete(message.id);

        await Promise.all([
            Event.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error),
            TicTacToe.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error),
            Battle.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error),
            HiLo.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error)
        ]);
    } catch (err) {
        console.error('Error in MessageDelete:', err.message);
    }
});

// ────────────────────────────────────────────────
// Start Bot
// ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});