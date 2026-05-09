import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Home() {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [roomId, setRoomId] = useState("");

    const createRoom = () => {

        if (!username) {
            alert("Enter username");
            return;
        }
        const newRoomId = Math.random().toString(36).substring(2, 8);

        navigate(`/room/${newRoomId}`, {
            state: {
                username,
            },
        });
    };

    const joinRoom = () => {
        if (!roomId || !username) {
            alert("Enter all fields");
            return;
        }

        navigate(`/room/${roomId}`, {
            state: {
                username,
            },
        });
    };

    return (
        <div style={{ padding: "30px" }}>
            <h1>Watch Party</h1>

            <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />

            <br />
            <br />

            <button onClick={createRoom}>
                Create Room
            </button>

            <br />
            <br />

            <input
                type="text"
                placeholder="Enter room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
            />

            <button onClick={joinRoom}>
                Join Room
            </button>
        </div>
    );
}

export default Home;