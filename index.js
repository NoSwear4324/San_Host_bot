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
    voters: [{ userId: String, vote: { type: String, enum: ['like', 'dislike'] } }],
    active: { type: Boolean, default: true }
}, { timestamps: true });

const HostStats = mongoose.model('HostStats', hostStatsSchema);
const Event = mongoose.model('Event', eventSchema);

// ────────────────────────────────────────────────
// Client & Config
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
    super: { name: 'Super', min: 100, max: 499, channelId: '1475486893859930263' },
    ultra: { name: 'Ultra', min: 500, max: 999, channelId: '1475486697876754593' },
    ultimate: { name: 'Ultimate', min: 1000, max: 1999, channelId: '1475486579664617472' },
    extreme: { name: 'Extreme', min: 2000, max: 4999, channelId: '1475486418972184640' },
    godly: { name: 'Godly', min: 5000, max: 10000, channelId: '1475485770235117658' }
};

const ADMIN_ROLES = ['1475552294203424880']; 

// Хранилище активных игр в памяти
const activeGames = new Collection();

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function getBadge(likes, dislikes) {
    const total = likes + dislikes;
    if (total === 0) return { text: 'No ratings', color: 0x2F3136, percent: 0 };
    const percent = Math.round((likes / total) * 100);
    if (percent >= 90) return { text: '🏆 Diamond', color: 0xB9F2FF, percent };
    if (percent >= 80) return { text: '🥇 Gold', color: 0xFFD700, percent };
    return { text: '🥉 Bronze', color: 0xCD7F32, percent };
}

async function updateEventEmbed(message, eventData) {
    const { text, color, percent } = getBadge(eventData.likes, eventData.dislikes);
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 ${EVENT_TYPES[eventData.type]?.name} Event`)
        .setDescription(`<@${eventData.host}> is hosting for **${eventData.robux} R$**`)
        .addFields(
            { name: '👍 Likes', value: `${eventData.likes}`, inline: true },
            { name: '👎 Dislikes', value: `${eventData.dislikes}`, inline: true },
            { name: '⭐ Rating', value: `${percent}% (${text})`, inline: true }
        )
        .setTimestamp();
    
    await message.edit({ embeds: [embed] });
}

// ────────────────────────────────────────────────
// Battle Logic
// ────────────────────────────────────────────────
async function runBattle(message, gameData) {
    const players = Array.from(gameData.participants).map(id => ({ id, hp: 100 }));
    let log = "The battle has begun!";

    const interval = setInterval(async () => {
        if (players.filter(p => p.hp > 0).length <= 1) {
            clearInterval(interval);
            const winner = players.find(p => p.hp > 0);
            const finalEmbed = new EmbedBuilder()
                .setTitle("⚔️ Battle Results")
                .setDescription(winner ? `🏆 <@${winner.id}> is the winner!` : "💀 No survivors...")
                .setColor(0x00FF00);
            return message.edit({ content: "🔚 Battle Ended", embeds: [finalEmbed], components: [] });
        }

        const alive = players.filter(p => p.hp > 0);
        const attacker = alive[Math.floor(Math.random() * alive.length)];
        let target;
        do {
            target = alive[Math.floor(Math.random() * alive.length)];
        } while (target.id === attacker.id && alive.length > 1);

        const dmg = Math.floor(Math.random() * 30) + 10;
        target.hp -= dmg;
        log = `⚔️ <@${attacker.id}> dealt **${dmg} DMG** to <@${target.id}>!`;
        if (target.hp <= 0) log += `\n💀 <@${target.id}> was eliminated!`;

        const battleEmbed = new EmbedBuilder()
            .setTitle("⚔️ Battle in Progress")
            .setDescription(log)
            .addFields(players.map(p => ({
                name: `Player`,
                value: `<@${p.id}>: ${p.hp > 0 ? `❤️ ${p.hp} HP` : '💀 Dead'}`,
                inline: true
            })))
            .setColor(0xFF4500);

        await message.edit({ embeds: [battleEmbed] });
    }, 3000);
}

// ────────────────────────────────────────────────
// Tic-Tac-Toe Logic
// ────────────────────────────────────────────────
function checkTTTWinner(board) {
    const lines = [
        [0,1,2], [3,4,5], [6,7,8], // rows
        [0,3,6], [1,4,7], [2,5,8], // cols
        [0,4,8], [2,4,6]           // diag
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.includes(null) ? null : 'draw';
}

function getTTTButtons(board) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const idx = i * 3 + j;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ttt_move_${idx}`)
                    .setLabel(board[idx] || ' ')
                    .setStyle(board[idx] === 'X' ? ButtonStyle.Primary : board[idx] === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    .setDisabled(board[idx] !== null)
            );
        }
        rows.push(row);
    }
    return rows;
}

