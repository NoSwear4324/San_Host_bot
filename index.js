require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
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
    active:       { type: Boolean, default: true },
    style:        { type: String, default: 'classic' }  // ✅ Style field
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

const ADMIN_ROLES = ['1475552294203424880', '1475552827626619050', '1493251166719578233', '1495665543234060409', '1495665703670255626'];
const HOST_BLACKLIST_ROLE = '1482828757965340978'; // Replace with actual blacklist role ID

// Tiers in ascending order (higher tier can host in lower tier channels)
const TIER_ORDER = ['community', 'plus', 'super', 'ultra', 'ultimate', 'extreme', 'godly'];

// Check if user with given type can host in channel of channelType
function canHostInChannel(userType, channelType) {
    const userTier = TIER_ORDER.indexOf(userType);
    const channelTier = TIER_ORDER.indexOf(channelType);
    
    // If either tier is not found, deny hosting
    if (userTier === -1 || channelTier === -1) {
        return false;
    }
    
    return userTier >= channelTier; // higher or equal tier can host
}

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
const OVERLAP_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

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
//YEAAAAAAAA
// ────────────────────────────────────────────────
// Battle Styles
// ────────────────────────────────────────────────
const BATTLE_STYLES = {
    classic: {
        name: 'Classic',
        emoji: '🎯',
        eventsPerPlayer: 1,
        killChance: 0.35,
        roundDelay: 5000,
        description: 'Balanced gameplay with HP and damage'
    },
    chaotic: {
        name: 'Chaotic',
        emoji: '🔥',
        eventsPerPlayer: 2,
        killChance: 0.65,
        roundDelay: 3000,
        description: 'More kills, chaos, and fun events!'
    },
    starry: {
        name: 'Starry',
        emoji: '⭐',
        eventsPerPlayer: 1,
        killChance: 0.55,
        roundDelay: 4000,
        description: 'Same like "Chaotic" but with single event per player!'
    }
};

