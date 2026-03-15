require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

const hiloSchema = new mongoose.Schema({
    messageId:    { type: String, required: true, unique: true },
    channelId:    { type: String, required: true },
    userId:       { type: String, required: true },
    currentNumber:{ type: Number, required: true },
    score:        { type: Number, default: 0 },
    highScore:    { type: Number, default: 0 },
    active:       { type: Boolean, default: true }
}, { timestamps: true });

const wordBombSchema = new mongoose.Schema({
    messageId:    { type: String, required: true, unique: true },
    channelId:    { type: String, required: true },
    host:         { type: String, required: true },
    players:      [{ userId: String, bombs: { type: Number, default: 0 }, wordsGuessed: { type: Number, default: 0 } }],
    theme:        { type: String, required: true },
    usedWords:    [String],
    currentTurn:  { type: String, required: true },
    winner:       { type: String, default: null },
    active:       { type: Boolean, default: true }
}, { timestamps: true });

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const Event = mongoose.model('Event', eventSchema);
const TicTacToe = mongoose.model('TicTacToe', ticTacToeSchema);
const Battle = mongoose.model('Battle', battleSchema);
const HiLo = mongoose.model('HiLo', hiloSchema);
const WordBomb = mongoose.model('WordBomb', wordBombSchema);

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
const activeTicTacToe = new Map();
const activeBattles = new Map();
const activeHilo = new Map();
const activeWordBombs = new Map();

