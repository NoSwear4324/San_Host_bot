# 🎮 RBX Host Bot

Discord bot for hosting Roblox mini events with different tiers.

## ⚡ User Installation (Works on Other Servers)

This bot supports **User Installation** - you can use it on other servers without adding it!

### 🔧 Setup in Discord Developer Portal:

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to **Installation** tab
4. Enable **User Install** (toggle ON)
5. Set **Installation Context** to **User Install**
6. In **Scope**, select: `applications.commands`, `messages.read`

### 📢 Invite Link

Use this link to install the bot for user installation:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&integration_type=1&scope=bot+applications.commands
```

Replace `YOUR_CLIENT_ID` with your bot's client ID.

### 🎮 How to Use on Other Servers

After installing with User Installation:

1. **Right-click the app** → "Open App" OR go to DM with the bot
2. **Use slash commands** in DM:
   - `/ttt @user` — Challenge someone to Tic-Tac-Toe
   - `/battle [time]` — Start a Battle Royale
   - `/hilo [time]` — Play HILO
   - `/status` — View your stats
   - `/help` — Show all commands

> **Note:** Event creation commands (`-community`, `-plus`, etc.) only work on the main server where roles/channels are configured. Games and stats work everywhere via DM!


## Event Types

| Command | Min Robux | Max Robux |
|---------|-----------|-----------|
| `-community <robux>` | 5 R$ | 25 R$ |
| `-plus <robux>` | 25 R$ | 99 R$ |
| `-super <robux>` | 100 R$ | 499 R$ |
| `-ultra <robux>` | 500 R$ | 999 R$ |
| `-ultimate <robux>` | 1000 R$ | 1999 R$ |
| `-extreme <robux>` | 2000 R$ | 4999 R$ |
| `-godly <robux>` | 5000 R$ | 10000 R$ |

## Commands

### Host Commands
| Command | Description |
|---------|-------------|
| `-community <robux>` | Host a Community event (requires role) |
| `-plus <robux>` | Host a Plus event (requires role) |
| `-super <robux>` | Host a Super event (requires role) |
| `-ultra <robux>` | Host an Ultra event (requires role) |
| `-ultimate <robux>` | Host an Ultimate event (requires role) |
| `-extreme <robux>` | Host an Extreme event (requires role) |
| `-godly <robux>` | Host a Godly event (requires role) |
| `-status [user]` | View host statistics & rating |
| `-rating <event_id>` | View rating for specific event |
| `-toprating` | Show top rated hosts |
| `-help` | Show all commands |

### Admin Commands
| Command | Description |
|---------|-------------|
| `-setstats @user <robux>` | Set Robux or use `-50` to subtract |
| `-seteventstats @user <type> <count>` | Set events or use `-5` to subtract |

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add your Discord bot token to `.env`:**
   ```
   DISCORD_TOKEN=your_token_here
   ```

3. **Configure channels, roles and ping roles in `index.js`:**
   ```javascript
   const EVENT_TYPES = {
       community: { name: 'Community', min: 5, max: 25, channelId: 'channel_id' },
       plus: { name: 'Plus', min: 25, max: 99, channelId: 'channel_id' },
       // ... etc
   };

   const EVENT_ROLES = {
       community: 'role_id',
       plus: 'role_id',
       // ... etc
   };

   const PING_ROLES = {
       community: 'ping_role_id',
       plus: 'ping_role_id',
       // ... etc
   };

   const ADMIN_ROLES = ['admin_role_id'];
   ```

4. **Run the bot:**
   ```bash
   npm start
   ```

## Example

```
User: -plus 50
Bot: @User is starting a Plus Event! (50 R$)
     @ping_role
     
     React below to rate this event:
     👍 Good | 👎 Bad
```

## Features

- ✅ Each event type has its own channel
- ✅ Role required to host each event type
- ✅ Custom Robux range for each tier
- ✅ Host statistics saved permanently
- ✅ Event rating system (👍/👎)
- ✅ Host levels based on rating (Diamond, Gold, Silver, Bronze)
- ✅ Error messages are ephemeral (only visible to sender)
- ✅ Status command shows events by type and rating

## Rating Levels

| Level | Requirement |
|-------|-------------|
| 🏆 Diamond Host | 90%+ positive |
| 🥇 Gold Host | 80-89% positive |
| 🥈 Silver Host | 70-79% positive |
| 🥉 Bronze Host | 60-69% positive |
| ⚠️ Low Rated Host | Below 60% positive |

## License

ISC