// Chaotic Events (from screenshots) + Custom
const CHAOTIC_EVENTS = [
    // ☠️ DEATH / KILL Events
    { emoji: '☠️', text: (u, t) => `<@${u}> wrote <@${t}>'s name on his Death Note.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> got 13-studded by <@${t}>.` },
    { emoji: '☠️', text: (u) => `<@${u}> got degloved.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> didn't want to live in the same world as <@${t}> anymore.` },
    { emoji: '☠️', text: (u) => `<@${u}> fell off a roller coaster at 70 mph. We all know what happened next.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> killed <@${t}> with a chair.` },
    { emoji: '☠️', text: (u) => `<@${u}> spontaneously combusted.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> betrayed <@${t}>.` },
    { emoji: '☠️', text: (u) => `<@${u}> was taken by the gravity police.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> fed <@${t}> to the sharks.` },
    { emoji: '☠️', text: (u) => `<@${u}> forgot to breathe.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> convinced <@${t}> that the earth is flat. <@${t}> walked off the edge.` },
    { emoji: '☠️', text: (u) => `<@${u}> tried to swim in lava.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> sent <@${t}> to the shadow realm.` },
    { emoji: '☠️', text: (u) => `<@${u}>'s heart couldn't handle the stress.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> dropkicked <@${t}> into orbit.` },
    { emoji: '☠️', text: (u) => `<@${u}> tried to pet a landmine.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> tricked <@${t}> into drinking bleach.` },
    { emoji: '☠️', text: (u) => `<@${u}> was disqualified from life.` },
    { emoji: '☠️', text: (u, t) => `<@${u}> threw <@${t}> into a black hole.` },
    
    // 🗡️ ACTION / FIGHT Events
    { emoji: '🗡️', text: (u, t) => `<@${u}> cut down the tree 🪓` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> convinced <@${t}> to run a "lag remover" script.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> killed <@${t}>.` },
    { emoji: '🗡️', text: (u) => `<@${u}> found a sword. Interesting.` },
    { emoji: '🗡️', text: (u) => `<@${u}> is climbing.` },
    { emoji: '🗡️', text: (u) => `<@${u}> sold.` },
    { emoji: '🗡️', text: (u) => `<@${u}> fell for cricle.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> threw a rock at <@${t}>.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> pushed <@${t}> off a cliff.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> trolled <@${t}> hard.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> stabbed <@${t}> with a rusty spoon.` },
    { emoji: '🗡️', text: (u) => `<@${u}> is practicing combo moves.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> challenged <@${t}> to a duel.` },
    { emoji: '🗡️', text: (u) => `<@${u}> sharpened their blade.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> backstabbed <@${t}>.` },
    { emoji: '🗡️', text: (u) => `<@${u}> is on a rampage.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> hit <@${t}> with a critical strike.` },
    { emoji: '🗡️', text: (u) => `<@${u}> entered berserker mode.` },
    { emoji: '🗡️', text: (u, t) => `<@${u}> comboed <@${t}> into oblivion.` },
    { emoji: '🗡️', text: (u) => `<@${u}> is hunting for players.` },
    
    // 🌻 FUNNY / PEACEFUL Events
    { emoji: '🌻', text: (u) => `<@${u}> tiptoed through the tulips.` },
    { emoji: '🌻', text: (u) => `<@${u}> said "On my life, I'm gay."` },
    { emoji: '🌻', text: (u) => `<@${u}> didn't get alerted.` },
    { emoji: '🌻', text: (u) => `<@${u}> did absolutely nothing.` },
    { emoji: '🌻', text: (u) => `<@${u}> contemplated existence.` },
    { emoji: '🌻', text: (u) => `<@${u}> pet a dog.` },
    { emoji: '🌻', text: (u) => `<@${u}> found a cozy spot and napped.` },
    { emoji: '🌻', text: (u) => `<@${u}> enjoyed the scenery.` },
    { emoji: '🌻', text: (u) => `<@${u}> is vibing.` },
    { emoji: '🌻', text: (u) => `<@${u}> stopped to smell the roses.` },
    { emoji: '🌻', text: (u) => `<@${u}> is having an existential crisis.` },
    { emoji: '🌻', text: (u) => `<@${u}> made a new friend.` },
    { emoji: '🌻', text: (u) => `<@${u}> is living their best life.` },
    { emoji: '🌻', text: (u) => `<@${u}> took a selfie.` },
    { emoji: '🌻', text: (u) => `<@${u}> is dancing in the rain.` },
    { emoji: '🌻', text: (u) => `<@${u}> found a secret area.` },
    { emoji: '🌻', text: (u) => `<@${u}> is collecting butterflies.` },
    { emoji: '🌻', text: (u) => `<@${u}> wrote a poem.` },
    { emoji: '🌻', text: (u) => `<@${u}> is stargazing.` },
    { emoji: '🌻', text: (u) => `<@${u}> ordered a pizza.` },
    
    // ❤️ HEAL / BUFF Events
    { emoji: '❤️', text: (u) => `<@${u}> bought an extra life.` },
    { emoji: '❤️', text: (u) => `<@${u}> found a health potion.` },
    { emoji: '❤️', text: (u) => `<@${u}> is regenerating.` },
    { emoji: '❤️', text: (u) => `<@${u}> ate a power-up.` },
    { emoji: '❤️', text: (u) => `<@${u}> received a blessing.` },
    { emoji: '❤️', text: (u) => `<@${u}> is feeling lucky.` },
    { emoji: '❤️', text: (u) => `<@${u}> drank a smoothie.` },
    { emoji: '❤️', text: (u) => `<@${u}> is glowing with energy.` },
    
    // 🎲 RANDOM / CHAOS Events
    { emoji: '🎲', text: (u) => `<@${u}> rolled a natural 1.` },
    { emoji: '🎲', text: (u) => `<@${u}>'s controller disconnected.` },
    { emoji: '🎲', text: (u) => `<@${u}> is experiencing lag.` },
    { emoji: '🎲', text: (u) => `<@${u}> accidentally pressed the wrong button.` },
    { emoji: '🎲', text: (u) => `<@${u}> is confused.` },
    { emoji: '🎲', text: (u) => `<@${u}> summoned a random event.` },
    { emoji: '🎲', text: (u) => `<@${u}> is glitching through the floor.` },
    { emoji: '🎲', text: (u) => `<@${u}> became one with the void.` },
    
    // ⭐ STARRY SPECIAL Events
    { emoji: '⭐', text: (u) => `<@${u}> wished upon a star.` },
    { emoji: '⭐', text: (u) => `<@${u}> is channeling cosmic energy.` },
    { emoji: '⭐', text: (u) => `<@${u}> saw a shooting star.` },
    { emoji: '⭐', text: (u) => `<@${u}> is blessed by the stars.` },
    { emoji: '⭐', text: (u, t) => `<@${u}> dropped a star on <@${t}>.` },
    { emoji: '⭐', text: (u) => `<@${u}> is glowing stardust.` },
    { emoji: '⭐', text: (u) => `<@${u}> teleported through space.` },
    { emoji: '⭐', text: (u) => `<@${u}> collected star fragments.` },
    { emoji: '⭐', text: (u) => `<@${u}> is floating in zero gravity.` },
    { emoji: '⭐', text: (u) => `<@${u}> became a constellation.` }
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
                active: battle.active,
                style: battle.style || 'classic'  // ✅ Load style from DB
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
    } catch (err) {
        console.error('Error during client ready:', err.message);
    }
});