// ────────────────────────────────────────────────
// Game Constants
// ────────────────────────────────────────────────
const WORD_BOMB_THEMES = [
    { name: 'FOOD', examples: ['Pizza', 'Burger', 'Pasta'] },
    { name: 'ANIMALS', examples: ['Dog', 'Cat', 'Elephant'] },
    { name: 'CITIES', examples: ['London', 'Paris', 'Tokyo'] },
    { name: 'COLORS', examples: ['Red', 'Blue', 'Green'] },
    { name: 'SPORTS', examples: ['Football', 'Tennis', 'Golf'] },
    { name: 'JOBS', examples: ['Doctor', 'Teacher', 'Chef'] },
    { name: 'BODY PARTS', examples: ['Hand', 'Foot', 'Eye'] },
    { name: 'VEHICLES', examples: ['Car', 'Bus', 'Train'] },
    { name: 'COUNTRIES', examples: ['USA', 'China', 'Brazil'] },
    { name: 'MOVIES', examples: ['Titanic', 'Avatar', 'Joker'] }
];

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
];

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

    const tttGames = await TicTacToe.find({ active: true });
    for (const game of tttGames) {
        activeTicTacToe.set(game.messageId, {
            _id: game._id,
            playerX: game.playerX,
            playerO: game.playerO,
            currentTurn: game.currentTurn,
            board: game.board,
            winner: game.winner
        });
    }
    console.log(`⭕ Loaded ${activeTicTacToe.size} active Tic-Tac-Toe games`);

    const battles = await Battle.find({ active: true });
    for (const battle of battles) {
        activeBattles.set(battle.messageId, {
            _id: battle._id,
            host: battle.host,
            participants: new Map(battle.participants.map(p => [p.userId, { hp: p.hp, maxHp: p.maxHp, attack: p.attack, item: p.item }])),
            round: battle.round,
            alive: new Set(battle.alive.map(a => a.userId)),
            winner: battle.winner
        });
    }
    console.log(`⚔️ Loaded ${activeBattles.size} active battles`);

    const hiloGames = await HiLo.find({ active: true });
    for (const game of hiloGames) {
        activeHiLo.set(game.messageId, {
            _id: game._id,
            userId: game.userId,
            currentNumber: game.currentNumber,
            score: game.score,
            highScore: game.highScore
        });
    }
    console.log(`📈 Loaded ${activeHiLo.size} active Hi-Lo games`);

    client.user.setPresence({
        activities: [{ name: '-help • RBX Events & Games', type: ActivityType.Watching }],
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
                { name: '🎮 Games', value: '`-ttt @user` — Tic-Tac-Toe\n`-battle [time]` — Battle Royale\n`-hilo [time]` — HILO\n`-wordbomb [time]` — Word Bomb', inline: false },
                { name: '🔧 Admin Commands', value: '`-setstats @user <+/-number>` — Adjust Robux\n`-seteventstats @user <type> <number>` — Adjust event count', inline: false },
                { name: '❓ Help', value: '`-help` — Show this message', inline: false }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // === TIC-TAC-TOE ===
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
                await interaction.update({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('⭕ Tic-Tac-Toe')
                        .setDescription(`<@${opponent.id}> declined the challenge!`)
                        .setTimestamp()],
                    components: []
                });
                return;
            }

            if (interaction.customId === 'ttt_accept') {
                const board = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
                const gameEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('⭕ Tic-Tac-Toe')
                    .setDescription(`**<@${message.author.id}>** vs **<@${opponent.id}>**\n\n<@${message.author.id}> is **X** - Your turn!\n\n\`\`\`\n ${board[0]} │ ${board[1]} │ ${board[2]} \n───┼───┼───\n ${board[3]} │ ${board[4]} │ ${board[5]} \n───┼───┼───\n ${board[6]} │ ${board[7]} │ ${board[8]} \n\`\`\``)
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

                await interaction.update({ embeds: [gameEmbed], components: [row1, row2, row3] });

                await TicTacToe.create({
                    messageId: msg.id,
                    channelId: msg.channel.id,
                    playerX: message.author.id,
                    playerO: opponent.id,
                    currentTurn: message.author.id,
                    board,
                    winner: null
                });

                activeTicTacToe.set(msg.id, {
                    _id: msg.id,
                    playerX: message.author.id,
                    playerO: opponent.id,
                    currentTurn: message.author.id,
                    board,
                    winner: null
                });
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await msg.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⭕ Tic-Tac-Toe')
                        .setDescription(`<@${opponent.id}> didn't respond in time!`)
                        .setTimestamp()],
                    components: []
                });
            }
        });

        return;
    }

    // === BATTLE ===
    if (cmd === 'battle') {
        let timeSeconds = 30;
        if (args[0]) {
            const parsed = parseInt(args[0]);
            if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) {
                timeSeconds = parsed;
            }
        }

        const startTime = Math.floor(Date.now() / 1000) + timeSeconds; // 🔥 Unix timestamp
        
        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('⚔️ Battle Royale')
            .setDescription('**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!')
            .addFields(
                { name: '👥 Participants', value: '**0** / ∞\n*No one has joined yet*', inline: false },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true }, // 🔥 Dynamic timestamp
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
            )
            .setFooter({ text: 'Click "Join" or "Leave" before battle starts!' })
            .setTimestamp(startTime * 1000);

        // 🔘 Две кнопки: Join + Leave (только до начала битвы)
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
        // ⚠️ Создатель НЕ входит автоматически!

        async function updateParticipantsEmbed() {
            const participantList = Array.from(participants.entries())
                .map(([id, data]) => `• <@${id}> ❤️ ${data.hp}/${data.maxHp}`)
                .join('\n') || '*No one has joined yet*';
            
            const newEmbed = EmbedBuilder.from(embed.toJSON())                .setFields(
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
            // ⚔️ ВОЙТИ
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

            // 🚪 ВЫЙТИ (только до начала битвы!)
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
            if (participants.size < 2) {
                return msg.edit({ 
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF4500)
                        .setTitle('❌ Battle Cancelled')
                        .setDescription(`Not enough participants (need at least 2, got **${participants.size}**)\nBetter luck next time! 🍀`)
                    ], 
                    components: [] 
                });
            }
            const participantsArray = Array.from(participants.entries()).map(([userId, data]) => ({
                userId,
                hp: data.hp,
                maxHp: data.maxHp,
                attack: data.attack,
                item: data.item
            }));

            await Battle.create({
                messageId: msg.id,
                channelId: msg.channel.id,
                host: message.author.id,
                participants: participantsArray,
                round: 0,
                alive: participantsArray.map(p => ({ userId: p.userId })),
                winner: null
            });

            const aliveSet = new Set(participants.keys());
            activeBattles.set(msg.id, {
                _id: msg.id,
                host: message.author.id,
                participants,
                round: 0,
                alive: aliveSet,
                winner: null
            });

            // Стартовый экран - БЕЗ кнопок (выйти нельзя!)
            const startEmbed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle('⚔️ Battle Started!')
                .setDescription(`**${participants.size} fighters entered the arena!**\n\n${Array.from(participants.keys()).map(id => `🗡️ <@${id}>`).join('\n')}`)
                .addFields({ name: '📊 Starting HP', value: Array.from(participants.keys()).map(id => `• <@${id}>: ❤️ 100/100`).join('\n') })
                .setFooter({ text: 'No leaving allowed - fight to the end!' })
                .setTimestamp(startTime * 1000);

            await msg.edit({ embeds: [startEmbed], components: [] }); // ❌ components: [] = нет кнопок
            
            setTimeout(() => startBattleRound(msg, activeBattles.get(msg.id)), 3000);
        });

        return;
    }

    // === HILO ===
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
            const newEmbed = EmbedBuilder.from(embed.toJSON())
                .setFields(
                    { name: '👥 Players', value: `**${players.size}** / ∞\n${list}`, inline: false },
                    { name: '🔢 Starting Number', value: `**${startNumber}**`, inline: true },
                    { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                    { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
                );
            try { await msg.edit({ embeds: [newEmbed] }); } catch (e) {}
        }

        const collector = msg.createMessageComponentCollector({
            filter: i => ['hilo_join', 'hilo_leave'].includes(i.customId) && !i.user.bot,
            time: timeSeconds * 1000
        });

        collector.on('collect', async (interaction) => {
            // 📈 JOIN
            if (interaction.customId === 'hilo_join') {
                if (!players.has(interaction.user.id)) {
                    players.set(interaction.user.id, { score: 0, highScore: 0, currentNumber: startNumber });
                    await interaction.reply({ content: '✅ You joined HILO! Good luck! 🍀', ephemeral: true });
                    await updatePlayersEmbed();
                } else {
                    await interaction.reply({ content: '⚠️ You are already in this game!', ephemeral: true });
                }
                return;
            }

            // 🚪 LEAVE
            if (interaction.customId === 'hilo_leave') {
                if (players.has(interaction.user.id)) {
                    players.delete(interaction.user.id);
                    await interaction.reply({ content: '🚪 You left HILO!', ephemeral: true });
                    await updatePlayersEmbed();
                } else {
                    await interaction.reply({ content: '❌ You are not in this game!', ephemeral: true });
                }
                return;
            }
        });

        collector.on('end', async () => {
            if (players.size < 2) {
                return msg.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(0x00AE86)
                        .setTitle('❌ HILO Cancelled')
                        .setDescription(`Not enough players (need at least 2, got **${players.size}**)`)],
                    components: []
                });
            }

            const playersArray = Array.from(players.entries()).map(([userId, data]) => ({
                userId,
                score: data.score,
                highScore: data.highScore,
                currentNumber: data.currentNumber
            }));

            await HiLo.create({
                messageId: msg.id,
                channelId: msg.channel.id,
                host: message.author.id,
                players: playersArray,
                active: true
            });

            activeHilo.set(msg.id, {
                _id: msg.id,
                host: message.author.id,
                players: new Map(players),
                currentTurn: Array.from(players.keys())[0],
                currentNumber: startNumber
            });

            // Start HILO game - ping players in content
            await msg.edit({
                content: `📈 **HILO Game Started!** ${Array.from(players.keys()).map(id => `<@${id}>`).join(' ')}`,
                embeds: [new EmbedBuilder()
                    .setColor(0x00AE86)
                    .setTitle('📈 HILO - Game Started!')
                    .setDescription(`**${players.size} players joined!**\n\nFirst number: **${startNumber}**`)
                    .setFooter({ text: 'Game in progress...' })
                    .setTimestamp()],
                components: []
            });

            setTimeout(() => startHiloRound(msg, activeHilo.get(msg.id)), 3000);
        });

        return;
    }

    // === WORD BOMB ===
    if (cmd === 'wordbomb') {
        let timeSeconds = 30;
        if (args[0]) {
            const parsed = parseInt(args[0]);
            if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) {
                timeSeconds = parsed;
            }
        }

        const startTime = Math.floor(Date.now() / 1000) + timeSeconds;
        const theme = WORD_BOMB_THEMES[Math.floor(Math.random() * WORD_BOMB_THEMES.length)];

        const embed = new EmbedBuilder()
            .setColor(0xFF6B00)
            .setTitle('💣 Word Bomb')
            .setDescription('**Quick word game!**\nType a word by the theme before time runs out!\n💣 3 bombs = eliminated\n🏆 Last player wins!')
            .addFields(
                { name: '👥 Players', value: '**0** / 8\n*No one has joined yet*', inline: false },
                { name: '🎯 Theme', value: `**${theme.name}**\n*e.g. ${theme.examples.join(', ')}*`, inline: true },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
            )
            .setFooter({ text: 'Click "Join" or "Leave" before game starts!' })
            .setTimestamp(startTime * 1000);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('wordbomb_join')
                    .setLabel('Join Word Bomb')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('💣'),
                new ButtonBuilder()
                    .setCustomId('wordbomb_leave')
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🚪')
            );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });

        const players = new Map();

        async function updatePlayersEmbed() {
            const list = Array.from(players.keys()).map(id => `✅ <@${id}>`).join('\n') || '*No one has joined yet*';
            const newEmbed = EmbedBuilder.from(embed.toJSON())
                .setFields(
                    { name: '👥 Players', value: `**${players.size}** / 8\n${list}`, inline: false },
                    { name: '🎯 Theme', value: `**${theme.name}**\n*e.g. ${theme.examples.join(', ')}*`, inline: true },
                    { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                    { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
                );
            try { await msg.edit({ embeds: [newEmbed] }); } catch (e) {}
        }

        const collector = msg.createMessageComponentCollector({
            filter: i => ['wordbomb_join', 'wordbomb_leave'].includes(i.customId) && !i.user.bot,
            time: timeSeconds * 1000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'wordbomb_join') {
                if (!players.has(interaction.user.id)) {
                    if (players.size >= 8) {
                        return interaction.reply({ content: '❌ Game is full (max 8 players)!', ephemeral: true });
                    }
                    players.set(interaction.user.id, { bombs: 0, wordsGuessed: 0 });
                    await interaction.reply({ content: '✅ You joined Word Bomb! Good luck! 🍀', ephemeral: true });
                    await updatePlayersEmbed();
                } else {
                    await interaction.reply({ content: '⚠️ You are already in this game!', ephemeral: true });
                }
                return;
            }

            if (interaction.customId === 'wordbomb_leave') {
                if (players.has(interaction.user.id)) {
                    players.delete(interaction.user.id);
                    await interaction.reply({ content: '🚪 You left Word Bomb!', ephemeral: true });
                    await updatePlayersEmbed();
                } else {
                    await interaction.reply({ content: '❌ You are not in this game!', ephemeral: true });
                }
                return;
            }
        });

        collector.on('end', async () => {
            if (players.size < 2) {
                return msg.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF6B00)
                        .setTitle('❌ Word Bomb Cancelled')
                        .setDescription(`Not enough players (need at least 2, got **${players.size}**)`)],
                    components: []
                });
            }

            const playersArray = Array.from(players.entries()).map(([userId, data]) => ({
                userId,
                bombs: data.bombs,
                wordsGuessed: data.wordsGuessed
            }));

            await WordBomb.create({
                messageId: msg.id,
                channelId: msg.channel.id,
                host: message.author.id,
                players: playersArray,
                theme: theme.name,
                usedWords: [],
                currentTurn: Array.from(players.keys())[0],
                winner: null
            });

            activeWordBombs.set(msg.id, {
                _id: msg.id,
                host: message.author.id,
                players: new Map(players),
                theme: theme.name,
                usedWords: [],
                currentTurn: Array.from(players.keys())[0],
                timer: null
            });

            await msg.edit({
                content: `💣 **Word Bomb Started!** ${Array.from(players.keys()).map(id => `<@${id}>`).join(' ')}`,
                embeds: [new EmbedBuilder()
                    .setColor(0xFF6B00)
                    .setTitle(`💣 Word Bomb - Theme: ${theme.name}`)
                    .setDescription(`**${players.size} players joined!**\n\nType a word related to **${theme.name}**!\nYou have **10 seconds** per turn!`)
                    .setFooter({ text: 'Game in progress...' })
                    .setTimestamp()],
                components: []
            });

            setTimeout(() => startWordBombRound(msg, activeWordBombs.get(msg.id)), 3000);
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

