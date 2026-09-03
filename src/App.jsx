import { useState } from "react";
import "./App.css";
export default function App() {
  const [exName, setExName] = useState("");
  const [chatText, setChatText] = useState("");
  const [result, setResult] = useState("");
  const [personality, setPersonality] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState("home");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  // =========================
  // FILE UPLOAD
  // =========================
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Please upload a WhatsApp .txt chat file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setChatText(event.target.result || "");
      setError("");
    };
    reader.onerror = () => {
      setError("Could not read the file.");
    };
    reader.readAsText(file);
  }
  // =========================
  // ANALYZE
  // =========================
  async function analyze() {
    setError("");
    setResult("");
    const name = exName.trim();
    const chat = chatText.trim();
    if (!name) {
      setError("Please enter the person's name.");
      return;
    }
    if (!chat) {
      setError("Please upload or paste the WhatsApp chat.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exName: name,
          chatText: chat
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
          data.details ||
          "Analysis failed."
        );
      }
      setResult(data.result || "No analysis returned.");
      setPersonality(data.personality || null);
      // Start fresh chat
      setMessages([]);
      setChatInput("");
      setScreen("result");
    } catch (err) {
      console.error("ANALYZE ERROR:", err);
      setError(
        err.message ||
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }
  // =========================
  // OPEN CHAT
  // =========================
  function openChat() {
    const name = exName.trim() || "Them";
    setMessages([
      {
        role: "ai",
        text: `Hey 👋 I'm ${name}. What's on your mind?`
      }
    ]);
    setChatInput("");
    setScreen("chat");
  }
  // =========================
  // SEND CHAT MESSAGE
  // =========================
  async function sendChatMessage() {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    const userMessage = {
      role: "user",
      text: message
    };
    const updatedMessages = [
      ...messages,
      userMessage
    ];
    setMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: message,
          personName: exName.trim(),
          personality: personality,
          analysis: result,
          history: updatedMessages
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
          data.details ||
          "Chat failed."
        );
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            data.reply ||
            "I'm not sure what to say right now."
        }
      ]);
    } catch (err) {
      console.error("CHAT ERROR:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            "Sorry, AI is temporarily busy. Try again in a few seconds."
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  }
  // =========================
  // ENTER KEY
  // =========================
  function handleChatKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  }
  // =========================
  // HOME SCREEN
  // =========================
  if (screen === "home") {
    return (
      <div className="app">
        <div className="container">
          <div className="logo">
            CHAT<span>BACK</span>
          </div>
          <h1>
            Understand the chat.
            <br />
            <span>Understand them.</span>
          </h1>
          <p className="subtitle">
            Upload your WhatsApp conversation and discover
            communication patterns, emotions and connection.
          </p>
          <div className="card">
            <label className="label">
              Their name
            </label>
            <input
              className="input"
              type="text"
              placeholder="Enter their name"
              value={exName}
              onChange={(e) => setExName(e.target.value)}
            />
            <label className="label">
              WhatsApp chat
            </label>
            <label className="upload">
              <input
                type="file"
                accept=".txt"
                onChange={handleFile}
              />
              <span className="uploadIcon">
                📄
              </span>
              <span>
                {chatText
                  ? "Chat file selected ✓"
                  : "Upload WhatsApp .txt file"}
              </span>
            </label>
            {chatText && (
              <div className="fileStatus">
                {chatText.length.toLocaleString()} characters loaded
              </div>
            )}
            {error && (
              <div className="error">
                {error}
              </div>
            )}
            <button
              className="primaryButton"
              onClick={analyze}
              disabled={loading}
            >
              {loading
                ? "Analyzing..."
                : "Analyze Conversation →"}
            </button>
          </div>
          <p className="privacy">
            🔒 Your original chat is not displayed publicly.
          </p>
        </div>
      </div>
    );
  }
  // =========================
  // RESULT SCREEN
  // =========================
  if (screen === "result") {
    return (
      <div className="app">
        <div className="container resultContainer">
          <button
            className="backButton"
            onClick={() => setScreen("home")}
          >
            ← Back
          </button>
          <div className="logo">
            CHAT<span>BACK</span>
          </div>
          <div className="resultCard">
            <div className="resultTitle">
              <div className="resultAvatar">
                {(exName.trim()[0] || "?").toUpperCase()}
              </div>
              <div>
                <h2>{exName}</h2>
                <p>Conversation Analysis</p>
              </div>
            </div>
            <div className="analysis">
              {result}
            </div>
            <button
              className="chatButton"
              onClick={openChat}
            >
              💬 Chat with {exName}
            </button>
          </div>
        </div>
      </div>
    );
  }
  // =========================
  // CHAT SCREEN
  // =========================
  return (
    <div className="chatPage">
      <div className="chatHeader">
        <button
          className="chatBack"
          onClick={() => setScreen("result")}
        >
          ←
        </button>
        <div className="chatAvatar">
          {(exName.trim()[0] || "?").toUpperCase()}
        </div>
        <div className="chatPerson">
          <strong>{exName}</strong>
          <span>
            AI simulation • Not the real person
          </span>
        </div>
      </div>
      <div className="chatNotice">
        This is an AI simulation based on the communication
        style found in the uploaded chat.
      </div>
      <div className="chatMessages">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chatRow ${
              msg.role === "user"
                ? "userRow"
                : "aiRow"
            }`}
          >
            <div
              className={`chatBubble ${
                msg.role === "user"
                  ? "userBubble"
                  : "aiBubble"
              }`}
            >
              {msg.text}
              <span className="chatTime">
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="chatRow aiRow">
            <div className="chatBubble aiBubble typing">
              typing...
            </div>
          </div>
        )}
      </div>
      <div className="chatInputBar">
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder={`Message ${exName}...`}
          rows={1}
          disabled={chatLoading}
        />
        <button
          onClick={sendChatMessage}
          disabled={
            chatLoading ||
            !chatInput.trim()
          }
        >
          ➤
        </button>
      </div>
    </div>
  );
}