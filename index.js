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

// === DATABASE CONNECTION ===
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => { 
        console.error('❌ MongoDB connection error:', err); 
        process.exit(1); 
    });

// === DATA SCHEMAS ===
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
    votes: { type: Map, of: String, default: {} } // Stores userId: "like" or "dislike"
});

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const EventRating = mongoose.model('EventRating', eventRatingSchema);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
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

// === HELPER FUNCTIONS ===
async function updateRatingEmbed(message, rating) {
    const total = rating.likes + rating.dislikes;
    const percent = total > 0 ? Math.round((rating.likes / total) * 100) : 0;
    
    let ratingText = '⭐ No ratings yet';
    if (total > 0) {
        if (percent >= 90) ratingText = '🏆 Diamond';
        else if (percent >= 80) ratingText = '🥇 Gold';
        else if (percent >= 70) ratingText = '🥈 Silver';
        else if (percent >= 60) ratingText = '🥉 Bronze';
        else ratingText = '⚠️ Low';
    }

    const embed = new EmbedBuilder()
        .setColor(total === 0 ? 0x00AE86 : (percent >= 70 ? 0x00FF00 : 0xFF0000))
        .setTitle(`🎮 ${EVENT_TYPES[rating.type].name} Event`)
        .setDescription(`<@${rating.host}> is hosting! (${rating.robux} R$)`)
        .addFields(
            { name: '👍 Positive', value: `${rating.likes}`, inline: true },
            { name: '👎 Negative', value: `${rating.dislikes}`, inline: true },
            { name: '⭐ Score', value: `${percent}% (${ratingText})`, inline: true }
        )
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vote_like_${rating.messageId}`).setLabel(`👍 ${rating.likes}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`vote_dislike_${rating.messageId}`).setLabel(`👎 ${rating.dislikes}`).setStyle(ButtonStyle.Danger)
    );

    await message.edit({ embeds: [embed], components: [buttons] }).catch(() => {});
}

client.once(Events.ClientReady, () => {
    console.log(`🚀 ${client.user.tag} is online and ready!`);
    client.user.setPresence({ activities: [{ name: '-help', type: ActivityType.Watching }] });
});

