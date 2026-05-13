const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('create-room', (playerName, callback) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms.set(roomCode, {
            players: [{ id: socket.id, name: playerName }],
            gameMaster: socket.id
        });
        socket.join(roomCode);
        callback({ success: true, roomCode });
    });

    socket.on('join-room', (roomCode, playerName, callback) => {
        const room = rooms.get(roomCode);
        if (!room) return callback({ success: false, error: 'Room not found' });
        if (room.players.length >= 6) return callback({ success: false, error: 'Room full' });
        
        room.players.push({ id: socket.id, name: playerName });
        socket.join(roomCode);
        io.to(roomCode).emit('players-update', room.players.map(p => p.name));
        callback({ success: true });
    });

    socket.on('start-game', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room && room.gameMaster === socket.id) {
            io.to(roomCode).emit('game-started');
        }
    });
});

server.listen(3000, () => console.log('Server running on port 3000'));
