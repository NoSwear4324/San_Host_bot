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

const ADMIN_ROLES = ['1475552294203424880', '1475552827626619050']; // Change this to your actual Admin/Staff Role IDs

// ────────────────────────────────────────────────
// Cache
// ────────────────────────────────────────────────
const activeEvents = new Map();
const activeTicTacToe = new Map();
const activeBattles = new Map();
const activeHiLo = new Map();

// ────────────────────────────────────────────────
// Game Constants
// ────────────────────────────────────────────────
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
                { name: '🎮 Games', value: '`-ttt @user` — Tic-Tac-Toe (2 players)\n`-battle` — Battle Royale (RNG items)\n`-hilo` — Higher/Lower (1-100)', inline: false },
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

        const board = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const embed = new EmbedBuilder()
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

        const msg = await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });

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

        // 🔥 Unix timestamp для Discord (в секундах)
        const startTime = Math.floor(Date.now() / 1000) + timeSeconds;
        
        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('⚔️ Battle Royale')
            .setDescription('**Join the fight, gear up, and pray for good RNG!**\nEach round brings kills, chaos, items, or miracles. Outlive everyone else to claim victory!')
            .addFields(
                { name: '👥 Participants', value: `**1** / ∞\n<@${message.author.id}>`, inline: false },
                { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true }, // 🔥 Dynamic Timestamp
                { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }
            )
            .setFooter({ text: 'Click "Join Battle" to participate!' })
            .setTimestamp(startTime * 1000);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('battle_join')
                    .setLabel('Join Battle')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚔️')
            );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });

        const participants = new Map();
        participants.set(message.author.id, { hp: 100, maxHp: 100, attack: 10, item: 'None' });

        // Функция обновления списка участников
        async function updateParticipantsEmbed() {
            const participantList = Array.from(participants.entries())
                .map(([id, data]) => `• <@${id}> ❤️ ${data.hp}/${data.maxHp}`)
                .join('\n') || 'None';
            
            const newEmbed = EmbedBuilder.from(embed.toJSON())
                .setFields(
                    { name: '👥 Participants', value: `**${participants.size}** / ∞\n${participantList || 'Waiting...'}`, inline: false },
                    { name: '⏱️ Starts at', value: `<t:${startTime}:F> (<t:${startTime}:R>)`, inline: true },
                    { name: '🎮 Host', value: `<@${message.author.id}>`, inline: true }                );
            try { await msg.edit({ embeds: [newEmbed] }); } catch (e) {}
        }

        const collector = msg.createMessageComponentCollector({
            filter: i => i.customId === 'battle_join' && !i.user.bot,
            time: timeSeconds * 1000
        });

        collector.on('collect', async (interaction) => {
            if (!participants.has(interaction.user.id)) {
                participants.set(interaction.user.id, { hp: 100, maxHp: 100, attack: 10, item: 'None' });
                await interaction.reply({ content: '✅ You joined the battle! Good luck! 🍀', ephemeral: true });
                await updateParticipantsEmbed();
            } else {
                await interaction.reply({ content: '⚠️ You are already in this battle!', ephemeral: true });
            }
        });

        collector.on('end', async () => {
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

            const aliveSet = new Set(participants.keys());            activeBattles.set(msg.id, {
                _id: msg.id,
                host: message.author.id,
                participants,
                round: 0,
                alive: aliveSet,
                winner: null
            });

            // Стартовый экран
            const startEmbed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle('⚔️ Battle Started!')
                .setDescription(`**${participants.size} fighters entered the arena!**\n\n${Array.from(participants.keys()).map(id => `🗡️ <@${id}>`).join('\n')}`)
                .addFields({ name: '📊 Starting HP', value: Array.from(participants.keys()).map(id => `• <@${id}>: ❤️ 100/100`).join('\n') })
                .setFooter({ text: 'Round 1 beginning...' })
                .setTimestamp(startTime * 1000);

            await msg.edit({ embeds: [startEmbed], components: [] });
            
            setTimeout(() => startBattleRound(msg, activeBattles.get(msg.id)), 3000);
        });

        return;
    }

    // === HI-LO ===
    if (cmd === 'hilo') {
        const currentNumber = Math.floor(Math.random() * 100) + 1;
        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📈 Hi-Lo')
            .setDescription(`**Guess if the next number will be Higher or Lower!**\n\nCurrent number: **${currentNumber}**`)
            .setFooter({ text: 'Score: 0 | High Score: 0' })
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

        const msg = await message.channel.send({ embeds: [embed], components: [row] });

        await HiLo.create({
            messageId: msg.id,
            channelId: msg.channel.id,
            userId: message.author.id,
            currentNumber,
            score: 0,
            highScore: 0
        });

        activeHiLo.set(msg.id, {
            _id: msg.id,
            userId: message.author.id,
            currentNumber,
            score: 0,
            highScore: 0
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
            .setDescription(`🏆 **<@${battle.winner}>** wins the battle!\n\nFinal Stats:\n❤️ HP: ${winnerData.hp}/${winnerData.maxHp}\n⚔️ Attack: ${winnerData.attack}`)
            .setTimestamp();
        return message.edit({ embeds: [embed], components: [] });
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

    await message.edit({ embeds: [embed] });

    if (battle.alive.size > 1) {
        setTimeout(() => startBattleRound(message, battle), 5000);
    } else {
        startBattleRound(message, battle);
    }
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

    // === HI-LO BUTTONS ===
    if (customId === 'hilo_higher' || customId === 'hilo_lower') {
        const game = activeHiLo.get(interaction.message.id);
        if (!game) return;

        if (game.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
        }

        const isHigher = customId === 'hilo_higher';
        const newNumber = Math.floor(Math.random() * 100) + 1;
        const currentNum = game.currentNumber;

        let correct = false;
        if (isHigher && newNumber > currentNum) correct = true;
        if (!isHigher && newNumber < currentNum) correct = true;
        if (newNumber === currentNum) correct = false;

        if (correct) {
            game.score++;
            if (game.score > game.highScore) {
                game.highScore = game.score;
            }
        } else {
            game.score = 0;
        }
        game.currentNumber = newNumber;

        await HiLo.findOneAndUpdate({ messageId: interaction.message.id }, {
            currentNumber: newNumber,
            score: game.score,
            highScore: game.highScore
        });

        const embed = new EmbedBuilder()
            .setColor(correct ? 0x00AE86 : 0xFF0000)
            .setTitle('📈 Hi-Lo')
            .setDescription(`**Guess if the next number will be Higher or Lower!**\n\nCurrent number: **${newNumber}**\n\n${correct ? '✅ Correct!' : '❌ Wrong! The game continues...'}`)
            .setFooter({ text: `Score: ${game.score} | High Score: ${game.highScore}` })
            .setTimestamp();

        await interaction.update({ embeds: [embed] });
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

            const isPlayerO = game.playerO === interaction.user.id;
            const currentPlayer = isPlayerO ? game.playerO : game.playerX;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('⭕ Tic-Tac-Toe')
                .setDescription(`**<@${game.playerX}>** vs **<@${game.playerO}>**\n\n<@${currentPlayer}>'s turn!\n\n${renderBoard(game.board)}`)
                .setFooter({ text: 'Click a button to place your mark' })
                .setTimestamp();

            await interaction.update({ embeds: [embed] });
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
    activeHiLo.delete(message.id);
    await Event.findOneAndUpdate({ messageId: message.id }, { active: false });
    await TicTacToe.findOneAndUpdate({ messageId: message.id }, { active: false });
    await Battle.findOneAndUpdate({ messageId: message.id }, { active: false });
    await HiLo.findOneAndUpdate({ messageId: message.id }, { active: false });
});

// ────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});