// === MESSAGE COMMANDS ===
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. EVENT HOSTING COMMANDS
    if (EVENT_TYPES[command]) {
        const type = command;
        const info = EVENT_TYPES[type];
        const robux = parseInt(args[0]) || info.min;

        if (message.channel.id !== info.channelId) return message.reply(`❌ You can only use this in <#${info.channelId}>!`);
        if (!message.member.roles.cache.has(EVENT_ROLES[type])) return message.reply(`❌ You need the **${info.name}** host role!`);
        if (robux < info.min || robux > info.max) return message.reply(`❌ Invalid amount! Limit: ${info.min}-${info.max} R$`);

        // Update Host Statistics in DB
        await HostStats.findOneAndUpdate(
            { userId: message.author.id }, 
            { $inc: { eventsHosted: 1, totalRobux: robux, [`byType.${type}`]: 1 } }, 
            { upsert: true }
        );

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎮 ${info.name} Event`)
            .setDescription(`${message.author} is starting an event! (${robux} R$)`)
            .addFields(
                { name: '👍 Positive', value: '0', inline: true }, 
                { name: '👎 Negative', value: '0', inline: true }, 
                { name: '⭐ Score', value: 'No ratings', inline: true }
            );

        const ping = PING_ROLES[type] ? `<@&${PING_ROLES[type]}>` : '';
        const eventMsg = await message.channel.send({ content: ping, embeds: [embed] });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vote_like_${eventMsg.id}`).setLabel('👍 0').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vote_dislike_${eventMsg.id}`).setLabel('👎 0').setStyle(ButtonStyle.Danger)
        );
        await eventMsg.edit({ components: [buttons] });

        await EventRating.create({ messageId: eventMsg.id, host: message.author.id, type: type, robux: robux });
        await message.delete().catch(() => {});
    }

    // 2. STATUS COMMAND
    if (command === 'status') {
        const user = message.mentions.users.first() || message.author;
        const stats = await HostStats.findOne({ userId: user.id }) || { eventsHosted: 0, totalRobux: 0, byType: {} };
        
        const ratings = await EventRating.find({ host: user.id });
        const totalLikes = ratings.reduce((sum, r) => sum + r.likes, 0);
        const totalDislikes = ratings.reduce((sum, r) => sum + r.dislikes, 0);
        const totalVotes = totalLikes + totalDislikes;
        const percent = totalVotes > 0 ? Math.round((totalLikes / totalVotes) * 100) : 0;

        let typeStats = '';
        for (const [t, info] of Object.entries(EVENT_TYPES)) {
            const count = stats.byType?.[t] || 0;
            if (count > 0) typeStats += `**${info.name}:** ${count}\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`📊 Host Stats: ${user.username}`)
            .addFields(
                { name: '🎯 Total Events', value: `${stats.eventsHosted}`, inline: true },
                { name: '💰 Total Robux', value: `${stats.totalRobux} R$`, inline: true },
                { name: '⭐ Rating', value: `${percent}% (👍 ${totalLikes} | 👎 ${totalDislikes})`, inline: false },
                { name: '📅 Breakdown', value: typeStats || 'No events hosted yet.', inline: false }
            );
        message.reply({ embeds: [embed] });
    }

    // 3. ADMIN COMMANDS (SETSTATS)
    if (command === 'setstats' || command === 'seteventstats') {
        if (!message.member.roles.cache.some(r => ADMIN_ROLES.includes(r.id))) return message.reply('❌ Permission denied!');
        const user = message.mentions.users.first();
        const value = parseInt(args[1]);
        if (!user || isNaN(value)) return message.reply('❌ Usage: `-setstats @user <number>`');

        if (command === 'setstats') {
            await HostStats.findOneAndUpdate({ userId: user.id }, { totalRobux: value }, { upsert: true });
            message.reply(`✅ Successfully set total Robux for **${user.username}** to **${value}**.`);
        } else {
            const type = args[2]?.toLowerCase();
            if (!EVENT_TYPES[type]) return message.reply('❌ Invalid event type!');
            await HostStats.findOneAndUpdate({ userId: user.id }, { [`byType.${type}`]: value }, { upsert: true });
            message.reply(`✅ Successfully set **${type}** events for **${user.username}** to **${value}**.`);
        }
    }

    // 4. TOP RATING LEADERBOARD
    if (command === 'toprating') {
        const allRatings = await EventRating.find();
        const hosts = {};
        allRatings.forEach(r => {
            if (!hosts[r.host]) hosts[r.host] = { likes: 0, total: 0 };
            hosts[r.host].likes += r.likes;
            hosts[r.host].total += (r.likes + r.dislikes);
        });

        const sorted = Object.entries(hosts)
            .filter(([_, data]) => data.total >= 5) // Minimum 5 votes for ranking
            .map(([id, data]) => ({ id, percent: Math.round((data.likes / data.total) * 100), total: data.total }))
            .sort((a, b) => b.percent - a.percent)
            .slice(0, 10);

        const leaderboard = sorted.length 
            ? sorted.map((h, i) => `${i+1}. <@${h.id}> — **${h.percent}%** (${h.total} votes)`).join('\n') 
            : 'No data available yet.';
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Top Rated Hosts')
            .setDescription(leaderboard)
            .setColor(0xFFD700);
        message.reply({ embeds: [embed] });
    }

    // 5. HELP COMMAND
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('📖 RBX Host Bot Help Menu')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Hosting Commands', value: '`-community`, `-plus`, `-super`, `-ultra`, `-ultimate`, `-extreme`, `-godly` [robux_amount]' },
                { name: 'Statistics', value: '`-status [@user]`, `-toprating`' },
                { name: 'Admin', value: '`-setstats @user <robux>`, `-seteventstats @user <count> <type>`' }
            );
        message.channel.send({ embeds: [embed] });
    }
});

// === BUTTON INTERACTION HANDLER ===
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const [prefix, action, msgId] = interaction.customId.split('_');
    if (prefix !== 'vote') return;

    const rating = await EventRating.findOne({ messageId: msgId });
    if (!rating) return interaction.reply({ content: '❌ Event data not found.', ephemeral: true });

    const userId = interaction.user.id;
    const oldVote = rating.votes.get(userId);

    if (oldVote === action) {
        // Remove vote if clicking the same button twice
        rating.votes.delete(userId);
        action === 'like' ? rating.likes-- : rating.dislikes--;
    } else {
        // Swap or add new vote
        if (oldVote === 'like') rating.likes--;
        if (oldVote === 'dislike') rating.dislikes--;
        rating.votes.set(userId, action);
        action === 'like' ? rating.likes++ : rating.dislikes++;
    }

    await rating.save();
    await updateRatingEmbed(interaction.message, rating);
    await interaction.deferUpdate();
});

client.login(process.env.DISCORD_TOKEN);