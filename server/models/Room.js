const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },
    currentVideoId: { type: String, default: "UxmIr3uBOGU" },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    participantsHistory: [{
        socketId: String,
        username: String,
        role: String,
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);
