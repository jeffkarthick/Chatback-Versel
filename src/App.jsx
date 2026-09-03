import React, { useMemo, useState } from "react";

const DEMO_CHAT = `12/08/2026, 9:10 PM - Alex: Hey, how are you?
12/08/2026, 9:12 PM - You: I'm good. What about you?
12/08/2026, 9:13 PM - Alex: Good. I was thinking about you today.
12/08/2026, 9:15 PM - You: Really? 😊
12/08/2026, 9:16 PM - Alex: Yeah, our old conversations came to mind.`;

export default function App() {
  const [exName, setExName] = useState("");
  const [chatText, setChatText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [premium, setPremium] = useState(false);
  const [paid, setPaid] = useState(false);

  // CHAT
  const [screen, setScreen] = useState("home");
  const [messages, setMessages] = useState([]);
  const [personality, setPersonality] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const canAnalyze = useMemo(
    () =>
      exName.trim().length > 0 &&
      chatText.trim().length > 20,
    [exName, chatText]
  );

  function loadDemo() {
    setExName("Alex");
    setChatText(DEMO_CHAT);
    setResult("");
    setPersonality("");
    setError("");
    setScreen("home");
  }

  function handleFile(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setChatText(
        String(reader.result || "")
      );
    };

    reader.onerror = () => {
      setError("Could not read that file.");
    };

    reader.readAsText(file);
  }

  async function analyze(isPremium = false) {
    if (!exName.trim()) {
      return setError(
        "Enter the person's name first."
      );
    }

    if (!chatText.trim()) {
      return setError(
        "Paste or upload your WhatsApp chat."
      );
    }

    setLoading(true);
    setError("");
    setResult("");
    setPersonality("");

    try {
      const res = await fetch(
        "/api/analyze",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            exName: exName.trim(),
            chatText,
            premium: isPremium
          })
        }
      );

      const data =
        await res.json().catch(
          () => ({})
        );

      if (!res.ok) {
        throw new Error(
          data.error ||
          "Analysis failed."
        );
      }

      setResult(
        data.result ||
        "No result returned."
      );

      setPersonality(
        data.personality || ""
      );

      setPremium(isPremium);

    } catch (err) {
      setError(
        err.message ||
        "Something went wrong."
      );

    } finally {
      setLoading(false);
    }
  }

  async function unlockPremium() {
    const ok = window.confirm(
      "Premium Analysis — ₹49\n\n" +
      "This demo will unlock the premium UI without charging you.\n" +
      "Connect a payment gateway before launch."
    );

    if (!ok) return;

    setPaid(true);

    await analyze(true);
  }

  // =========================
  // OPEN CHAT
  // =========================

  function openChat() {
    const name = exName.trim();

    if (!name) return;

    setMessages([
      {
        role: "ai",
        text:
          `Hey 👋 I'm ${name}. ` +
          `What's on your mind?`
      }
    ]);

    setChatInput("");
    setError("");
    setScreen("chat");
  }

  // =========================
  // SEND CHAT
  // =========================

  async function sendChatMessage() {
    const message =
      chatInput.trim();

    if (!message || chatLoading) {
      return;
    }

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
      const res = await fetch(
        "/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            message,
            personName:
              exName.trim(),

            // Communication style
            personality,

            // Relationship analysis
            analysis: result,

            // Previous conversation
            history:
              updatedMessages
          })
        }
      );

      const data =
        await res.json().catch(
          () => ({})
        );

      if (!res.ok) {
        throw new Error(
          data.error ||
          "Chat failed."
        );
      }

      setMessages(prev => [
        ...prev,
        {
          role: "ai",
          text:
            data.reply ||
            "I'm not sure what to say right now."
        }
      ]);

    } catch (err) {
      console.error(
        "CHAT ERROR:",
        err
      );

      setMessages(prev => [
        ...prev,
        {
          role: "ai",
          text:
            "Sorry, AI is temporarily busy. " +
            "Try again in a few seconds."
        }
      ]);

    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKeyDown(e) {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();
      sendChatMessage();
    }
  }

  // =========================
  // CHAT SCREEN
  // =========================

  if (screen === "chat") {
    return (
      <main className="chatPage">

        <header className="chatHeader">

          <button
            className="chatBack"
            onClick={() =>
              setScreen("home")
            }
          >
            ←
          </button>

          <div className="chatAvatar">
            {exName
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="chatPerson">
            <strong>
              {exName}
            </strong>

            <span>
              CHATBACK AI · Simulation
            </span>
          </div>

        </header>

        <div className="chatNotice">
          ⚠️ This is an AI simulation based
          on communication patterns. It is
          not the real person.
        </div>

        <section className="chatMessages">

          {messages.map(
            (msg, index) => (
              <div
                key={index}
                className={
                  msg.role === "user"
                    ? "chatRow userRow"
                    : "chatRow aiRow"
                }
              >

                <div
                  className={
                    msg.role === "user"
                      ? "chatBubble userBubble"
                      : "chatBubble aiBubble"
                  }
                >

                  {msg.text}

                  <span className="chatTime">
                    {new Date()
                      .toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit"
                        }
                      )}
                  </span>

                </div>

              </div>
            )
          )}

          {chatLoading && (
            <div className="chatRow aiRow">

              <div className="chatBubble aiBubble typing">

                <span></span>
                <span></span>
                <span></span>

              </div>

            </div>
          )}

        </section>

        <div className="chatInputBar">

          <textarea
            value={chatInput}
            onChange={e =>
              setChatInput(
                e.target.value
              )
            }
            onKeyDown={
              handleChatKeyDown
            }
            placeholder={
              `Message ${exName}...`
            }
            rows={1}
          />

          <button
            onClick={
              sendChatMessage
            }
            disabled={
              !chatInput.trim() ||
              chatLoading
            }
          >
            ➤
          </button>

        </div>

      </main>
    );
  }

  // =========================
  // HOME SCREEN
  // =========================

  return (
    <main className="page">

      <nav className="nav">

        <div className="brand">
          <span>♥</span> CHATBACK
        </div>

        <button
          className="ghost"
          onClick={loadDemo}
        >
          Try Demo
        </button>

      </nav>

      <section className="hero">

        <div className="badge">
          AI RELATIONSHIP ANALYZER
        </div>

        <h1>
          What does your
          <br />
          <em>chat</em> really mean?
        </h1>

        <p className="sub">
          Upload your WhatsApp conversation
          and discover communication patterns,
          emotional signals and relationship
          insights.
        </p>

      </section>

      <section className="card">

        <label>
          1. WHO ARE YOU ANALYZING?
        </label>

        <input
          value={exName}
          onChange={e =>
            setExName(
              e.target.value
            )
          }
          placeholder="Enter their name"
          maxLength={80}
        />

        <label>
          2. YOUR WHATSAPP CHAT
        </label>

        <div className="upload">

          <input
            id="file"
            type="file"
            accept=".txt,text/plain"
            onChange={handleFile}
          />

          <label
            htmlFor="file"
            className="uploadButton"
          >
            Upload .txt
          </label>

          <span>
            or paste your exported
            WhatsApp chat below
          </span>

        </div>

        <textarea
          value={chatText}
          onChange={e =>
            setChatText(
              e.target.value
            )
          }
          placeholder="Paste your WhatsApp exported chat here..."
        />

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <button
          className="primary"
          disabled={
            !canAnalyze ||
            loading
          }
          onClick={() =>
            analyze(false)
          }
        >
          {loading
            ? "ANALYZING..."
            : "♥  ANALYZE FOR FREE"}
        </button>

        <p className="privacy">
          Your API key stays on the
          Vercel server. Don't upload
          sensitive information you don't
          want analyzed.
        </p>

      </section>

      {result && (
        <section className="result card">

          <div className="resultTop">

            <div>

              <div className="badge">
                CHATBACK RESULT
              </div>

              <h2>
                {premium
                  ? "Your Full Analysis"
                  : "Your Basic Analysis"}
              </h2>

            </div>

            <div className="scoreDot">
              ♥
            </div>

          </div>

          <div className="resultText">
            {result}
          </div>

          <button
            className="chatWithButton"
            onClick={openChat}
          >
            💬 Chat with{" "}
            <strong>
              {exName}
            </strong>
          </button>

          {!premium && !paid && (
            <div className="premium">

              <div>

                <div className="badge">
                  PREMIUM
                </div>

                <h3>
                  Want the full story?
                </h3>

                <p>
                  Unlock emotional investment,
                  red flags, green flags,
                  compatibility and suggested
                  replies.
                </p>

              </div>

              <button
                className="premiumButton"
                onClick={
                  unlockPremium
                }
              >
                Unlock — ₹49
              </button>

            </div>
          )}

        </section>
      )}

      <footer>
        CHATBACK · AI-generated insights
        are patterns, not certainty.
      </footer>

    </main>
  );
}