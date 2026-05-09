require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(cors());

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
        }

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

    socket.on("join_room", ({ roomId, username }) => {

        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                host: socket.id,
                participants: [],
                videoId: "dQw4w9WgXcQ",
            };
        }

        const role =
            rooms[roomId].participants.length === 0
                ? "host"
                : "participant";

        rooms[roomId].participants.push({
            socketId: socket.id,
            username,
            role,
        });

        console.log(rooms);

        io.to(roomId).emit(
            "user_joined",
            rooms[roomId].participants
        );
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