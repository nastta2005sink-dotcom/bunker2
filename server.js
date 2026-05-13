const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const rooms = new Map();

// ВСЕ КАРТЫ ПЕРСОНАЖЕЙ
const FULL_DECK = [
    { category: "NATIVE", name: "Aliaksandr, tractor driver", roots: "Born near Minsk", skill: "Fixes any tractor", phrase: "Draniki for life!" },
    { category: "NATIVE", name: "Hanna, beekeeper", roots: "Grandfather was Count's forester", skill: "Healing honey", phrase: "Where there's honey, there's life" },
    { category: "NATIVE", name: "Volha, shop assistant", roots: "Grandma at Komarowski Market", skill: "Gets any item", phrase: "No queue for true Belarusians" },
    { category: "NATIVE", name: "Mikhas, potato breeder", roots: "Created Krynitsa-2020", skill: "Grows potatoes on concrete", phrase: "Potato is our mother!" },
    { category: "NATIVE", name: "Vera, librarian", roots: "Great-grandfather friends with Yanka Kupala", skill: "Recites classic poems", phrase: "Read Kupala? True Belarusian!" },
    { category: "HOLLYWOOD", name: "Harrison Ford", roots: "Grandparents from MINSK", skill: "Flies planes, uses whip", phrase: "Crystal Skull near Minsk!" },
    { category: "HOLLYWOOD", name: "Scarlett Johansson", roots: "Great-grandfather from NESVIZH", skill: "Spy skills", phrase: "Belarusian Black Widow" },
    { category: "HOLLYWOOD", name: "Kirk Douglas", roots: "Born in CHAUSY, Mogilev", skill: "Spartacus charisma", phrase: "Spartacus from Mogilev!" },
    { category: "HOLLYWOOD", name: "Ralph Lauren", roots: "Father from PINSK, mother from GRODNO", skill: "Sews clothes", phrase: "Polo means field" },
    { category: "HOLLYWOOD", name: "Lisa Kudrow", roots: "Ancestors from ILYA village", skill: "Sings, reads potato peels", phrase: "Grandma taught me to survive" },
    { category: "IMPOSTOR", name: "Tom Cruise", roots: "NO Belarusian roots!", skill: "Runs up walls", phrase: "I jumped over Minsk! In simulator" },
    { category: "IMPOSTOR", name: "Angelina Jolie", roots: "NO roots!", skill: "Adopts things", phrase: "I adopted a Belarusian potato" },
    { category: "IMPOSTOR", name: "Leonardo DiCaprio", roots: "NO roots!", skill: "Fake accent", phrase: "I filmed The Revenant in Belarus?" },
    { category: "IMPOSTOR", name: "Brad Pitt", roots: "NO roots!", skill: "Handsome face", phrase: "Blonde, high cheekbones - Belarusian!" },
    { category: "COMIC", name: "Dzmitry, TikTok blogger", roots: "Thinks he's Belarusian", skill: "Makes viral videos", phrase: "Subscribe for survival tips" },
    { category: "COMIC", name: "Talking potato", roots: "It IS a potato", skill: "Can be eaten", phrase: "Don't eat me, I can still grow!" },
    { category: "COMIC", name: "John from Ohio", roots: "I have a friend from Minsk!", skill: "Teaches baseball", phrase: "Belarus? Near Russia?" }
];

const CRISES = [
    "🥔 The salt for pickling lard has run out!",
    "🐀 A giant rodent is chewing through the potato supply!",
    "🥬 Someone stole the secret jar of fermented cabbage!",
    "☢️ Radiation leak detected – only potato peels for protection!",
    "🚰 The water filter broke. All you have is potato juice!",
    "🔥 A fire started in the generator room!",
    "🧟 Neighbors from the next bunker are begging for potatoes!"
];

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // CREATE ROOM
    socket.on('create-room', (playerName, callback) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms.set(roomCode, {
            players: [{ id: socket.id, name: playerName, card: null, votedFor: null }],
            gameMaster: socket.id,
            gameStarted: false,
            phase: "waiting",
            votes: {},
            crisis: null
        });
        socket.join(roomCode);
        callback({ success: true, roomCode });
        io.to(roomCode).emit('players-update', rooms.get(roomCode).players.map(p => p.name));
    });

    // JOIN ROOM
    socket.on('join-room', (roomCode, playerName, callback) => {
        const room = rooms.get(roomCode);
        if (!room) return callback({ success: false, error: 'Room not found' });
        if (room.gameStarted) return callback({ success: false, error: 'Game already started' });
        if (room.players.length >= 6) return callback({ success: false, error: 'Room is full' });
        if (room.players.find(p => p.name === playerName)) return callback({ success: false, error: 'Name taken' });
        
        room.players.push({ id: socket.id, name: playerName, card: null, votedFor: null });
        socket.join(roomCode);
        io.to(roomCode).emit('players-update', room.players.map(p => p.name));
        callback({ success: true });
    });

    // START GAME
    socket.on('start-game', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room || room.gameMaster !== socket.id) return;
        if (room.gameStarted) return;
        
        // Shuffle deck and assign random cards
        let shuffled = [...FULL_DECK];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        room.players.forEach((player, idx) => {
            player.card = shuffled[idx % shuffled.length];
            io.to(player.id).emit('your-card', player.card);
        });
        
        room.gameStarted = true;
        room.phase = "identity";
        room.crisis = CRISES[Math.floor(Math.random() * CRISES.length)];
        
        io.to(roomCode).emit('game-started', room.players.map(p => p.name), room.crisis);
    });

    // NEXT PHASE
    socket.on('next-phase', (roomCode, nextPhase) => {
        const room = rooms.get(roomCode);
        if (!room || room.gameMaster !== socket.id) return;
        
        room.phase = nextPhase;
        io.to(roomCode).emit('phase-change', nextPhase);
        
        if (nextPhase === 'crisis') {
            io.to(roomCode).emit('crisis-announce', room.crisis);
        }
    });

    // VOTE
    socket.on('vote', (roomCode, targetName) => {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'voting') return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player && !room.votes[player.name]) {
            room.votes[player.name] = targetName;
            io.to(roomCode).emit('vote-cast', player.name, targetName);
            
            // Check if all players have voted
            if (Object.keys(room.votes).length === room.players.length) {
                // Count votes
                const counts = {};
                for (let vote of Object.values(room.votes)) {
                    counts[vote] = (counts[vote] || 0) + 1;
                }
                let eliminated = null;
                let maxVotes = -1;
                for (let [player, count] of Object.entries(counts)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        eliminated = player;
                    }
                }
                
                const eliminatedPlayer = room.players.find(p => p.name === eliminated);
                io.to(roomCode).emit('vote-result', eliminated, eliminatedPlayer ? eliminatedPlayer.card : null);
                room.phase = "ended";
            }
        }
    });

    // GET PLAYERS LIST
    socket.on('get-players', (roomCode, callback) => {
        const room = rooms.get(roomCode);
        if (room) {
            callback(room.players.map(p => p.name));
        } else {
            callback([]);
        }
    });

    // CHAT MESSAGE
    socket.on('chat-message', (roomCode, name, message) => {
        io.to(roomCode).emit('chat-message', name, message);
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        for (let [code, room] of rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                if (room.players.length === 0) {
                    rooms.delete(code);
                } else {
                    io.to(code).emit('players-update', room.players.map(p => p.name));
                }
                break;
            }
        }
        console.log('Player disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
