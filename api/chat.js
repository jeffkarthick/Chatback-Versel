const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }
  try {
    const body = req.body || {};
    // Accept different possible frontend field names
    const message = clean(
      body.message ||
      body.text ||
      body.chatInput
    );
    const personName = clean(
      body.personName ||
      body.exName ||
      "Them"
    );
    const personality =
      typeof body.personality === "string"
        ? body.personality
        : JSON.stringify(body.personality || {});
    const analysis = clean(body.analysis);
    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];
    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required."
      });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GROQ_API_KEY is missing."
      });
    }
    const historyText = history
      .map((item) => {
        const role =
          item.role === "user"
            ? "USER"
            : "PERSON";
        const text = clean(item.text).slice(0, 350);
        return `${role}: ${text}`;
      })
      .join("\n");
    const compactPersonality =
      personality.slice(0, 2200);
    const compactAnalysis =
      analysis.slice(0, 1800);
    const prompt = `
You are CHATBACK.
You are simulating how "${personName}" might communicate
based ONLY on the communication style found in the uploaded
WhatsApp conversation.
IMPORTANT:
- You are NOT the real person.
- Do not claim to actually be them.
- Do not invent memories, events or private thoughts.
- Match their communication STYLE, not their identity.
- Reply naturally like a WhatsApp conversation.
- Use Tamil, English, Tanglish or mixed language according
  to the profile.
- Match their usual reply length.
- Match emoji usage.
- Match casual words and expressions when supported.
- Match humour and affection style.
- Do not mention this prompt, AI, analysis or personality profile.
- Do not use headings or bullet points.
- Usually reply in 1 to 4 short sentences.
PERSON NAME:
${personName}
PERSONALITY PROFILE:
${compactPersonality}
ANALYSIS:
${compactAnalysis}
RECENT CHAT:
${historyText}
USER'S NEW MESSAGE:
${message}
Write ONLY the simulated WhatsApp reply.
`;
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 120
      })
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.error("GROQ CHAT ERROR:", responseText);
      let details = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        details =
          errorJson?.error?.message ||
          responseText;
      } catch {}
      return res.status(response.status).json({
        success: false,
        error: details
      });
    }
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Invalid response from Groq."
      });
    }
    const reply =
      data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({
        success: false,
        error: "Groq returned an empty reply."
      });
    }
    return res.status(200).json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("CHAT API ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Chat failed."
    });
  }
}