// ────────────────────────────────────────────────
// Tic-Tac-Toe Functions
// ────────────────────────────────────────────────
function checkTicTacToeWinner(board) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of wins) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    if (!board.some(cell => cell !== 'X' && cell !== 'O')) {
        return 'draw';
    }
    return null;
}

function renderBoard(board) {
    return `\`\`\`\n ${board[0]} │ ${board[1]} │ ${board[2]} \n───┼───┼───\n ${board[3]} │ ${board[4]} │ ${board[5]} \n───┼───┼───\n ${board[6]} │ ${board[7]} │ ${board[8]} \n\`\`\``;
}

// ────────────────────────────────────────────────
// Battle Functions
// ────────────────────────────────────────────────
async function startBattleRound(message, battle) {
    const round = ++battle.round;
    const aliveArray = Array.from(battle.alive);
    
    // Проверка победителя
    if (aliveArray.length === 1) {
        battle.winner = aliveArray[0];
        battle.active = false;
        await Battle.findOneAndUpdate({ messageId: message.id }, {
            winner: battle.winner,
            active: false,
            round: battle.round
        });
        activeBattles.delete(message.id);
        
        const winnerData = battle.participants.get(battle.winner);
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('⚔️ Battle - Game Over!')
            .setDescription(`🏆 Winner: **${winnerData.hp} HP** remaining!\n\nFinal Stats:\n❤️ HP: ${winnerData.hp}/${winnerData.maxHp}\n⚔️ Attack: ${winnerData.attack}`)
            .setTimestamp();
        
        // 🔥 ПИНГ ПОБЕДИТЕЛЯ В CONTENT (внешний текст сообщения)
        return message.edit({ 
            content: `🎉 **<@${battle.winner}>** WINS THE BATTLE!`, 
            embeds: [embed], 
            components: [] 
        });
    }

    if (aliveArray.length === 0) {
        battle.active = false;
        await Battle.findOneAndUpdate({ messageId: message.id }, { active: false });
        activeBattles.delete(message.id);
        return;
    }

    const events = [];
    const shuffled = [...aliveArray].sort(() => Math.random() - 0.5);

    for (const userId of shuffled) {
        if (!battle.alive.has(userId)) continue;
        
        const player = battle.participants.get(userId);
        const item = BATTLE_ITEMS[Math.floor(Math.random() * BATTLE_ITEMS.length)];
        player.item = item.name;

        const targets = aliveArray.filter(id => id !== userId);
        if (targets.length === 0) continue;
        
        const targetId = targets[Math.floor(Math.random() * targets.length)];
        const target = battle.participants.get(targetId);

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
        );
    }

    await Battle.findOneAndUpdate({ messageId: message.id }, {
        round: battle.round,
        alive: Array.from(battle.alive).map(id => ({ userId: id }))
    });

    // Список живых с визуальным HP-баром
    const aliveList = Array.from(battle.alive)
        .map(id => {
            const p = battle.participants.get(id);
            const hpPercent = Math.round((p.hp / p.maxHp) * 100);
            const hpBar = '❤️'.repeat(Math.ceil(hpPercent / 20)) + '🖤'.repeat(5 - Math.ceil(hpPercent / 20));
            return `• <@${id}> ${hpBar} ${p.hp}/${p.maxHp}`;
        })
        .join('\n') || 'None';

    const embed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle(`⚔️ Battle - Round ${round}`)        .setDescription(events.length > 0 ? events.join('\n\n') : '🤷 Nothing happened this round...')
        .addFields(
            { name: `📊 Alive (${battle.alive.size})`, value: aliveList },
            { name: '💀 Eliminated', value: `${Array.from(battle.participants.keys()).length - battle.alive.size}` }
        )
        .setFooter({ text: battle.alive.size > 1 ? 'Next round in 5 seconds...' : 'Determining winner...' })
        .setTimestamp();

    // ❌ components: [] = НИКАКИХ кнопок во время битвы (выйти нельзя)
    await message.edit({ embeds: [embed], components: [] });

    if (battle.alive.size > 1) {
        setTimeout(() => startBattleRound(message, battle), 5000);
    } else {
        startBattleRound(message, battle);
    }
}

