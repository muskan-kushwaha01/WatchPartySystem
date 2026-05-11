import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithGoogle, logOut, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        // We only check auth if Firebase is configured. If not configured, we allow guest access.
        if (import.meta.env.VITE_FIREBASE_API_KEY) {
            const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                setUser(currentUser);
                if (currentUser) {
                    setUsername(currentUser.displayName || currentUser.email.split('@')[0]);
                }
            });
            return () => unsubscribe();
        }
    }, []);

    const handleLogin = async () => {
        try {
            const loggedInUser = await signInWithGoogle();
            
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
            // Send user data to MongoDB (if configured)
            fetch(`${BACKEND_URL}/api/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uid: loggedInUser.uid,
                    email: loggedInUser.email,
                    displayName: loggedInUser.displayName,
                    photoURL: loggedInUser.photoURL
                })
            }).catch(console.error);

        } catch (error) {
            alert("Login failed");
        }
    };

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
        <div className="home-wrapper">
            <div className="glass-panel home-card">
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Watch Party</h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Sync up and watch videos together</p>

                {import.meta.env.VITE_FIREBASE_API_KEY && !user ? (
                    <div className="button-group">
                        <button onClick={handleLogin}>Sign in with Google</button>
                    </div>
                ) : (
                    <>
                        {user && (
                            <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.9rem", color: "var(--primary-hover)" }}>Hi, {user.displayName}</span>
                                <button className="outline" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={logOut}>Sign Out</button>
                            </div>
                        )}
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                type="text"
                                placeholder="Choose a display name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
            
                        <div className="form-group">
                            <label>Room ID (Optional)</label>
                            <input
                                type="text"
                                placeholder="Paste room ID to join"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                            />
                        </div>
            
                        <div className="button-group" style={{ marginTop: "32px" }}>
                            <button onClick={joinRoom}>
                                Join Existing Room
                            </button>
                
                            <button className="outline" onClick={createRoom}>
                                Create New Room
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default Home;