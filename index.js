require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActivityType, 
    EmbedBuilder, 
    Events, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const mongoose = require('mongoose');

// === ПОДКЛЮЧЕНИЕ ===
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// === СХЕМЫ ===
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

const eventRatingSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    host: String,
    type: String,
    robux: Number,
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    votes: { type: Map, of: String, default: {} } // Храним userId: "like" или "dislike"
});

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const EventRating = mongoose.model('EventRating', eventRatingSchema);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// === НАСТРОЙКИ (ID те же) ===
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

// === УТИЛИТЫ ===
async function updateRatingEmbed(message, rating) {
    const total = rating.likes + rating.dislikes;
    const percent = total > 0 ? Math.round((rating.likes / total) * 100) : 0;
    
    const embed = new EmbedBuilder()
        .setColor(percent >= 70 ? 0x00AE86 : 0xFF4500)
        .setTitle(`🎮 ${EVENT_TYPES[rating.type].name} Event`)
        .setDescription(`<@${rating.host}> is hosting! (${rating.robux} R$)`)
        .addFields(
            { name: '👍 Positive', value: `${rating.likes}`, inline: true },
            { name: '👎 Negative', value: `${rating.dislikes}`, inline: true },
            { name: '⭐ Score', value: total === 0 ? 'No ratings' : `${percent}%`, inline: true }
        )
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vote_like_${rating.messageId}`).setLabel(`👍 ${rating.likes}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`vote_dislike_${rating.messageId}`).setLabel(`👎 ${rating.dislikes}`).setStyle(ButtonStyle.Danger)
    );

    await message.edit({ embeds: [embed], components: [buttons] }).catch(() => {});
}

client.once(Events.ClientReady, () => console.log(`🚀 ${client.user.tag} Online`));

// === КОМАНДЫ ===
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (EVENT_TYPES[command]) {
        const type = command;
        const info = EVENT_TYPES[type];
        const robux = parseInt(args[0]) || info.min;

        if (message.channel.id !== info.channelId) return message.reply(`❌ Only in <#${info.channelId}>!`);
        if (!message.member.roles.cache.has(EVENT_ROLES[type])) return message.reply(`❌ Missing role!`);

        await HostStats.findOneAndUpdate({ userId: message.author.id }, { $inc: { eventsHosted: 1, totalRobux: robux, [`byType.${type}`]: 1 } }, { upsert: true });

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎮 ${info.name} Event`)
            .setDescription(`${message.author} is starting a ${info.name} Event! (${robux} R$)`)
            .addFields({ name: '👍 Positive', value: '0', inline: true }, { name: '👎 Negative', value: '0', inline: true }, { name: '⭐ Score', value: 'No ratings', inline: true });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vote_like_temp`).setLabel('👍 0').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vote_dislike_temp`).setLabel('👎 0').setStyle(ButtonStyle.Danger)
        );

        const ping = PING_ROLES[type] ? `<@&${PING_ROLES[type]}>` : '';
        const eventMsg = await message.channel.send({ content: ping, embeds: [embed], components: [buttons] });

        // Обновляем кнопки с реальным ID сообщения
        const realButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vote_like_${eventMsg.id}`).setLabel('👍 0').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vote_dislike_${eventMsg.id}`).setLabel('👎 0').setStyle(ButtonStyle.Danger)
        );
        await eventMsg.edit({ components: [realButtons] });

        await EventRating.create({ messageId: eventMsg.id, host: message.author.id, type: type, robux: robux });
        await message.delete().catch(() => {});
    }
});

// === ОБРАБОТКА КНОПОК ===
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const [prefix, action, msgId] = interaction.customId.split('_');
    if (prefix !== 'vote') return;

    const rating = await EventRating.findOne({ messageId: msgId });
    if (!rating) return interaction.reply({ content: '❌ Event not found', ephemeral: true });

    const userId = interaction.user.id;
    const oldVote = rating.votes.get(userId);

    if (oldVote === action) {
        // Убираем голос если нажал второй раз
        rating.votes.delete(userId);
        action === 'like' ? rating.likes-- : rating.dislikes--;
    } else {
        // Меняем или добавляем голос
        if (oldVote === 'like') rating.likes--;
        if (oldVote === 'dislike') rating.dislikes--;

        rating.votes.set(userId, action);
        action === 'like' ? rating.likes++ : rating.dislikes++;
    }

    await rating.save();
    await updateRatingEmbed(interaction.message, rating);
    await interaction.deferUpdate(); // Чтобы Discord не выдавал ошибку "interaction failed"
});

client.login(process.env.DISCORD_TOKEN);