// ────────────────────────────────────────────────
// HILO Functions
// ────────────────────────────────────────────────
async function startHiloRound(message, game) {
    const currentPlayerId = game.currentTurn;
    const player = game.players.get(currentPlayerId);
    const currentNumber = game.currentNumber;

    if (!player) {
        // Игрок выбыл, передаём ход следующему
        const playerIds = Array.from(game.players.keys());
        const currentIndex = playerIds.indexOf(currentPlayerId);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        game.currentTurn = playerIds[nextIndex];
        return startHiloRound(message, game);
    }

    const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('📈 HILO')
        .setDescription(`**<@${currentPlayerId}>'s turn!**\n\nCurrent number: **${currentNumber}**\n\nGuess if the next number will be higher or lower!`)
        .setFooter({ text: `Score: ${player.score} | High Score: ${player.highScore} | Players: ${game.players.size}` })
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
}

async function processHiloGuess(interaction, game, isHigher) {
    const userId = interaction.user.id;
    const player = game.players.get(userId);
    const currentNumber = game.currentNumber;
    const newNumber = Math.floor(Math.random() * 100) + 1;

    let correct = false;
    if (isHigher && newNumber > currentNumber) correct = true;
    if (!isHigher && newNumber < currentNumber) correct = true;

    if (correct) {
        player.score++;
        if (player.score > player.highScore) {
            player.highScore = player.score;
        }
        player.currentNumber = newNumber;

        await HiLo.findOneAndUpdate(
            { messageId: interaction.message.id, 'players.userId': userId },
            {
                $set: {
                    'players.$.score': player.score,
                    'players.$.highScore': player.highScore,
                    'players.$.currentNumber': newNumber
                }
            }
        );

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📈 HILO')
            .setDescription(`**✅ Correct!**\n\nOld number: **${currentNumber}**\nNew number: **${newNumber}**\n\nYour streak continues!`)
            .setFooter({ text: `Score: ${player.score} | High Score: ${player.highScore}` })
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Тот же игрок продолжает
        game.currentNumber = newNumber;

        setTimeout(async () => {
            await startHiloRound(interaction.message, game);
        }, 2000);
    } else {
        // Игрок выбывает
        game.players.delete(userId);

        await HiLo.findOneAndUpdate(
            { messageId: interaction.message.id },
            {
                $pull: { players: { userId } }
            }
        );

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('📈 HILO')
            .setDescription(`**❌ Wrong!**\n\nOld number: **${currentNumber}**\nNew number: **${newNumber}**\n\n<@${userId}> is eliminated!`)
            .setFooter({ text: `Final High Score: ${player.highScore}` })
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Проверяем победителя
        if (game.players.size === 1) {
            const winnerId = Array.from(game.players.keys())[0];
            const winner = game.players.get(winnerId);

            setTimeout(async () => {
                const winEmbed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🏆 HILO - WINNER!')
                    .setDescription(`**🎉 <@${winnerId}> wins the game!**\n\nFinal High Score: **${winner.highScore}**`)
                    .setTimestamp();

                // 🔥 ПИНГ ПОБЕДИТЕЛЯ В CONTENT
                await interaction.message.edit({
                    content: `🏆 **<@${winnerId}>** WINS HILO!`,
                    embeds: [winEmbed],
                    components: []
                });

                game.active = false;
                activeHilo.delete(interaction.message.id);

                await HiLo.findOneAndUpdate({ messageId: interaction.message.id }, { active: false });
            }, 2000);
            return;
        }

        // Передаём ход следующему игроку
        const playerIds = Array.from(game.players.keys());
        const currentIndex = playerIds.indexOf(userId);
        const nextIndex = currentIndex >= playerIds.length - 1 ? 0 : currentIndex;
        game.currentTurn = playerIds[nextIndex];
        game.currentNumber = newNumber;

        setTimeout(async () => {
            await startHiloRound(interaction.message, game);
        }, 2000);
    }
}

