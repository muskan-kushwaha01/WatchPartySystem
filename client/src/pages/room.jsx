import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import YouTube from "react-youtube";
import socket from "../socket";

function Room() {

    const { roomId } = useParams();

    const location = useLocation();
    const navigate = useNavigate();

    const username = location.state?.username;

    useEffect(() => {
        if (!username) {
            alert("Please enter a username to join.");
            navigate("/");
        }
    }, [username, navigate]);


    const [participants, setParticipants] = useState([]);

    const [videoUrl, setVideoUrl] = useState("");
    const [videoId, setVideoId] = useState("");
    const [chatMessages, setChatMessages] = useState([]);
    const [reactions, setReactions] = useState([]);
    const [messageInput, setMessageInput] = useState("");
    const [notification, setNotification] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const chatEndRef = useRef(null);

    const playerRef = useRef(null);
    const isSyncingRef = useRef(false);
    const lastTimeRef = useRef(0);
    const lastCheckedTimeRef = useRef(Date.now());
    const pendingSyncRef = useRef(null);
    const lastSyncRef = useRef(null);     // Survives player recreation
    const pendingPauseRef = useRef(false); // Event-driven pause after frame render
    const syncTimeoutRef = useRef(null);
    const isMountedRef = useRef(true);    // Stop stale callbacks after unmount

    const setSyncing = () => {
        isSyncingRef.current = true;
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => { isSyncingRef.current = false; }, 1500);
    };

    // Apply a sync payload to the player.
    // For paused state, sets pendingPauseRef so onStateChange pauses as soon as the frame renders.
    // Also updates lastTimeRef so the drift-detection interval doesn't emit a bogus seek.
    const applySyncToPlayer = (player, currentTime, state) => {
        if (!player || !isMountedRef.current) return;
        lastSyncRef.current = { currentTime, state };
        // Reset drift tracking to the synced position so the interval doesn't false-trigger
        if (currentTime != null && !isNaN(currentTime)) {
            lastTimeRef.current = currentTime;
        }
        lastCheckedTimeRef.current = Date.now();
        setSyncing();
        if (currentTime != null && !isNaN(currentTime) && currentTime > 0) {
            player.seekTo(currentTime, true);
        }
        if (state === 1) {
            player.playVideo();
        } else {
            // Paused: signal onStateChange to pause as soon as the frame is actually rendered.
            // This is event-driven and avoids the arbitrary-timeout blank-screen bug.
            pendingPauseRef.current = true;
            player.playVideo();
        }
    };

    // Snap a participant back to the correct host-controlled position.
    // Called when a participant tries to play, pause, or seek without authorization.
    const revertParticipantToCorrectState = () => {
        if (!playerRef.current || !isMountedRef.current) return;
        const lastState = lastSyncRef.current?.state ?? 2;
        const elapsed = lastState === 1 ? (Date.now() - lastCheckedTimeRef.current) / 1000 : 0;
        const expectedTime = Math.max(0, lastTimeRef.current + elapsed);
        setSyncing();
        if (expectedTime > 0) {
            playerRef.current.seekTo(expectedTime, true);
        }
        if (lastState === 1) {
            playerRef.current.playVideo();
        } else {
            playerRef.current.pauseVideo();
        }
    };

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        if (chatMessages.length > 0) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [chatMessages]);


    useEffect(() => {

        isMountedRef.current = true;

        socket.emit("join_room", {
            roomId,
            username,
        });

        const handleUserJoined = (users) => {
            setParticipants(users);
        };

        const handleUserLeft = (users) => {
            setParticipants(users);
        };
        const handlePlayVideo = (data) => {
            if (playerRef.current) {
                setSyncing();

                if (data && data.currentTime !== undefined) {
                    const currentLocalTime = playerRef.current.getCurrentTime();
                    if (Math.abs(currentLocalTime - data.currentTime) > 1.0) {
                        playerRef.current.seekTo(data.currentTime, true);
                    }
                }

                playerRef.current.playVideo();
            }
        };

        const handlePauseVideo = (data) => {
            if (playerRef.current) {
                setSyncing();
                playerRef.current.pauseVideo();
            }
        };
        const handleVideoChanged = ({ videoId }) => {
            setVideoId(videoId);
        };
        const handleSeekVideo = ({ currentTime }) => {
            if (playerRef.current) {
                setSyncing();
                playerRef.current.seekTo(currentTime, true);
            }
        };

        const handleSyncInitialStatus = ({ currentTime, state }) => {
            if (playerRef.current) {
                setTimeout(() => {
                    if (!isMountedRef.current || !playerRef.current) return;
                    applySyncToPlayer(playerRef.current, currentTime, state);
                }, 500);
            } else {
                pendingSyncRef.current = { currentTime, state };
            }
        };

        const handleRequestSyncStatus = ({ targetSocketId }) => {
            if (playerRef.current) {
                socket.emit("send_sync_status", {
                    roomId,
                    targetSocketId,
                    currentTime: playerRef.current.getCurrentTime(),
                    state: playerRef.current.getPlayerState(),
                });
            }
        };
        const handleRolesUpdated = (users) => {
            setParticipants(users);
        };
        const handleKicked = () => {
            alert("You have been kicked from the room by the host.");
            navigate("/");
        };
        const handleToastNotification = ({ message, type, targetUsername, personalMessage }) => {
            let displayMessage = message;
            if (targetUsername && targetUsername === username && personalMessage) {
                displayMessage = personalMessage;
            }
            const id = Date.now();
            setNotification({ message: displayMessage, type: type || 'info', id });
            setTimeout(() => {
                setNotification(prev => (prev?.id === id ? null : prev));
            }, 3000);
        };
        const handleRoomError = ({ message }) => {
            alert(message);
            navigate("/");
        };
        const handleReceiveChat = (msg) => {
            setChatMessages(prev => [...prev, { ...msg, self: false }]);
        };
        const handleChatHistory = (history) => {
            const processedHistory = history.map(msg => ({
                ...msg,
                self: msg.author === username
            }));
            setChatMessages(processedHistory);
        };
        const handleReceiveReaction = (reaction) => {
            const leftPosition = Math.floor(Math.random() * 80) + 10;
            setReactions(prev => [...prev, { ...reaction, left: `${leftPosition}%` }]);
            setTimeout(() => {
                setReactions(prev => prev.filter(r => r.id !== reaction.id));
            }, 3000);
        };

        socket.on("seek_video", handleSeekVideo);
        socket.on("play_video", handlePlayVideo);

        socket.on("pause_video", handlePauseVideo);
        socket.on("user_joined", handleUserJoined);

        socket.on("user_left", handleUserLeft);

        socket.on("video_changed", handleVideoChanged);
        socket.on(
            "roles_updated",
            handleRolesUpdated
        );
        socket.on("kicked", handleKicked);
        socket.on("toast_notification", handleToastNotification);
        socket.on("room_error", handleRoomError);
        socket.on("sync_initial_status", handleSyncInitialStatus);
        socket.on("request_sync_status", handleRequestSyncStatus);
        socket.on("receive_chat", handleReceiveChat);
        socket.on("chat_history", handleChatHistory);
        socket.on("receive_reaction", handleReceiveReaction);

        return () => {
            isMountedRef.current = false; // Stop all pending async callbacks
            playerRef.current = null;     // Prevent any stale YouTube API calls
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

            socket.emit("leave_room", {
                roomId,
            });

            socket.off("user_joined", handleUserJoined);
            socket.off("user_left", handleUserLeft);
            socket.off("video_changed", handleVideoChanged);
            socket.off("roles_updated", handleRolesUpdated);
            socket.off("kicked", handleKicked);
            socket.off("toast_notification", handleToastNotification);
            socket.off("room_error", handleRoomError);
            socket.off("play_video", handlePlayVideo);
            socket.off("seek_video", handleSeekVideo);
            socket.off("pause_video", handlePauseVideo);
            socket.off("sync_initial_status", handleSyncInitialStatus);
            socket.off("request_sync_status", handleRequestSyncStatus);
            socket.off("receive_chat", handleReceiveChat);
            socket.off("chat_history", handleChatHistory);
            socket.off("receive_reaction", handleReceiveReaction);
        };

    }, []);

    const currentUser = participants.find(
        (user) => user.username === username
    );

    const isAuthorized = currentUser?.role === "host" || currentUser?.role === "moderator";

    const isAuthorizedRef = useRef(isAuthorized);
    useEffect(() => {
        isAuthorizedRef.current = isAuthorized;
    }, [isAuthorized]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!playerRef.current || !currentUser) return;

            if (!isAuthorizedRef.current || isSyncingRef.current) {
                if (playerRef.current) {
                    lastTimeRef.current = playerRef.current.getCurrentTime();
                    lastCheckedTimeRef.current = Date.now();
                }
                return;
            }

            const now = Date.now();
            const elapsedSeconds = (now - lastCheckedTimeRef.current) / 1000;
            const currentTime = playerRef.current.getCurrentTime();

            let expectedTime = lastTimeRef.current;
            if (playerRef.current.getPlayerState() === 1) {
                expectedTime += elapsedSeconds;
            }

            if (Math.abs(currentTime - expectedTime) > 1.0) {
                socket.emit("seek_video", { roomId, currentTime });
            }

            lastTimeRef.current = currentTime;
            lastCheckedTimeRef.current = now;
        }, 500);

        return () => clearInterval(interval);
    }, [currentUser, roomId]);

    const extractVideoId = (url) => {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/gi;
        const match = regex.exec(url);
        return match ? match[1] : "";
    };

    const changeVideo = () => {

        const extractedVideoId =
            extractVideoId(videoUrl);

        if (!extractedVideoId) return;

        socket.emit("change_video", {
            roomId,
            videoId: extractedVideoId,
        });

        setVideoUrl("");
        setIsModalOpen(false);
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (!messageInput.trim()) return;

        const msg = {
            author: username,
            text: messageInput,
            timestamp: Date.now()
        };

        setChatMessages(prev => [...prev, { ...msg, self: true }]);
        socket.emit("send_chat", { roomId, message: msg });
        setMessageInput("");
    };

    const sendReaction = (emoji) => {
        socket.emit("send_reaction", { roomId, emoji, username });
    };

    return (
        <>
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 style={{ marginBottom: "20px" }}>Change Video</h2>
                        <div className="form-group">
                            <label>YouTube Video URL</label>
                            <input
                                type="url"
                                placeholder="Paste a link or Shorts URL here..."
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div style={{ display: "flex", gap: "12px", marginTop: "32px", justifyContent: "flex-end" }}>
                            <button className="outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                            <button onClick={changeVideo}>Update Video</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="room-container">
                <div className="room-header">
                    <h2 style={{ margin: 0 }}>WatchParty <span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>| Room: {roomId}</span></h2>
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                        {isAuthorized && (
                            <button className="small outline" onClick={() => setIsModalOpen(true)}>Change Video</button>
                        )}
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}><strong>{username}</strong></span>
                        {currentUser && <span className={`role-badge ${currentUser.role}`}>{currentUser.role}</span>}
                    </div>
                </div>

                <div className="room-layout">
                    {notification && (
                        <div className={`top-notification ${notification.type}`}>
                            {notification.message}
                        </div>
                    )}

                    <div className="video-section">
                        <div className="video-wrapper">
                            <div className="reactions-container">
                                {reactions.map(r => (
                                    <div key={r.id} className="floating-emoji" style={{ left: r.left }}>
                                        {r.emoji}
                                    </div>
                                ))}
                            </div>
                            {videoId ? (
                                <div style={{ width: '100%', height: '100%' }}>
                                    <YouTube
                                        videoId={videoId}
                                        opts={{
                                            width: "100%",
                                            height: "100%",
                                            playerVars: {
                                                autoplay: 0,
                                                enablejsapi: 1,
                                                // NOTE: disablekb intentionally removed.
                                                // Changing it based on isAuthorized would destroy
                                                // and recreate the player, wiping all sync state.
                                                // Interaction is restricted via pointerEvents on the wrapper.
                                                origin: window.location.origin,
                                            },
                                        }}
                                        onReady={(event) => {
                                            playerRef.current = event.target;
                                            lastTimeRef.current = 0;
                                            lastCheckedTimeRef.current = Date.now();
                                            // pendingSyncRef: sync arrived before onReady
                                            // lastSyncRef: player was recreated, reapply last known sync
                                            const syncToApply = pendingSyncRef.current || lastSyncRef.current;
                                            if (syncToApply) {
                                                const { currentTime, state } = syncToApply;
                                                pendingSyncRef.current = null;
                                                setTimeout(() => {
                                                    if (!isMountedRef.current || !playerRef.current) return;
                                                    applySyncToPlayer(playerRef.current, currentTime, state);
                                                }, 500);
                                            }
                                        }}
                                        onStateChange={(event) => {
                                            // 1. Event-driven pause: fires when YouTube renders the buffered frame
                                            if (event.data === 1 && pendingPauseRef.current) {
                                                pendingPauseRef.current = false;
                                                playerRef.current.pauseVideo();
                                                return;
                                            }
                                            // 2. Ignore state changes triggered by our own sync commands
                                            if (isSyncingRef.current) return;
                                            // 3. Authorized users (host/mod): broadcast their actions to the room
                                            if (isAuthorizedRef.current) {
                                                if (event.data === 1) {
                                                    socket.emit("play_video", { roomId, currentTime: playerRef.current.getCurrentTime() });
                                                }
                                                if (event.data === 2) {
                                                    socket.emit("pause_video", { roomId, currentTime: playerRef.current.getCurrentTime() });
                                                }
                                                return;
                                            }
                                            // 4. Participants: instantly revert unauthorized play (1) or pause (2).
                                            //    data=3 (buffering) is NOT reverted here — it resolves to 1 or 2
                                            //    which are caught above. Volume/captions/settings don't fire
                                            //    onStateChange at all, so they are always freely allowed.
                                            if (event.data === 1 || event.data === 2) {
                                                revertParticipantToCorrectState();
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-muted)" }}>
                                    {isAuthorized ? "Paste a video URL to start" : "Waiting for host to start a video..."}
                                </div>
                            )}
                        </div>

                        <div className="reaction-bar">
                            {['👍', '❤️', '😂', '😮', '😢', '🔥', '👏'].map(emoji => (
                                <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)}>
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sidebar">
                        <div className="participants-card">
                            <h3 style={{ fontSize: "1.1rem", marginBottom: "16px" }}>Participants ({participants.length})</h3>
                            {participants.map((user) => (
                                <div className="participant-item" key={user.socketId}>
                                    <div className="participant-info">
                                        <span>{user.username} {user.username === username ? "(You)" : ""}</span>
                                        {user.role !== 'participant' && <span className={`role-badge ${user.role}`}>{user.role}</span>}
                                    </div>
                                    {currentUser?.role === "host" && user.socketId !== currentUser.socketId && (
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            {user.role === "participant" && (
                                                <button className="outline small" onClick={() => socket.emit("assign_role", { roomId, targetSocketId: user.socketId, newRole: "moderator" })}>Mod</button>
                                            )}
                                            {user.role === "moderator" && (
                                                <button className="outline small" onClick={() => socket.emit("assign_role", { roomId, targetSocketId: user.socketId, newRole: "participant" })}>Participant</button>
                                            )}
                                            <button className="outline small" onClick={() => socket.emit("transfer_host", { roomId, targetSocketId: user.socketId })}>Host</button>
                                            <button className="danger small" onClick={() => socket.emit("kick_user", { roomId, targetSocketId: user.socketId })}>Kick</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="chat-card">
                            <div className="chat-messages">
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`chat-message ${msg.self ? 'self' : ''} ${msg.isSystem ? 'system-message ' + (msg.type || '') : ''}`}>
                                        {!msg.self && !msg.isSystem && <div className="chat-author">{msg.author}</div>}
                                        <div className="bubble">{msg.text}</div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <form className="chat-input-wrapper" onSubmit={sendMessage}>
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                />
                                <button type="submit">Send</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Room;