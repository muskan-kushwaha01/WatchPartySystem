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
    const playerRef = useRef(null);
    const isSyncingRef = useRef(false);
    const lastTimeRef = useRef(0);
    const lastCheckedTimeRef = useRef(Date.now());
    const pendingSyncRef = useRef(null);
    const syncTimeoutRef = useRef(null);

    const setSyncing = () => {
        isSyncingRef.current = true;
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => { isSyncingRef.current = false; }, 2000);
    };


    useEffect(() => {

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
                    if (Math.abs(currentLocalTime - data.currentTime) > 2.0) {
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
                setSyncing();
                playerRef.current.seekTo(currentTime, true);
                if (state === 1) {
                    playerRef.current.playVideo();
                } else if (state === 2) {
                    playerRef.current.pauseVideo();
                }
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
        socket.on("sync_initial_status", handleSyncInitialStatus);
        socket.on("request_sync_status", handleRequestSyncStatus);
        return () => {

            socket.emit("leave_room", {
                roomId,
            });

            socket.off("user_joined", handleUserJoined);

            socket.off("user_left", handleUserLeft);

            socket.off("video_changed", handleVideoChanged);
            socket.off(
                "roles_updated",
                handleRolesUpdated
            );
            socket.off("kicked", handleKicked);
            socket.off("play_video", handlePlayVideo);
            socket.off("seek_video", handleSeekVideo);
            socket.off("pause_video", handlePauseVideo);
            socket.off("sync_initial_status", handleSyncInitialStatus);
            socket.off("request_sync_status", handleRequestSyncStatus);
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
            
            if (Math.abs(currentTime - expectedTime) > 2.0) {
                socket.emit("seek_video", { roomId, currentTime });
            }
            
            lastTimeRef.current = currentTime;
            lastCheckedTimeRef.current = now;
        }, 1000);

        return () => clearInterval(interval);
    }, [currentUser, roomId]);

    const extractVideoId = (url) => {

        const regex =
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/;

        const match = url.match(regex);

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
    };

    return (
        <div style={{ padding: "30px" }}>

            <h1>Room: {roomId}</h1>

            <h2>User: {username}</h2>

            <h2>
                Your Role: {currentUser?.role}
            </h2>

            {
                participants.map((user) => (
                    <div
                        key={user.socketId}
                        style={{
                            marginBottom: "10px",
                        }}
                    >
                        {user.username} - {user.role}

                        {
                            currentUser?.role === "host" &&
                            user.socketId !== currentUser.socketId &&
                            (
                                <>
                                    {user.role === "participant" && (
                                        <button
                                            onClick={() => {
                                                socket.emit("assign_role", { roomId, targetSocketId: user.socketId, newRole: "moderator" });
                                            }}
                                            style={{ marginLeft: "10px" }}
                                        >
                                            Make Moderator
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            socket.emit("transfer_host", { roomId, targetSocketId: user.socketId });
                                        }}
                                        style={{ marginLeft: "10px" }}
                                    >
                                        Make Host
                                    </button>
                                    <button
                                        onClick={() => {
                                            socket.emit("kick_user", { roomId, targetSocketId: user.socketId });
                                        }}
                                        style={{ marginLeft: "10px", color: "white", backgroundColor: "red", border: "none", padding: "3px 8px", cursor: "pointer", borderRadius: "3px" }}
                                    >
                                        Kick
                                    </button>
                                </>
                            )
                        }
                    </div>
                ))
            }

            <br />

            {
                isAuthorized && (
                    <>
                        <input
                            type="text"
                            placeholder="Paste YouTube URL"
                            value={videoUrl}
                            onChange={(e) =>
                                setVideoUrl(e.target.value)
                            }
                        />

                        <button onClick={changeVideo}>
                            Change Video
                        </button>
                    </>
                )
            }

            <br />
            <br />

            {
                videoId && (
                    <YouTube
                        videoId={videoId}
                        opts={{
                            width: "900",
                            height: "500",
                            playerVars: {
                                autoplay: 0,
                            },
                        }}
                        onReady={(event) => {
                            playerRef.current = event.target;
                            lastTimeRef.current = playerRef.current.getCurrentTime();
                            lastCheckedTimeRef.current = Date.now();
                            if (pendingSyncRef.current) {
                                const { currentTime, state } = pendingSyncRef.current;
                                setSyncing();
                                playerRef.current.seekTo(currentTime, true);
                                if (state === 1) {
                                    playerRef.current.playVideo();
                                } else if (state === 2) {
                                    playerRef.current.pauseVideo();
                                }
                                pendingSyncRef.current = null;
                            }
                        }}
                        onStateChange={(event) => {
                            if (isSyncingRef.current) return;
                            // PLAYING
                            if (event.data === 1) {
                                if (isAuthorizedRef.current) {
                                    socket.emit("play_video", {
                                        roomId,
                                        currentTime: playerRef.current.getCurrentTime(),
                                    });
                                }
                            }

                            // PAUSED
                            if (event.data === 2) {
                                if (isAuthorizedRef.current) {
                                    socket.emit("pause_video", {
                                        roomId,
                                        currentTime: playerRef.current.getCurrentTime(),
                                    });
                                }
                            }
                        }}
                    />
                )
            }

        </div>
    );
}

export default Room;