// ────────────────────────────────────────────────
// Word Bomb Functions
// ────────────────────────────────────────────────
async function startWordBombRound(message, game) {
    const currentPlayerId = game.currentTurn;
    const player = game.players.get(currentPlayerId);

    if (!player) {
        const playerIds = Array.from(game.players.keys());
        if (playerIds.length === 0) return;
        game.currentTurn = playerIds[0];
        return startWordBombRound(message, game);
    }

    const embed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle(`💣 Word Bomb - Theme: ${game.theme}`)
        .setDescription(`**<@${currentPlayerId}>'s turn!**\n\nType a word related to **${game.theme}**!\nYou have **10 seconds**!`)
        .addFields(
            { name: '💣 Bombs', value: Array.from(game.players.entries()).map(([id, p]) => `• <@${id}>: ${p.bombs}${p.bombs >= 2 ? ' 💀' : ''}`).join('\n'), inline: false },
            { name: '📝 Used words', value: game.usedWords.length > 0 ? game.usedWords.slice(-5).join(', ') : '*None yet*', inline: false }
        )
        .setFooter({ text: `Players: ${game.players.size} | Used words: ${game.usedWords.length}` })
        .setTimestamp();

    await message.edit({ embeds: [embed], components: [] });

    // Запускаем таймер на 10 секунд
    game.timer = setTimeout(async () => {
        await handleWordBombTimeout(message, game);
    }, 10000);
}

