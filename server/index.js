require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const Room = require("./models/Room");
const User = require("./models/User");

const app = express();

app.use(cors());
app.use(express.json());

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log("MongoDB connected"))
        .catch(err => console.error("MongoDB connection error:", err));
} else {
    console.log("No MONGO_URI found in .env, skipping MongoDB connection.");
}

app.post("/api/users", async (req, res) => {
    try {
        if (!process.env.MONGO_URI) return res.status(200).json({ message: "MongoDB not connected" });
        const { uid, email, displayName, photoURL } = req.body;
        let user = await User.findOne({ firebaseUid: uid });
        if (user) {
            user.lastLogin = Date.now();
            await user.save();
        } else {
            user = new User({ firebaseUid: uid, email, displayName, photoURL });
            await user.save();
        }
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

app.get("/", (req, res) => {
    res.send("Server running");
});
const rooms = {};

const removeUserFromRooms = (socketId) => {

    for (const roomId in rooms) {

        const room = rooms[roomId];

        const leavingUser =
            room.participants.find(
                (user) => user.socketId === socketId
            );

        if (!leavingUser) continue;

        if (process.env.MONGO_URI) {
            Room.findOne({ roomId }).then(roomDoc => {
                if (roomDoc) {
                    const participant = roomDoc.participantsHistory.find(p => p.socketId === socketId && !p.leftAt);
                    if (participant) {
                        participant.leftAt = Date.now();
                        roomDoc.save().catch(console.error);
                    }
                }
            }).catch(console.error);
        }

        room.participants =
            room.participants.filter(
                (user) => user.socketId !== socketId
            );

        // Transfer host
        if (
            leavingUser.role === "host" &&
            room.participants.length > 0
        ) {

            room.participants[0].role = "host";

            room.host =
                room.participants[0].socketId;
            
            io.to(roomId).emit("toast_notification", { message: `${room.participants[0].username} is the new host!`, type: "success" });
        }

        io.to(roomId).emit("toast_notification", { message: `${leavingUser.username} left the room.`, type: "warning" });
        io.to(roomId).emit(
            "user_left",
            room.participants
        );

        // Delete empty room
        if (room.participants.length === 0) {
            delete rooms[roomId];
        }
    }
};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", async ({ roomId, username }) => {

        if (!roomId || !username) {
            return socket.emit("room_error", { message: "Invalid room or username." });
        }

        // 4. Persistent Room Recovery & 5. Room Access Validation
        if (!rooms[roomId]) {
            if (process.env.MONGO_URI) {
                try {
                    const existingRoom = await Room.findOne({ roomId, status: 'active' });
                    if (existingRoom) {
                        rooms[roomId] = {
                            host: existingRoom.hostId,
                            participants: [],
                            videoId: existingRoom.currentVideoId || "dQw4w9WgXcQ",
                        };
                    } else {
                        // Creating a brand new room in memory
                        rooms[roomId] = {
                            host: socket.id,
                            participants: [],
                            videoId: "dQw4w9WgXcQ",
                        };
                    }
                } catch (err) {
                    console.error(err);
                }
            } else {
                rooms[roomId] = {
                    host: socket.id,
                    participants: [],
                    videoId: "dQw4w9WgXcQ",
                };
            }
        }

        // 6. Duplicate Username Handling
        const isDuplicate = rooms[roomId].participants.some(p => p.username === username);
        if (isDuplicate) {
            return socket.emit("room_error", { message: "Username already taken in this room." });
        }

        socket.join(roomId);



        const role =
            rooms[roomId].participants.length === 0
                ? "host"
                : "participant";

        rooms[roomId].participants.push({
            socketId: socket.id,
            username,
            role,
        });

        if (process.env.MONGO_URI) {
            Room.findOne({ roomId }).then(roomDoc => {
                if (!roomDoc) {
                    Room.create({
                        roomId,
                        hostId: rooms[roomId].host,
                        currentVideoId: "dQw4w9WgXcQ",
                        participantsHistory: [{ socketId: socket.id, username, role }]
                    }).catch(err => console.error(err));
                } else {
                    roomDoc.participantsHistory.push({ socketId: socket.id, username, role });
                    roomDoc.save().catch(err => console.error(err));
                }
            }).catch(err => console.error(err));
        }

        console.log(rooms);

        io.to(roomId).emit(
            "user_joined",
            rooms[roomId].participants
        );
        socket.to(roomId).emit("toast_notification", { message: `${username} joined the room!`, type: "success" });
        socket.emit("video_changed", {
            videoId: rooms[roomId].videoId,
        });

        if (rooms[roomId].host && rooms[roomId].host !== socket.id) {
            io.to(rooms[roomId].host).emit("request_sync_status", { targetSocketId: socket.id });
        }
    });

    socket.on("send_sync_status", ({ targetSocketId, currentTime, state }) => {
        io.to(targetSocketId).emit("sync_initial_status", { currentTime, state });
    });
    socket.on("change_video", ({ roomId, videoId }) => {

        const user =
            rooms[roomId]?.participants.find(
                (p) => p.socketId === socket.id
            );

        if (
            user?.role !== "host" &&
            user?.role !== "moderator"
        ) return;
        rooms[roomId].videoId = videoId;
        
        io.to(roomId).emit("toast_notification", { message: `${user.username} changed the video.`, type: "info" });
        io.to(roomId).emit("video_changed", {
            videoId,
        });
    });
    socket.on("play_video", ({ roomId, currentTime }) => {

        const user =
            rooms[roomId]?.participants.find(
                (p) => p.socketId === socket.id
            );

        if (
            user?.role !== "host" &&
            user?.role !== "moderator"
        ) return;
        socket.to(roomId).emit("play_video", { currentTime });
    });

    socket.on("pause_video", ({ roomId, currentTime }) => {

        const user =
            rooms[roomId]?.participants.find(
                (p) => p.socketId === socket.id
            );

        if (
            user?.role !== "host" &&
            user?.role !== "moderator"
        ) return;
        socket.to(roomId).emit("pause_video", { currentTime });
    });
    socket.on("seek_video", ({ roomId, currentTime }) => {

        const user =
            rooms[roomId]?.participants.find(
                (p) => p.socketId === socket.id
            );
        if (
            user?.role !== "host" &&
            user?.role !== "moderator"
        ) return;

        socket.to(roomId).emit("seek_video", {
            currentTime,
        });
    });

    socket.on("send_chat", ({ roomId, message }) => {
        socket.to(roomId).emit("receive_chat", message);
    });

    socket.on("send_reaction", ({ roomId, emoji, username }) => {
        io.to(roomId).emit("receive_reaction", { emoji, username, id: Math.random().toString(36).substr(2, 9) });
    });

    socket.on(
        "assign_role",
        ({ roomId, targetSocketId, newRole }) => {

            const currentUser =
                rooms[roomId]?.participants.find(
                    (p) => p.socketId === socket.id
                );

            // Only host can assign roles
            if (currentUser?.role !== "host") return;

            const targetUser =
                rooms[roomId]?.participants.find(
                    (p) => p.socketId === targetSocketId
                );

            if (!targetUser) return;

            targetUser.role = newRole;

            io.to(roomId).emit("toast_notification", { message: `${targetUser.username} is now a ${newRole}.`, type: "success" });
            io.to(roomId).emit(
                "roles_updated",
                rooms[roomId].participants
            );
        }
    );

    socket.on("transfer_host", ({ roomId, targetSocketId }) => {
        const currentUser = rooms[roomId]?.participants.find((p) => p.socketId === socket.id);
        if (currentUser?.role !== "host") return;

        const targetUser = rooms[roomId]?.participants.find((p) => p.socketId === targetSocketId);
        if (!targetUser) return;

        currentUser.role = "participant"; // Demote current host
        targetUser.role = "host";         // Promote new host
        rooms[roomId].host = targetSocketId;

        io.to(roomId).emit("toast_notification", { message: `${targetUser.username} is the new host!`, type: "success" });
        io.to(roomId).emit("roles_updated", rooms[roomId].participants);
    });

    socket.on("kick_user", ({ roomId, targetSocketId }) => {
        const currentUser = rooms[roomId]?.participants.find((p) => p.socketId === socket.id);
        if (currentUser?.role !== "host") return;

        // Notify the kicked user
        io.to(targetSocketId).emit("kicked");
        
        // Remove them from the room
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.leave(roomId);
        }
        removeUserFromRooms(targetSocketId);
    });
    socket.on("leave_room", ({ roomId }) => {

        removeUserFromRooms(socket.id);

        socket.leave(roomId);
    });

    socket.on("disconnect", () => {

        console.log("User disconnected");

        removeUserFromRooms(socket.id);
    });
});
server.listen(5000, () => {
    console.log("Server running on port 5000");
});