// ────────────────────────────────────────────────
// Commands Handler
// ────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith('-')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // 1. Event Creation
    if (EVENT_TYPES[cmd]) {
        const cfg = EVENT_TYPES[cmd];
        if (message.channel.id !== cfg.channelId) return;

        let robux = parseInt(args[0]) || cfg.min;
        if (robux < cfg.min || robux > cfg.max) return message.reply(`❌ Range: ${cfg.min}-${cfg.max}`);

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${cfg.name} Event`)
            .setDescription(`<@${message.author.id}> is hosting for **${robux} R$**`)
            .addFields(
                { name: '👍 Likes', value: '0', inline: true },
                { name: '👎 Dislikes', value: '0', inline: true },
                { name: '⭐ Rating', value: '0% (No ratings)', inline: true }
            )
            .setColor(0x5865F2);

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

    // 2. Battle Command
    if (cmd === 'battle') {
        const time = parseInt(args[0]) || 30;
        const startTime = Math.floor(Date.now() / 1000) + time;

        const embed = new EmbedBuilder()
            .setTitle('⚔️ Battle Royale')
            .setDescription(`Join now! Starts <t:${startTime}:R>`)
            .setColor(0xFF4500);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('battle_join').setLabel('Join').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('battle_leave').setLabel('Leave').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });
        activeGames.set(msg.id, { type: 'battle', participants: new Set() });

        setTimeout(async () => {
            const game = activeGames.get(msg.id);
            if (!game || game.participants.size < 2) {
                return msg.edit({ content: "❌ Battle cancelled (min 2 players)", components: [] });
            }
            runBattle(msg, game);
        }, time * 1000);
    }

    // 3. Tic-Tac-Toe Command
    if (cmd === 'ttt') {
        const opponent = message.mentions.users.first();
        if (!opponent || opponent.bot || opponent.id === message.author.id) return message.reply("❌ Mention a valid opponent!");

        const embed = new EmbedBuilder()
            .setTitle("⭕ Tic-Tac-Toe")
            .setDescription(`<@${message.author.id}> (X) vs <@${opponent.id}> (O)\n\nIt's <@${message.author.id}>'s turn!`)
            .setColor(0x5865F2);

        const board = Array(9).fill(null);
        const msg = await message.channel.send({ 
            embeds: [embed], 
            components: getTTTButtons(board) 
        });

        activeGames.set(msg.id, {
            type: 'ttt',
            players: { X: message.author.id, O: opponent.id },
            board,
            turn: 'X'
        });
    }
});

// ────────────────────────────────────────────────
// Global Interaction Handler
// ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const game = activeGames.get(interaction.message.id);
    if (!game) return;

    // BATTLE BUTTONS
    if (interaction.customId.startsWith('battle_')) {
        if (interaction.customId === 'battle_join') {
            game.participants.add(interaction.user.id);
            await interaction.reply({ content: "✅ You joined!", ephemeral: true });
        } else {
            game.participants.delete(interaction.user.id);
            await interaction.reply({ content: "🚪 You left.", ephemeral: true });
        }
    }

    // TTT BUTTONS
    if (interaction.customId.startsWith('ttt_move_')) {
        if (interaction.user.id !== game.players[game.turn]) {
            return interaction.reply({ content: "❌ Not your turn!", ephemeral: true });
        }

        const idx = parseInt(interaction.customId.split('_')[2]);
        game.board[idx] = game.turn;
        
        const winner = checkTTTWinner(game.board);
        if (winner) {
            const resEmbed = new EmbedBuilder()
                .setTitle("⭕ Game Over")
                .setDescription(winner === 'draw' ? "It's a draw!" : `🏆 <@${game.players[winner]}> won!`)
                .setColor(0x00FF00);
            activeGames.delete(interaction.message.id);
            return interaction.update({ embeds: [resEmbed], components: getTTTButtons(game.board) });
        }

        game.turn = game.turn === 'X' ? 'O' : 'X';
        const nextEmbed = new EmbedBuilder()
            .setTitle("⭕ Tic-Tac-Toe")
            .setDescription(`Current Turn: <@${game.players[game.turn]}> (${game.turn})`)
            .setColor(0x5865F2);
        
        await interaction.update({ embeds: [nextEmbed], components: getTTTButtons(game.board) });
    }
});

// ────────────────────────────────────────────────
// Reaction Rating Handler
// ────────────────────────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const eventData = await Event.findOne({ messageId: reaction.message.id, active: true });
    if (!eventData) return;

    // Убираем старый голос, если он был
    const existingVote = eventData.voters.find(v => v.userId === user.id);
    if (existingVote) return; // Простая защита: один голос за всё время

    if (reaction.emoji.name === '👍') eventData.likes++;
    if (reaction.emoji.name === '👎') eventData.dislikes++;
    
    eventData.voters.push({ userId: user.id, vote: reaction.emoji.name === '👍' ? 'like' : 'dislike' });
    await eventData.save();
    
    await updateEventEmbed(reaction.message, eventData);
});

client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    client.user.setActivity('-help | Events & Games', { type: ActivityType.Watching });
});

client.login(process.env.DISCORD_TOKEN);