async function handleWordBombTimeout(message, game) {
    const currentPlayerId = game.currentTurn;
    const player = game.players.get(currentPlayerId);

    if (!player) return;

    // Игрок не успел - получает бомбу
    player.bombs++;

    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⏰ Time\'s up!')
        .setDescription(`**<@${currentPlayerId}>** didn't respond in time!\n💣 Gets a bomb!`)
        .setTimestamp();

    await message.edit({ embeds: [embed], components: [] });

    // Проверяем выбывание
    if (player.bombs >= 3) {
        game.players.delete(currentPlayerId);

        const elimEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('☠️ Eliminated!')
            .setDescription(`**<@${currentPlayerId}>** got 3 bombs and is out of the game!`)
            .setTimestamp();

        await message.edit({ embeds: [elimEmbed], components: [] });

        await WordBomb.findOneAndUpdate(
            { messageId: message.id },
            {
                $pull: { players: { userId: currentPlayerId } }
            }
        );

        // Проверяем победителя
        if (game.players.size === 1) {
            const winnerId = Array.from(game.players.keys())[0];
            const winner = game.players.get(winnerId);

            setTimeout(async () => {
                const winEmbed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🏆 Word Bomb - WINNER!')
                    .setDescription(`**🎉 <@${winnerId}> wins Word Bomb!**\n\nFinal Bombs: **${winner.bombs}**\nWords Guessed: **${winner.wordsGuessed}**`)
                    .setTimestamp();

                await message.edit({
                    content: `🏆 **<@${winnerId}>** WINS WORD BOMB!`,
                    embeds: [winEmbed],
                    components: []
                });

                game.active = false;
                activeWordBombs.delete(message.id);

                await WordBomb.findOneAndUpdate({ messageId: message.id }, { active: false, winner: winnerId });
            }, 2000);
            return;
        }

        // Новая тема для следующего раунда
        const newTheme = WORD_BOMB_THEMES[Math.floor(Math.random() * WORD_BOMB_THEMES.length)];
        game.theme = newTheme.name;
        game.usedWords = [];
    }

    // Передаём ход следующему
    const playerIds = Array.from(game.players.keys());
    const currentIndex = playerIds.indexOf(currentPlayerId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    game.currentTurn = playerIds[nextIndex];

    await WordBomb.findOneAndUpdate(
        { messageId: message.id },
        {
            theme: game.theme,
            usedWords: game.usedWords,
            currentTurn: game.currentTurn
        }
    );

    setTimeout(() => {
        if (game.players.size > 1) {
            startWordBombRound(message, game);
        }
    }, 3000);
}

