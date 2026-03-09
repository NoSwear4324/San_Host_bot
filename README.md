# 🎮 RBX Host Bot

Discord bot for hosting Roblox mini events with different tiers.

## Event Types

| Command | Min Robux | Max Robux |
|---------|-----------|-----------|
| `-community <robux>` | 2 R$ | 25 R$ |
| `-plus <robux>` | 25 R$ | 99 R$ |
| `-super <robux>` | 100 R$ | 499 R$ |
| `-ultra <robux>` | 500 R$ | 999 R$ |
| `-ultimate <robux>` | 1000 R$ | 1999 R$ |
| `-extreme <robux>` | 2000 R$ | 4999 R$ |
| `-godly <robux>` | 5000 R$ | 10000 R$ |

## Commands

| Command | Description |
|---------|-------------|
| `-community <robux>` | Host a Community event (requires role) |
| `-plus <robux>` | Host a Plus event (requires role) |
| `-super <robux>` | Host a Super event (requires role) |
| `-ultra <robux>` | Host an Ultra event (requires role) |
| `-ultimate <robux>` | Host an Ultimate event (requires role) |
| `-extreme <robux>` | Host an Extreme event (requires role) |
| `-godly <robux>` | Host a Godly event (requires role) |
| `-status [user]` | View host statistics (requires any host role) |

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
```

## Features

- ✅ Each event type has its own channel
- ✅ Role required to host each event type
- ✅ Custom Robux range for each tier
- ✅ Host statistics saved permanently
- ✅ Error messages are ephemeral (only visible to sender)
- ✅ Status command shows events by type

## License

ISC