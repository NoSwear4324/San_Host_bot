require('dotenv').config();
const { 
    Client, GatewayIntentBits, ActivityType, EmbedBuilder, 
    Events, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection 
} = require('discord.js');
const mongoose = require('mongoose');

// ────────────────────────────────────────────────
// MongoDB Connection
// ────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────
const hostStatsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    eventsHosted: { type: Number, default: 0 },
    totalRobux: { type: Number, default: 0 },
    totalLikes: { type: Number, default: 0 },
    totalDislikes: { type: Number, default: 0 },
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

const eventSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: String,
    host: String,
    type: String,
    robux: Number,
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    voters: [{ userId: String, vote: String }],
    active: { type: Boolean, default: true }
}, { timestamps: true });

// Схемы для игр (добавлен TTL - удаление через 24 часа для чистоты БД)
const gameOptions = { timestamps: true, expires: 86400 }; 

const TicTacToe = mongoose.model('TicTacToe', new mongoose.Schema({
    messageId: String,
    playerX: String,
    playerO: String,
    currentTurn: String,
    board: [String],
    active: { type: Boolean, default: true }
}, gameOptions));

const Battle = mongoose.model('Battle', new mongoose.Schema({
    messageId: String,
    host: String,
    participants: Array,
    alive: [String],
    active: { type: Boolean, default: true }
}, gameOptions));

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const Event = mongoose.model('Event', eventSchema);

// ────────────────────────────────────────────────
// Client Setup
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

const EVENT_TYPES = {
    community: { name: 'Community', min: 5, max: 25, channelId: '1475487079164149913' },
    plus: { name: 'Plus', min: 25, max: 99, channelId: '1475486974252023872' },
    super: { name: 'Super', min: 100, max: 499, channelId: '1475486893859930263' }
    // ... добавь остальные из своего списка
};

const ADMIN_ROLES = ['1475552294203424880']; 

// Кэш для активных процессов
const activeGames = new Collection();

// ────────────────────────────────────────────────
// Logic Helpers
// ────────────────────────────────────────────────
function getBadge(likes, dislikes) {
    const total = likes + dislikes;
    if (total === 0) return { text: 'No ratings', color: 0x2F3136, percent: 0 };
    const percent = Math.round((likes / total) * 100);
    if (percent >= 90) return { text: '🏆 Diamond', color: 0xB9F2FF, percent };
    return { text: '🥉 Bronze', color: 0xCD7F32, percent };
}

// ────────────────────────────────────────────────
// Main Events
// ────────────────────────────────────────────────
client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    client.user.setActivity('-help | Events', { type: ActivityType.Watching });
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Команда создания ивента (динамическая)
    if (EVENT_TYPES[cmd]) {
        const cfg = EVENT_TYPES[cmd];
        if (message.channel.id !== cfg.channelId) return message.reply(`❌ Only in <#${cfg.channelId}>`);

        let robux = parseInt(args[0]) || cfg.min;
        if (robux < cfg.min || robux > cfg.max) return message.reply(`❌ Range: ${cfg.min}-${cfg.max}`);

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${cfg.name} Event`)
            .setDescription(`<@${message.author.id}> is hosting for **${robux} R$**`)
            .setColor(0x00FF00)
            .setFooter({ text: 'React with 👍 or 👎' });

        const msg = await message.channel.send({ embeds: [embed] });
        await msg.react('👍');
        await msg.react('👎');

        await Event.create({
            messageId: msg.id,
            channelId: msg.channel.id,
            host: message.author.id,
            type: cmd,
            robux: robux
        });
        
        await HostStats.findOneAndUpdate(
            { userId: message.author.id },
            { $inc: { eventsHosted: 1, totalRobux: robux, [`byType.${cmd}`]: 1 } },
            { upsert: true }
        );
    }

    // Команда Battle
    if (cmd === 'battle') {
        const time = parseInt(args[0]) || 30;
        const startTime = Math.floor(Date.now() / 1000) + time;

        const embed = new EmbedBuilder()
            .setTitle('⚔️ Battle Royale')
            .setDescription(`Starts <t:${startTime}:R>! Click the button to join.`)
            .setColor(0xFF4500);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('battle_join').setLabel('Join').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('battle_leave').setLabel('Leave').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });
        
        // Создаем временный объект в памяти для сбора участников
        activeGames.set(msg.id, { participants: new Set(), status: 'waiting' });

        setTimeout(async () => {
            const game = activeGames.get(msg.id);
            if (!game || game.participants.size < 2) {
                activeGames.delete(msg.id);
                return msg.edit({ content: '❌ Battle cancelled: Not enough players.', components: [] });
            }
            // Здесь должна быть логика раундов (round logic)
            msg.edit({ content: '⚔️ **The Battle has begun!**', components: [] });
        }, time * 1000);
    }
});

// ────────────────────────────────────────────────
// Interaction Handler (Кнопки)
// ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    // Логика кнопок Battle
    if (interaction.customId.startsWith('battle_')) {
        const game = activeGames.get(interaction.message.id);
        if (!game) return interaction.reply({ content: 'Event expired.', ephemeral: true });

        if (interaction.customId === 'battle_join') {
            game.participants.add(interaction.user.id);
            await interaction.reply({ content: '✅ Joined!', ephemeral: true });
        } else {
            game.participants.delete(interaction.user.id);
            await interaction.reply({ content: '🚪 Left.', ephemeral: true });
        }
    }

    // Логика реакций (рейтинг) — лучше использовать MessageReactionAdd, 
    // но для кнопок оставляем этот блок.
});

// Обработка 👍 / 👎 через реакции
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const event = await Event.findOne({ messageId: reaction.message.id, active: true });
    if (!event) return;

    if (reaction.emoji.name === '👍') event.likes++;
    if (reaction.emoji.name === '👎') event.dislikes++;
    
    await event.save();
    // Тут можно добавить updateEventEmbed() для обновления текста в реальном времени
});

client.login(process.env.TOKEN);