async function handleWordBombWord(message, game, userId, word) {
    const player = game.players.get(userId);
    if (!player) return false;

    const lowerWord = word.toLowerCase().trim();

    // Проверка на повтор
    if (game.usedWords.some(w => w.toLowerCase() === lowerWord)) {
        player.bombs++;

        const repeatEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Repeated word!')
            .setDescription(`**<@${userId}>** used "**${word}**" which was already used!\n💣 Gets a bomb!`)
            .setTimestamp();

        await message.edit({ embeds: [repeatEmbed], components: [] });

        if (player.bombs >= 3) {
            game.players.delete(userId);

            const elimEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('☠️ Eliminated!')
                .setDescription(`**<@${userId}>** got 3 bombs and is out of the game!`)
                .setTimestamp();

            await message.edit({ embeds: [elimEmbed], components: [] });

            await WordBomb.findOneAndUpdate(
                { messageId: message.id },
                { $pull: { players: { userId } } }
            );

            if (game.players.size === 1) {
                const winnerId = Array.from(game.players.keys())[0];
                const winner = game.players.get(winnerId);

                setTimeout(async () => {
                    const winEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('🏆 Word Bomb - WINNER!')
                        .setDescription(`**🎉 <@${winnerId}> wins Word Bomb!**\n\nFinal Bombs: **${winner.bombs}**\nWords Guessed: **${winner.wordsGuessed}**`)
                        .setTimestamp();

                    await message.edit({
                        content: `🏆 **<@${winnerId}>** WINS WORD BOMB!`,
                        embeds: [winEmbed],
                        components: []
                    });

                    game.active = false;
                    activeWordBombs.delete(message.id);

                    await WordBomb.findOneAndUpdate({ messageId: message.id }, { active: false, winner: winnerId });
                }, 2000);
                return true;
            }
        }

        // Передаём ход
        const playerIds = Array.from(game.players.keys());
        const currentIndex = playerIds.indexOf(userId);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        game.currentTurn = playerIds[nextIndex];

        return true;
    }

    // Слово принято
    player.wordsGuessed++;
    game.usedWords.push(word);

    const acceptEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Good!')
        .setDescription(`**<@${userId}>**: "**${word}**" - Accepted!`)
        .setTimestamp();

    await message.edit({ embeds: [acceptEmbed], components: [] });

    // Передаём ход следующему
    const playerIds = Array.from(game.players.keys());
    const currentIndex = playerIds.indexOf(userId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    game.currentTurn = playerIds[nextIndex];

    await WordBomb.findOneAndUpdate(
        { messageId: message.id },
        {
            usedWords: game.usedWords,
            currentTurn: game.currentTurn
        }
    );

    return true;
}

// ────────────────────────────────────────────────
// Game Reactions Handler
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
// Button Interaction Handler
// ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // === BATTLE JOIN/LEAVE BUTTONS ===
    if (customId === 'battle_join' || customId === 'battle_leave') {
        // Это обрабатывается collector'ем в команде battle
        return interaction.deferUpdate().catch(() => {});
    }

    // === HILO JOIN/LEAVE BUTTONS ===
    if (customId === 'hilo_join' || customId === 'hilo_leave') {
        // Это обрабатывается collector'ем в команде hilo
        return interaction.deferUpdate().catch(() => {});
    }

    // === WORD BOMB JOIN/LEAVE BUTTONS ===
    if (customId === 'wordbomb_join' || customId === 'wordbomb_leave') {
        // Это обрабатывается collector'ем в команде wordbomb
        return interaction.deferUpdate().catch(() => {});
    }

    // === TTT ACCEPT/DECLINE BUTTONS ===
    if (customId === 'ttt_accept' || customId === 'ttt_decline') {
        // Это обрабатывается collector'ем в команде ttt
        return interaction.deferUpdate().catch(() => {});
    }

    // === HILO GUESS BUTTONS ===
    if (customId === 'hilo_higher' || customId === 'hilo_lower') {
        const game = activeHilo.get(interaction.message.id);
        if (!game) return;

        if (game.currentTurn !== interaction.user.id) {
            return interaction.reply({ content: '❌ Not your turn!', ephemeral: true });
        }

        const isHigher = customId === 'hilo_higher';
        await processHiloGuess(interaction, game, isHigher);
        return;
    }

    // === TIC-TAC-TOE BUTTONS ===
    if (customId.startsWith('ttt_')) {
        const game = activeTicTacToe.get(interaction.message.id);
        if (!game || game.winner) return;

        if (game.currentTurn !== interaction.user.id) {
            return interaction.reply({ content: '❌ Not your turn!', ephemeral: true });
        }

        const index = parseInt(customId.split('_')[1]);
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

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_0').setLabel('1').setStyle(ButtonStyle.Secondary).setDisabled(game.board[0] !== '1'),
                    new ButtonBuilder().setCustomId('ttt_1').setLabel('2').setStyle(ButtonStyle.Secondary).setDisabled(game.board[1] !== '2'),
                    new ButtonBuilder().setCustomId('ttt_2').setLabel('3').setStyle(ButtonStyle.Secondary).setDisabled(game.board[2] !== '3')
                );
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_3').setLabel('4').setStyle(ButtonStyle.Secondary).setDisabled(game.board[3] !== '4'),
                    new ButtonBuilder().setCustomId('ttt_4').setLabel('5').setStyle(ButtonStyle.Secondary).setDisabled(game.board[4] !== '5'),
                    new ButtonBuilder().setCustomId('ttt_5').setLabel('6').setStyle(ButtonStyle.Secondary).setDisabled(game.board[5] !== '6')
                );
            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('ttt_6').setLabel('7').setStyle(ButtonStyle.Secondary).setDisabled(game.board[6] !== '7'),
                    new ButtonBuilder().setCustomId('ttt_7').setLabel('8').setStyle(ButtonStyle.Secondary).setDisabled(game.board[7] !== '8'),
                    new ButtonBuilder().setCustomId('ttt_8').setLabel('9').setStyle(ButtonStyle.Secondary).setDisabled(game.board[8] !== '9')
                );

            await interaction.update({ embeds: [embed], components: [row1, row2, row3] });
        }
        return;
    }
});

