require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});


// --- Настройки ---
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

const ADMIN_ROLES = ['1475552294203424880', '1475552827626619050'];

// --- Файлы ---
const STATS_FILE = path.join(__dirname, 'hostStats.json');
const RATINGS_FILE = path.join(__dirname, 'eventRatings.json');

let hostStats = new Map();
let eventRatings = new Map();

// --- MongoDB ---
const mongo = new MongoClient(process.env.MONGO_URI);
let db, hostStatsCol, eventRatingsCol;

async function initMongo() {
    await mongo.connect();
    db = mongo.db(process.env.DB_NAME);
    hostStatsCol = db.collection('hostStats');
    eventRatingsCol = db.collection('eventRatings');
}

// --- Утилиты ---
function createEmptyStats() {
    return { eventsHosted: 0, totalRobux: 0, byType: { community:0, plus:0, super:0, ultra:0, ultimate:0, extreme:0, godly:0 } };
}

function loadStats() { if (fs.existsSync(STATS_FILE)) hostStats = new Map(Object.entries(JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')))); }
function saveStats() { fs.writeFileSync(STATS_FILE, JSON.stringify(Object.fromEntries(hostStats), null, 2)); }
function loadRatings() { if (fs.existsSync(RATINGS_FILE)) { const data = JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8')); eventRatings.clear(); for(const [id,r] of Object.entries(data)) eventRatings.set(id,r); } }
function saveRatings() { fs.writeFileSync(RATINGS_FILE, JSON.stringify(Object.fromEntries(eventRatings), null, 2)); }

async function updateRatingEmbed(eventMessage, rating) {
    const totalRatings = rating.likes + rating.dislikes;
    const percent = totalRatings>0 ? Math.round(rating.likes/totalRatings*100):0;

    let ratingText='No ratings yet', color=0x00AE86;
    if(totalRatings>0){
        if(percent>=90){ratingText='🏆 Diamond';color=0xB9F2FF;}
        else if(percent>=80){ratingText='🥇 Gold';color=0xFFD700;}
        else if(percent>=70){ratingText='🥈 Silver';color=0xC0C0C0;}
        else if(percent>=60){ratingText='🥉 Bronze';color=0xCD7F32;}
        else {ratingText='⚠️ Low';color=0xFF4500;}
    }

    const embed=new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 ${EVENT_TYPES[rating.type].name} Event`)
        .setDescription(`<@${rating.host}> is hosting a ${EVENT_TYPES[rating.type].name} Event! (${rating.robux} R$)`)
        .addFields(
            { name:'👍 Positive', value:`${rating.likes}`, inline:true },
            { name:'👎 Negative', value:`${rating.dislikes}`, inline:true },
            { name:'⭐ Score', value: totalRatings===0?'No ratings yet':`${percent}% (${ratingText})`, inline:true }
        )
        .setFooter({ text:'React to rate this event' })
        .setTimestamp();

    const rolePing = PING_ROLES[rating.type] ? `<@&${PING_ROLES[rating.type]}>` : '';
    await eventMessage.edit({ content: rolePing || ' ', embeds:[embed] });
}

// --- Ready ---
client.once(Events.ClientReady, ()=>{
    console.log(`Logged in as ${client.user.tag}`);
    loadStats();
    loadRatings();
    client.user.setPresence({ activities:[{name:'-community, -plus...', type:ActivityType.Watching}], status:'online' });
});

// --- Команды ---
client.on(Events.MessageCreate, async message=>{
    if(message.author.bot || !message.guild) return;
    const prefix='-';
    if(!message.content.startsWith(prefix)) return;

    const args=message.content.slice(prefix.length).trim().split(/ +/);
    const command=args.shift().toLowerCase();

    // --- Хостинг ---
    if(EVENT_TYPES[command]){
        const type=command, info=EVENT_TYPES[type];
        const robux=args[0] && !isNaN(parseInt(args[0]))?parseInt(args[0]):info.min;
        const member=message.member;

        if(message.channel.id!==info.channelId) return message.reply({ content:`❌ Only in <#${info.channelId}>!`, ephemeral:true });
        if(!member.roles.cache.has(EVENT_ROLES[type])) return message.reply({ content:`❌ Need role ${info.name}!`, ephemeral:true });
        if(robux<info.min || robux>info.max) return message.reply({ content:`❌ Invalid amount ${robux} R$!`, ephemeral:true });

        if(!hostStats.has(message.author.id)) hostStats.set(message.author.id, createEmptyStats());
        const stats=hostStats.get(message.author.id);
        stats.eventsHosted++; stats.totalRobux+=robux; stats.byType[type]++; saveStats();

        const embed=new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎮 ${info.name} Event`)
            .setDescription(`${message.author} is starting a ${info.name} Event! (${robux} R$)`)
            .addFields(
                {name:'👍 Positive', value:'0', inline:true},
                {name:'👎 Negative', value:'0', inline:true},
                {name:'⭐ Score', value:'No ratings yet', inline:true}
            )
            .setFooter({text:'React to rate this event'}).setTimestamp();

        const rolePing = PING_ROLES[type]?`<@&${PING_ROLES[type]}>`:'';
        const eventMessage=await message.channel.send({ content:rolePing || ' ', embeds:[embed] });

        const buttons=new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`like_${eventMessage.id}`).setLabel('👍 0').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dislike_${eventMessage.id}`).setLabel('👎 0').setStyle(ButtonStyle.Danger)
        );
        await eventMessage.edit({ components:[buttons] });

        eventRatings.set(eventMessage.id,{ host:message.author.id, type:type, robux:robux, likes:0, dislikes:0, votes:{} });
        saveRatings();
        return;
    }

    // --- Статус ---
    if(command==='status'){
        const user=message.mentions.users.first()||message.author;
        const member=message.member;
        if(!member) return;

        const hostRoleIds=Object.values(EVENT_ROLES);
        const hasRole=member.roles.cache.some(r=>hostRoleIds.includes(r.id));
        if(!hasRole) return message.reply({ content:'❌ Need host role!', ephemeral:true });

        const stats=hostStats.get(user.id)||createEmptyStats();
        let typeStats=''; for(const [t,c] of Object.entries(stats.byType)) if(c>0) typeStats+=`${EVENT_TYPES[t].name}: ${c} events\n`;
        if(!typeStats) typeStats='No events hosted\n';

        let totalLikes=0,totalDislikes=0;
        eventRatings.forEach(r=>{ if(r.host===user.id){totalLikes+=r.likes; totalDislikes+=r.dislikes;} });
        const total=totalLikes+totalDislikes;
        const percent=total>0?Math.round(totalLikes/total*100):0;

        let ratingLevel='⭐ No ratings yet';
        if(total>0){
            if(percent>=90) ratingLevel='🏆 Diamond Host';
            else if(percent>=80) ratingLevel='🥇 Gold Host';
            else if(percent>=70) ratingLevel='🥈 Silver Host';
            else if(percent>=60) ratingLevel='🥉 Bronze Host';
            else ratingLevel='⚠️ Low Rated Host';
        }

        const embed=new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Host Status')
            .setDescription(`**User:** ${user.tag}`)
            .addFields(
                {name:'🎯 Total Events', value:`${stats.eventsHosted}`, inline:true},
                {name:'💰 Total Robux', value:`${stats.totalRobux} R$`, inline:true},
                {name:'**Events by Type:**', value:typeStats, inline:false},
                {name:'⭐ Rating', value:`${ratingLevel}\n👍 ${totalLikes} | 👎 ${totalDislikes} (${percent}% positive)`, inline:false}
            ).setTimestamp();
        return message.reply({ embeds:[embed] });
    }

    // --- Admin команды (-setstats, -seteventstats) ---
    if(command==='setstats' || command==='seteventstats'){
        const member=message.member;
        if(!member) return;
        const hasAdmin=member.roles.cache.some(r=>ADMIN_ROLES.includes(r.id));
        if(!hasAdmin) return message.reply({ content:'❌ No permission!', ephemeral:true });

        const user=message.mentions.users.first();
        if(!user) return message.reply({ content:'❌ Mention a user!', ephemeral:true });

        if(command==='setstats'){
            let robux=args[1];
            if(!robux) return message.reply({ content:'❌ Usage: -setstats @user <robux>', ephemeral:true });
            if(!hostStats.has(user.id)) hostStats.set(user.id, createEmptyStats());
            const stats=hostStats.get(user.id);
            if(robux.startsWith('-')) stats.totalRobux=Math.max(0,stats.totalRobux+parseInt(robux));
            else stats.totalRobux=parseInt(robux);
            saveStats();
            return message.reply({ content:`✅ Stats updated!`, ephemeral:true });
        } else {
            let type=args[1]?.toLowerCase();
            let count=args[2];
            if(!type || !EVENT_TYPES[type] || !count) return message.reply({ content:'❌ Usage: -seteventstats @user <type> <count>', ephemeral:true });
            if(!hostStats.has(user.id)) hostStats.set(user.id, createEmptyStats());
            const stats=hostStats.get(user.id);
            if(count.startsWith('-')) stats.byType[type]=Math.max(0,stats.byType[type]+parseInt(count));
            else stats.byType[type]=parseInt(count);
            stats.eventsHosted=Object.values(stats.byType).reduce((a,b)=>a+b,0);
            saveStats();
            return message.reply({ content:`✅ Event stats updated!`, ephemeral:true });
        }
    }

    // --- Top rating ---
    if(command==='toprating'){
        const hostRatings=new Map();
        eventRatings.forEach(r=>{
            if(!hostRatings.has(r.host)) hostRatings.set(r.host,{likes:0,dislikes:0,events:0});
            const data=hostRatings.get(r.host);
            data.likes+=r.likes; data.dislikes+=r.dislikes; data.events++;
        });

        const sorted=Array.from(hostRatings.entries()).filter(([_,d])=>d.likes+d.dislikes>=5)
            .map(([hostId,d])=>{const t=d.likes+d.dislikes; return {hostId,likes:d.likes,dislikes:d.dislikes,percent:Math.round(d.likes/t),events:d.events};})
            .sort((a,b)=>b.percent-a.percent || b.likes-a.likes).slice(0,10);
        if(sorted.length===0) return message.reply({ content:'❌ No ratings yet!', ephemeral:true });

        let leaderboard='';
        sorted.forEach((e,i)=>{const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`; leaderboard+=`${medal} <@${e.hostId}> - ${e.percent}% (${e.likes}👍 / ${e.dislikes}👎) in ${e.events} events\n`;});

        const embed=new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 Top Rated Hosts').setDescription(leaderboard)
            .setFooter({ text:'Minimum 5 ratings required' }).setTimestamp();
        return message.reply({ embeds:[embed] });
    }

    // --- Help ---
    if(command==='help'){
        const embed=new EmbedBuilder().setColor(0x0099FF).setTitle('📖 RBX Host Bot Commands').setDescription('**Host Commands:**')
            .addFields(
                { name:'-community <robux>', value:'Host Community event', inline:false },
                { name:'-plus <robux>', value:'Host Plus event', inline:false },
                { name:'-super <robux>', value:'Host Super event', inline:false },
                { name:'-ultra <robux>', value:'Host Ultra event', inline:false },
                { name:'-ultimate <robux>', value:'Host Ultimate event', inline:false },
                { name:'-extreme <robux>', value:'Host Extreme event', inline:false },
                { name:'-godly <robux>', value:'Host Godly event', inline:false },
                { name:'-status [user]', value:'View host stats & rating', inline:false },
                { name:'-toprating', value:'Show top rated hosts', inline:false },
                { name:'-help', value:'Show this message', inline:false },
                { name:'**Admin Commands:**', value:'Requires admin role', inline:false },
                { name:'-setstats @user <robux>', value:'Set Robux or use -50 to subtract', inline:false },
                { name:'-seteventstats @user <type> <count>', value:'Set events or use -5 to subtract', inline:false }
            ).setFooter({ text:'Each event type has its own channel and role requirement' }).setTimestamp();
        return message.channel.send({ embeds:[embed] });
    }
});

// --- Кнопки ---
client.on(Events.InteractionCreate, async interaction=>{
    if(!interaction.isButton()) return;
    const messageId=interaction.message.id;
    const rating=eventRatings.get(messageId);
    if(!rating) return interaction.reply({ content:'Event not found', ephemeral:true });

    const voteType=interaction.customId.startsWith('like')?'like':'dislike';
    const prevVote=rating.votes[interaction.user.id];

    // Отмена предыдущего голоса
    if(prevVote==='like') rating.likes--;
    if(prevVote==='dislike') rating.dislikes--;

    rating.votes[interaction.user.id]=voteType;
    if(voteType==='like') rating.likes++; else rating.dislikes++;

    const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`like_${messageId}`).setLabel(`👍 ${rating.likes}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`dislike_${messageId}`).setLabel(`👎 ${rating.dislikes}`).setStyle(ButtonStyle.Danger)
    );

    await interaction.message.edit({ components:[row] });
    await updateRatingEmbed(interaction.message, rating);
    saveRatings();

    await interaction.reply({ content:'✅ Vote counted!', ephemeral:true });
});

client.login(process.env.DISCORD_TOKEN);