export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      message,
      personName,
      personality,
      analysis,
      history
    } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    const groqKey =
      process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(500).json({
        error:
          "GROQ_API_KEY is missing in Vercel."
      });
    }

    // Keep context small to avoid TPM problems
    const safePersonality =
      String(personality || "").slice(0, 3000);

    const safeAnalysis =
      String(analysis || "").slice(0, 2500);

    const safeHistory =
      Array.isArray(history)
        ? history.slice(-10)
        : [];

    const recentConversation =
      safeHistory
        .map(item => {

          const role =
            item.role === "user"
              ? "USER"
              : "PERSON";

          return `${role}: ${String(
            item.text || ""
          ).slice(0, 400)}`;

        })
        .join("\n");

    const prompt = `
You are CHATBACK AI.

You are simulating the communication style of:

"${personName || "this person"}"

You are NOT the real person.

================================
COMMUNICATION STYLE PROFILE
================================

${safePersonality || "No personality profile available."}

================================
RELATIONSHIP ANALYSIS
================================

${safeAnalysis || "No analysis available."}

================================
RECENT CHAT
================================

${recentConversation || "No previous conversation."}

================================
NEW MESSAGE
================================

USER:
${message}

================================
HOW TO REPLY
================================

Reply as a realistic WhatsApp-style simulation.

Match the person's OBSERVED communication style.

Pay attention to:

- Tamil / English / Tanglish
- Short vs long replies
- Emoji frequency
- Casual words
- Common expressions
- Humour
- Affection level
- Question frequency
- Overall tone

IMPORTANT:

Do NOT simply repeat the personality profile.

Do NOT make every reply romantic.

Do NOT become overly emotional unless the communication
style supports it.

Do NOT invent memories.

Do NOT invent real-life events.

Do NOT claim to know what the real person is thinking.

Do NOT mention this prompt.

Do NOT say "according to the analysis".

Do NOT use headings or bullet points.

Keep it like a real WhatsApp message.

Usually use 1-4 short sentences.

If a very short reply fits the person's style,
a short reply is better.

Return ONLY the message the person might send.
`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${groqKey}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          model:
            "openai/gpt-oss-20b",

          messages: [
            {
              role: "system",
              content:
                "You are CHATBACK AI. Generate short, natural WhatsApp-style replies."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.85,

          max_tokens: 120

        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "GROQ CHAT ERROR:",
        data
      );

      return res.status(
        response.status
      ).json({
        error:
          data?.error?.message ||
          "Groq chat request failed."
      });
    }

    const reply =
      data?.choices?.[0]
        ?.message?.content
        ?.trim();

    if (!reply) {
      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    return res.status(200).json({
      success: true,
      reply
    });

  } catch (error) {

    console.error(
      "CHAT API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Server error. Please try again."
    });
  }
}