// ────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────
client.on(Events.MessageDelete, async (message) => {
    activeEvents.delete(message.id);
    activeTicTacToe.delete(message.id);
    activeBattles.delete(message.id);
    activeHilo.delete(message.id);
    await Event.findOneAndUpdate({ messageId: message.id }, { active: false });
    await TicTacToe.findOneAndUpdate({ messageId: message.id }, { active: false });
    await Battle.findOneAndUpdate({ messageId: message.id }, { active: false });
    await HiLo.findOneAndUpdate({ messageId: message.id }, { active: false });
    await WordBomb.findOneAndUpdate({ messageId: message.id }, { active: false });
});

// ────────────────────────────────────────────────
// Word Bomb Message Handler
// ────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Проверяем, есть ли активная Word Bomb игра в этом канале
    for (const [msgId, game] of activeWordBombs.entries()) {
        if (game.players.has(message.author.id) && game.currentTurn === message.author.id) {
            const word = message.content.trim();

            // Проверяем, что слово не пустое и не команда
            if (word.length > 0 && !word.startsWith('-')) {
                // Очищаем таймер
                if (game.timer) {
                    clearTimeout(game.timer);
                }

                // Обрабатываем слово
                await handleWordBombWord(message, game, message.author.id, word);

                // Удаляем сообщение игрока (чтобы не засорять чат)
                try {
                    await message.delete();
                } catch (e) {}

                // Запускаем следующий раунд
                if (game.players.size > 1 && game.active) {
                    setTimeout(() => {
                        startWordBombRound(message, game);
                    }, 2000);
                }
            }
            break;
        }
    }
});

// ────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});