// ────────────────────────────────────────────────
// Messages / Commands
// ────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    try {
        // === CREATE EVENT ===
        if (EVENT_TYPES[cmd]) {
            const type = cmd;
            const cfg = EVENT_TYPES[type];

            // Find the channel type by channel ID
            let channelType = null;
            for (const [tierKey, tierConfig] of Object.entries(EVENT_TYPES)) {
                if (message.channel.id === tierConfig.channelId) {
                    channelType = tierKey;
                    break;
                }
            }

            // Check if this is a valid event channel
            if (!channelType) {
                return message.reply(`❌ This command can only be used in event channels!`);
            }

            // Check if user can host in this channel (higher tiers can host in lower tier channels)
            if (!canHostInChannel(type, channelType)) {
                const userTierIndex = TIER_ORDER.indexOf(type);
                const channelTierIndex = TIER_ORDER.indexOf(channelType);
                const requiredTier = TIER_ORDER[channelTierIndex];
                
                if (userTierIndex < channelTierIndex) {
                    return message.reply(`❌ You need at least **${EVENT_TYPES[requiredTier]?.name}** role to host in this channel!\nHigher tier players can host in lower tier channels.`);
                }
                
                return message.reply(`❌ You can't host ${cfg.name} events in this channel!`);
            }

            // Check if user has required tier role (higher tiers can host lower tier events)
            const requiredTierIndex = TIER_ORDER.indexOf(type);
            let hasRequiredRole = false;
            
            for (let i = requiredTierIndex; i < TIER_ORDER.length; i++) {
                const tierType = TIER_ORDER[i];
                if (message.member?.roles.cache.has(EVENT_ROLES[tierType])) {
                    hasRequiredRole = true;
                    break;
                }
            }
            
            if (!hasRequiredRole) {
                return message.reply(`❌ You need at least the **${cfg.name}** role to host this event!`);
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
                    { name: '🎮 Games', value: '`-ttt @user` — Tic-Tac-Toe\n`-battle [time]` — Battle\n`-hilo [time]` — HILO', inline: false },
                    { name: '🔧 Admin Commands', value: '`-setstats @user <+/-number>` — Adjust Robux\n`-seteventstats @user <type> <number>` — Adjust event count\n`-blacklist @user <time >` — Temp blacklist hosting (stacks if used again)', inline: false },
                    { name: '❓ Help', value: '`-help` — Show this message', inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            return message.reply({ embeds: [embed], ephemeral: true });
        }

    // === ADMIN: blacklist ===
    if (cmd === 'blacklist') {
        if (!message.member?.roles.cache.some(r => ADMIN_ROLES.includes(r.id))) {
            return message.react('🚫');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Usage: `-blacklist @user <duration> [reason]` (e.g., `1m spam`, `2h toxicity`)');

        const guild = message.guild;
        const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
        if (!member) return message.reply('❌ User not found in this server.');

        const role = guild.roles.cache.get(HOST_BLACKLIST_ROLE);
        if (!role) return message.reply('❌ Blacklist role not configured in bot settings.');

        // Parse duration (args[1])
        const durationStr = args[1];
        let durationMs = 24 * 60 * 60 * 1000; // Default 24h
        if (durationStr) {
            const match = durationStr.match(/^(\d+)([mhd])?$/i);
            if (!match) return message.reply('❌ Invalid duration. Use: `10m`, `2h`, `1d`');
            const amount = parseInt(match[1]);
            const unit = match[2]?.toLowerCase() || 'm';
            if (unit === 'm') durationMs = amount * 60 * 1000;
            else if (unit === 'h') durationMs = amount * 60 * 60 * 1000;
            else if (unit === 'd') durationMs = amount * 24 * 60 * 60 * 1000;
        }

        // Parse reason (args[2] and beyond)
        const reason = args.slice(2).join(' ') || 'No reason provided';

        if (!global.blacklistTimers) global.blacklistTimers = new Map();

        try {
            if (member.roles.cache.has(HOST_BLACKLIST_ROLE)) {
                // Already blacklisted: extend remaining time
                const existing = global.blacklistTimers.get(user.id);
                let remainingMs = durationMs;
                if (existing) {
                    clearTimeout(existing.timeoutId);
                    remainingMs = Math.max(0, existing.expiresAt - Date.now()) + durationMs;
                }

                const newExpiresAt = Date.now() + remainingMs;
                const newTimeoutId = setTimeout(async () => {
                    try {
                        const mem = await guild.members.fetch(user.id).catch(() => null);
                        if (mem && mem.roles.cache.has(HOST_BLACKLIST_ROLE)) {
                            await mem.roles.remove(role);
                            console.log(`⏳ Temporary blacklist for ${user.tag} expired.`);
                        }
                    } catch (e) {
                        console.error('❌ Failed to auto-remove blacklist role:', e.message);
                    } finally {
                        global.blacklistTimers.delete(user.id);
                    }
                }, remainingMs);

                global.blacklistTimers.set(user.id, { timeoutId: newTimeoutId, expiresAt: newExpiresAt, reason });

                const timeText = remainingMs < 60000 ? `${Math.ceil(remainingMs/1000)}s` :
                                 remainingMs < 3600000 ? `${Math.ceil(remainingMs/60000)}m` :
                                 remainingMs < 86400000 ? `${Math.ceil(remainingMs/3600000)}h` :
                                 `${Math.ceil(remainingMs/86400000)}d`;
                return message.reply(`⏱️ <@${user.id}> blacklist extended. **${timeText}** added.\n📝 Reason: \`${reason}\``);
            } else {
                // Not blacklisted: add role & set initial timer
                await member.roles.add(role);
                const expiresAt = Date.now() + durationMs;
                const timeoutId = setTimeout(async () => {
                    try {
                        const mem = await guild.members.fetch(user.id).catch(() => null);
                        if (mem && mem.roles.cache.has(HOST_BLACKLIST_ROLE)) {
                            await mem.roles.remove(role);
                            console.log(`⏳ Temporary blacklist for ${user.tag} expired.`);
                        }
                    } catch (e) {
                        console.error('❌ Failed to auto-remove blacklist role:', e.message);
                    } finally {
                        global.blacklistTimers.delete(user.id);
                    }
                }, durationMs);

                global.blacklistTimers.set(user.id, { timeoutId, expiresAt, reason });

                const timeText = durationMs < 60000 ? `${Math.ceil(durationMs/1000)}s` :
                                 durationMs < 3600000 ? `${Math.ceil(durationMs/60000)}m` :
                                 durationMs < 86400000 ? `${Math.ceil(durationMs/3600000)}h` :
                                 `${Math.ceil(durationMs/86400000)}d`;
                return message.reply(`🚫 <@${user.id}> has been **blacklisted** for **${timeText}**.\n📝 Reason: \`${reason}\``);
            }
        } catch (err) {
            console.error('Blacklist role error:', err.message);
            return message.reply('❌ Failed to update role. Check bot permissions and role hierarchy.');
        }
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
        // BATTLE COMMAND 🔥 FIX — Styles Support
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
    
    // ✅ Store battle data
    let currentStyle = 'classic';
    const participants = new Map();

    const style = BATTLE_STYLES[currentStyle];
    const embed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle('⚔️ Battle Royale')
        .setDescription(
            currentStyle === 'chaotic'
                ? '**🔥 CHAOTIC MODE ACTIVATED!**\nDouble the chaos, double the fun! Every player gets 2 events per round. Expect kills, betrayals, and absolute madness! Last player standing wins!'
                : currentStyle === 'starry'
                ? '**⭐ STARRY BATTLE ENGAGED!**\nCosmic chaos awaits! Each player gets 1 event per round with increased kill chance. The stars decide your fate—will you shine bright or burn out?'
                : '**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!'
        )
        .addFields(
            { name: '👥 Participants', value: '**0** / ∞\n*No one has joined yet*', inline: false },
            { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
            { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true },
            { name: '🎲 Game Style', value: `${style.emoji} ${style.name}`, inline: false }
        )
        .setFooter({ text: 'Click "Join", "Leave" or "Change Style"!' })
        .setTimestamp(startTime * 1000);

    // ✅ Buttons Row
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
                .setEmoji('🚪'),
            new ButtonBuilder()
                .setCustomId('battle_style')
                .setLabel('Change Style')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎲')
        );

    // ✅ Style Select Menu
    const styleSelect = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('battle_style_select')
                .setPlaceholder('Select battle style...')
                .addOptions([
                    {
                        label: 'Classic',
                        value: 'classic',
                        emoji: '🎯',
                        description: 'Balanced gameplay (1 event/player)'
                    },
                    {
                        label: 'Chaotic',
                        value: 'chaotic',
                        emoji: '🔥',
                        description: 'More kills & chaos (2 events/player)'
                    },
                    {
                        label: 'Starry',
                        value: 'starry',
                        emoji: '⭐',
                        description: 'Battle like in Starry (1 event/player)'
                    }
                ])
        );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    // ✅ Update function
    async function updateParticipantsEmbed(showStyleSelect = false) {
        const style = BATTLE_STYLES[currentStyle];

        let participantList;
        if (currentStyle === 'chaotic' || currentStyle === 'starry') {
            // Chaotic & Starry: No HP, just players
            participantList = Array.from(participants.keys())
                .map(id => `• <@${id}>`)
                .join('\n') || '*No one has joined yet*';
        } else {
            // Classic: With HP
            participantList = Array.from(participants.entries())
                .map(([id, data]) => `• <@${id}> ❤️ ${data.hp}/${data.maxHp}`)
                .join('\n') || '*No one has joined yet*';
        }

        const newEmbed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('⚔️ Battle Royale')
            .setDescription(
                currentStyle === 'chaotic'
                    ? '**🔥 CHAOTIC MODE ACTIVATED!**\nDouble the chaos, double the fun! Every player gets 2 events per round. Expect kills, betrayals, and absolute madness! Last player standing wins!'
                    : currentStyle === 'starry'
                    ? '**⭐ STARRY BATTLE ENGAGED!**\nCosmic chaos awaits! Each player gets 1 event per round with increased kill chance. The stars decide your fate—will you shine bright or burn out?'
                    : '**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!'
            )
            .addFields(
                { name: '👥 Participants', value: `**${participants.size}** / ∞\n${participantList}`, inline: false },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true },
                { name: '🎲 Game Style', value: `${style.emoji} ${style.name}`, inline: false }
            )
            .setFooter({ text: 'Click "Join", "Leave" or "Change Style"!' })
            .setTimestamp(startTime * 1000);

        try {
            const components = showStyleSelect ? [row, styleSelect] : [row];
            await msg.edit({ embeds: [newEmbed], components });
            // ✅ Обновляем embed для дальнейшего использования
            embed = newEmbed;
        } catch (e) {}
    }

    // ✅ Button Collector
    const collector = msg.createMessageComponentCollector({
        filter: i => ['battle_join', 'battle_leave', 'battle_style'].includes(i.customId) && !i.user.bot,
        time: timeSeconds * 1000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'battle_join') {
            if (!participants.has(interaction.user.id)) {
                participants.set(interaction.user.id, { 
                    hp: 100, 
                    maxHp: 100, 
                    attack: 10, 
                    item: 'None' 
                });
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

        if (interaction.customId === 'battle_style') {
            // 🔐 CHECK: Only host can change style
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: '❌ Only the battle host (<@' + message.author.id + '>) can change the game style!',
                    ephemeral: true
                });
            }

            // ✅ Показываем select menu под основным сообщением
            await updateParticipantsEmbed(true);
            await interaction.reply({
                content: '✅ Select a style from the menu below!',
                ephemeral: true
            });
            return;
        }
    });

    // ✅ Style Select Collector
    const styleCollector = msg.createMessageComponentCollector({
        filter: i => i.customId === 'battle_style_select' && !i.user.bot,
        time: timeSeconds * 1000
    });

    styleCollector.on('collect', async (interaction) => {
        try {
            const selectedStyle = interaction.values[0];
            const oldStyle = currentStyle;
            currentStyle = selectedStyle;
            const style = BATTLE_STYLES[selectedStyle];

            console.log('🎲 Style changed from', oldStyle, 'to', selectedStyle, 'by user', interaction.user.tag);

            // ✅ Если участники уже есть, показываем предупреждение
            if (participants.size > 0 && oldStyle !== selectedStyle) {
                await interaction.reply({
                    content: `✅ Style changed to **${style.emoji} ${style.name}**!\n⚠️ Note: This will affect the battle when it starts. Current participants' HP remains at 100.`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `✅ Game style changed to **${style.emoji} ${style.name}**!`,
                    ephemeral: true
                });
            }

            // ✅ Обновляем embed с новым стилем и убираем select menu
            await updateParticipantsEmbed();
        } catch (err) {
            console.error('❌ Style select error:', err.message);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error changing style!', ephemeral: true });
            }
        }
    });

    collector.on('end', async (collected, reason) => {
        console.log('🔪 Battle collector ended. Reason:', reason, 'Participants:', participants.size, 'Style:', currentStyle);

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
                host: message.author.id,
                participants: participantsArray,
                round: 0,
                alive: participantsArray.map(p => ({ userId: p.userId })),
                winner: null,
                style: currentStyle  // ✅ Save style to DB
            });
            console.log('✅ Battle created in database');
        } catch (err) {
            console.error('❌ Failed to create battle in DB:', err.message);
            return;
        }

        // ✅ Добавляем в кэш с ПРАВИЛЬНЫМИ структурами (Map и Set) + style
        activeBattles.set(msg.id, {
            _id: msg.id,
            host: message.author.id,
            participants: new Map(participants),
            round: 0,
            alive: new Set(participants.keys()),
            winner: null,
            active: true,
            style: currentStyle  // ✅ Store style
        });
        console.log('✅ Battle added to cache. Alive:', participants.size, 'Style:', currentStyle);

        const style = BATTLE_STYLES[currentStyle];
        const startEmbed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`⚔️ Battle Started! [${style.emoji} ${style.name}]`)
            .setDescription(`**${participants.size} fighters entered the arena!**\n\n${Array.from(participants.keys()).map(id => `🗡️ <@${id}>`).join('\n')}`)
            .addFields(
                currentStyle === 'chaotic' || currentStyle === 'starry'
                    ? { name: '⚙️ Style Settings', value: `Events per player: **${style.eventsPerPlayer}**\nKill chance: **${Math.round(style.killChance * 100)}%**\nRound delay: **${style.roundDelay/1000}s**`, inline: false }
                    : { name: '📊 Starting HP', value: Array.from(participants.keys()).map(id => `• <@${id}>: ❤️ 100/100`).join('\n'), inline: false }
            )
            .setFooter({ text: 'No leaving allowed - fight to the end!' })
            .setTimestamp();

        try {
            await msg.edit({ embeds: [startEmbed], components: [] });
            console.log('✅ Battle start message edited');
        } catch (err) {
            console.error('❌ Failed to edit start message:', err.message);
        }

        setTimeout(() => {
            const battle = activeBattles.get(msg.id);
            if (battle && battle.active) {
                console.log('🎮 Starting Battle Round 1, alive:', battle.alive.size, 'style:', battle.style);
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
// Battle Functions 🔥 FIX — Styles Support
// ────────────────────────────────────────────────
async function startBattleRound(message, battle) {
    try {
        if (!battle?.active) {
            console.log('⚠️ Battle not active, skipping round');
            return;
        }

        const round = ++battle.round;
        let aliveArray = Array.from(battle.alive);
        
        // ✅ Get style settings
        const style = BATTLE_STYLES[battle.style || 'classic'];
        const eventsPerPlayer = style.eventsPerPlayer;
        const killChance = style.killChance;
        const roundDelay = style.roundDelay;

        console.log('🎮 Battle Round', round, '- Style:', style.name, '- Alive:', aliveArray.length);

        // ✅ CHECK WINNER
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

            // ✅ Chaotic & Starly style - no HP shown
            const winDescription = battle.style === 'chaotic' || battle.style === 'starry'
                ? `🏆 Winner: **<@${battle.winner}>**`
                : `🏆 Winner: **<@${battle.winner}>** with **${winnerData?.hp || 0} HP** remaining!`;
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('⚔️ Battle - Game Over!')
                .setDescription(winDescription)
                .addFields({ name: '🎮 Style', value: `${style.emoji} ${style.name}` })
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
            return;
        }

        if (aliveArray.length === 0) {
            battle.active = false;
            await Battle.findOneAndUpdate({ messageId: message.id }, { active: false }).catch(console.error);
            activeBattles.delete(message.id);
            return;
        }

        const events = [];
        const shuffled = [...aliveArray].sort(() => Math.random() - 0.5);

        // ✅ Multiple events per player based on style
        for (let e = 0; e < eventsPerPlayer; e++) {
            // ✅ Обновляем aliveArray каждую итерацию для актуального списка
            aliveArray = Array.from(battle.alive);
            
            // ✅ Проверка на победу внутри цикла
            if (aliveArray.length <= 1) break;
            
            const shuffled = [...aliveArray].sort(() => Math.random() - 0.5);
            
            for (const userId of shuffled) {
                if (!battle.alive.has(userId)) continue;

                const player = battle.participants.get(userId);
                if (!player) continue;

                // ✅ CHAOTIC & STARRY STYLE - Use funny events
                if (battle.style === 'chaotic' || battle.style === 'starry') {
                    const chaoticEvent = CHAOTIC_EVENTS[Math.floor(Math.random() * CHAOTIC_EVENTS.length)];
                    const aliveTargets = Array.from(battle.alive).filter(id => id !== userId);
                    const targetId = aliveTargets.length > 0 ? aliveTargets[Math.floor(Math.random() * aliveTargets.length)] : null;

                    let eventText = '';
                    const isKillEvent = chaoticEvent.text.length === 2;
                    const isSelfKillEvent = chaoticEvent.text.length === 1 && chaoticEvent.emoji === '☠️';
                    const isKill = isKillEvent && targetId && (Math.random() < killChance);
                    const isSelfKill = isSelfKillEvent && (Math.random() < killChance);

                    if (isKill && targetId) {
                        // ✅ Kill another player
                        eventText = `${chaoticEvent.emoji} ${chaoticEvent.text(userId, targetId)}`;
                        battle.alive.delete(targetId);
                    } else if (isSelfKill) {
                        // ✅ Kill yourself
                        eventText = `${chaoticEvent.emoji} ${chaoticEvent.text(userId)}`;
                        battle.alive.delete(userId);
                    } else {
                        // ✅ No kill - just event
                        eventText = `${chaoticEvent.emoji} ${chaoticEvent.text.length === 2 ? chaoticEvent.text(userId, targetId) : chaoticEvent.text(userId)}`;
                    }

                    events.push(eventText);
                    continue;
                }

                // ✅ CLASSIC STYLE - Use HP/damage system
                const item = BATTLE_ITEMS[Math.floor(Math.random() * BATTLE_ITEMS.length)];
                player.item = item.name;

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
                    eventText = `🌿 <@${userId}> found **${item.name}** and healed for **${item.heal} HP**! (${player.hp}/${player.maxHp})`;
                } else if (item.damage > 0) {
                    const damage = Math.floor(player.attack * (1 + item.damage / 20) * (0.8 + Math.random() * 0.4));
                    const crit = rng > 0.8;
                    const finalDamage = crit ? Math.floor(damage * 1.5) : damage;
                    target.hp -= finalDamage;

                    const isKill = target.hp <= 0;
                    
                    if (isKill) {
                        target.hp = 0;
                        battle.alive.delete(targetId);
                        eventText = `💀 <@${userId}> got **${item.name}** and KILLED <@${targetId}> for **${finalDamage} damage**! ${crit ? '💥 CRITICAL!' : ''}`;
                    } else {
                        eventText = `⚔️ <@${userId}> got **${item.name}** and dealt **${finalDamage} damage** to <@${targetId}>! (${target.hp}/${target.maxHp}) ${crit ? '💥 CRITICAL!' : ''}`;
                    }
                } else if (item.heal < 0) {
                    player.hp = Math.max(0, player.hp + item.heal);
                    eventText = `☠️ <@${userId}> got cursed with **${item.name}** and lost **${Math.abs(item.heal)} HP**! (${player.hp}/${player.maxHp})`;
                    if (player.hp <= 0) {
                        battle.alive.delete(userId);
                        eventText += `\n💀 <@${userId}> was eliminated!`;
                    }
                }

                events.push(eventText);

                await Battle.findOneAndUpdate(
                    { messageId: message.id, 'participants.userId': userId },
                    { $set: { 'participants.$.hp': player.hp, 'participants.$.item': player.item } }
                ).catch(console.error);
            }
        }

        await Battle.findOneAndUpdate({ messageId: message.id }, {
            round: battle.round,
            alive: Array.from(battle.alive).map(id => ({ userId: id }))
        }).catch(console.error);

        // ✅ Format alive list based on style
        let aliveList;
        if (battle.style === 'chaotic' || battle.style === 'starry') {
            aliveList = Array.from(battle.alive)
                .map(id => `• <@${id}>`)
                .join('\n') || 'None';
        } else {
            aliveList = Array.from(battle.alive)
                .map(id => {
                    const p = battle.participants.get(id);
                    if (!p) return null;
                    const hpPercent = Math.round((p.hp / p.maxHp) * 100);
                    const hpBar = '❤️'.repeat(Math.ceil(hpPercent / 20)) + '🖤'.repeat(5 - Math.ceil(hpPercent / 20));
                    return `• <@${id}> ${hpBar} ${p.hp}/${p.maxHp}`;
                })
                .filter(Boolean)
                .join('\n') || 'None';
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`⚔️ Battle - Round ${round} ${battle.style === 'chaotic' ? `[🔥 Chaotic]` : battle.style === 'starry' ? `[⭐ Starry]` : battle.style === 'hardcore' ? `[💀 Hardcore]` : ''}`)
            .setDescription(
                battle.style === 'chaotic'
                    ? `🔥 **CHAOS UNLEASHED!** ${events.length} events happened this round!\n\n${events.join('\n')}`
                    : battle.style === 'starry'
                    ? `⭐ **STARS ALIGN!** ${events.length} cosmic events unfolded!\n\n${events.join('\n')}`
                    : events.length > 0 ? events.join('\n') : '🤷 Nothing happened this round...'
            )
            .addFields(
                { name: `Players Left (${battle.alive.size})`, value: aliveList },
                { name: '💀 Eliminated', value: `${Array.from(battle.participants.keys()).length - battle.alive.size}` }
            )
            .setFooter({ text: battle.alive.size > 1 ? `Next round in ${roundDelay/1000}s...` : '⚡ Finalizing results...' })
            .setTimestamp();

        try {
            await message.edit({ embeds: [embed], components: [] });
        } catch (err) {
            console.error('❌ Failed to edit message:', err.message);
        }

        // ✅ SAFETY CHECK: If only 1 player left, announce winner immediately
        if (battle.alive.size === 1) {
            battle.winner = Array.from(battle.alive)[0];
            battle.active = false;
            
            await Battle.findOneAndUpdate({ messageId: message.id }, {
                winner: battle.winner,
                active: false,
                round: battle.round
            }).catch(console.error);

            activeBattles.delete(message.id);

            const winnerId = battle.winner;
            const winnerData = battle.participants.get(winnerId);

            const winDescription = battle.style === 'chaotic' || battle.style === 'starry'
                ? `🏆 Winner: **<@${winnerId}>**`
                : `🏆 Winner: **<@${winnerId}>** with **${winnerData?.hp || 0} HP** remaining!`;

            const winEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('⚔️ Battle - Game Over!')
                .setDescription(winDescription)
                .addFields({ name: '🎮 Style', value: `${style.emoji} ${style.name}` })
                .setTimestamp();

            try {
                await message.edit({
                    content: `🎉 **<@${winnerId}>** WINS THE BATTLE!`,
                    embeds: [winEmbed],
                    components: []
                });
                console.log('✅ Battle winner announced (safety check)');
            } catch (err) {
                console.error('❌ Failed to edit winner message:', err.message);
            }
            return;
        }

        // ✅ CHECK WINNER after round
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

                // ✅ Chaotic & Starry style - no HP shown
                const winDescription = battle.style === 'chaotic' || battle.style === 'starry'
                    ? `🏆 Winner: **<@${battle.winner}>**`
                    : `🏆 Winner: **<@${battle.winner}>** with **${winnerData?.hp || 0} HP** remaining!`;

                const winTitle = battle.style === 'chaotic'
                    ? '🔥 Chaotic Battle - Game Over!'
                    : battle.style === 'starry'
                    ? '⭐ Starry Battle - Victory!'
                    : '⚔️ Battle - Game Over!';

                const winFooter = battle.style === 'chaotic'
                    ? 'Chaos has spoken!'
                    : battle.style === 'starry'
                    ? 'The stars have chosen their champion!'
                    : 'Battle concluded!';

                const winEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(winTitle)
                    .setDescription(winDescription)
                    .addFields(
                        { name: '🎮 Style', value: `${style.emoji} ${style.name}` },
                        { name: '💀 Total Eliminated', value: `${Array.from(battle.participants.keys()).length - 1}` }
                    )
                    .setFooter({ text: winFooter })
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
                    // ✅ Fallback: send new message if edit fails
                    try {
                        await message.channel.send({
                            content: `🎉 **<@${battle.winner}>** WINS THE BATTLE!`,
                            embeds: [winEmbed]
                        });
                    } catch (sendErr) {
                        console.error('❌ Failed to send winner message:', sendErr.message);
                    }
                }
            }
            return;
        }

        // ✅ SAFETY: If no players left (all died), end battle
        if (aliveArray.length === 0) {
            console.log('💀 All players eliminated - ending battle');
            battle.active = false;
            battle.winner = null;

            await Battle.findOneAndUpdate({ messageId: message.id }, {
                winner: null,
                active: false,
                round: battle.round
            }).catch(console.error);

            activeBattles.delete(message.id);

            const noWinnerEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚔️ Battle - No Winner!')
                .setDescription('💀 All fighters have been eliminated! No one survives.')
                .addFields({ name: '🎮 Style', value: `${style.emoji} ${style.name}` })
                .setTimestamp();

            try {
                await message.edit({
                    content: '💀 **NO SURVIVORS!**',
                    embeds: [noWinnerEmbed],
                    components: []
                });
            } catch (err) {
                console.error('❌ Failed to edit no-winner message:', err.message);
            }
            return;
        }

        if (battle.alive.size > 1 && battle.active) {
            console.log(`⏳ Next round in ${roundDelay/1000}s... (${battle.alive.size} players alive)`);
            
            // ✅ SAFETY TIMEOUT: Prevent battle from freezing
            const maxWaitTime = Math.max(roundDelay, 30000); // At least 30 seconds
            const safetyTimeout = setTimeout(() => {
                const frozenBattle = activeBattles.get(message.id);
                if (frozenBattle && frozenBattle.active) {
                    console.log('⚠️ Battle appears frozen - forcing end');
                    frozenBattle.active = false;
                    
                    // If there's still a player alive, declare them winner
                    if (frozenBattle.alive.size > 0) {
                        frozenBattle.winner = Array.from(frozenBattle.alive)[0];
                    }
                    
                    Battle.findOneAndUpdate({ messageId: message.id }, {
                        winner: frozenBattle.winner,
                        active: false,
                        round: frozenBattle.round
                    }).catch(console.error);
                    
                    activeBattles.delete(message.id);
                    
                    const safetyEmbed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⚔️ Battle Ended')
                        .setDescription('⚠️ Battle ended due to inactivity timeout')
                        .setFooter({ text: 'Maximum round time exceeded' })
                        .setTimestamp();
                    
                    message.edit({
                        content: frozenBattle.winner ? `⚠️ **<@${frozenBattle.winner}>** wins by default!` : '⚠️ **Battle ended - no survivors!**',
                        embeds: [safetyEmbed],
                        components: []
                    }).catch(console.error);
                }
            }, maxWaitTime * 2); // Double the normal wait time as safety

            const roundTimeout = setTimeout(() => {
                const freshBattle = activeBattles.get(message.id);
                if (freshBattle?.active && freshBattle.alive.size > 1) {
                    clearTimeout(safetyTimeout); // Cancel safety timeout if round starts
                    startBattleRound(message, freshBattle);
                } else if (freshBattle?.alive.size === 1) {
                    clearTimeout(safetyTimeout); // Cancel safety timeout
                    console.log('🏆 Winner detected before next round!', Array.from(freshBattle.alive)[0]);
                }
            }, roundDelay);
        } else {
            console.log(`⏹️ Battle ending... alive.size=${battle.alive.size}, active=${battle.active}`);
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
// Button Interaction Handler
// ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

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
                game.currentTurn = game.playerX === interaction.user.id ? game.playerO : game.playerX;
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
});

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