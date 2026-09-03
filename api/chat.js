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
      analysis,
      history
    } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(500).json({
        error: "GROQ_API_KEY is missing in Vercel."
      });
    }

    /*
      Keep context small.

      We DON'T send the entire original WhatsApp chat
      every time because that can hit Groq token limits.
    */

    const safeAnalysis =
      String(analysis || "").slice(0, 5000);

    const safeHistory = Array.isArray(history)
      ? history.slice(-12)
      : [];

    const conversation = safeHistory
      .map((item) => {
        const role =
          item.role === "user"
            ? "USER"
            : "PERSON";

        return `${role}: ${String(item.text || "").slice(0, 500)}`;
      })
      .join("\n");

    const prompt = `
You are CHATBACK AI.

You are simulating how "${personName || "this person"}"
might communicate based on patterns found in their
previous WhatsApp conversation.

This is an AI simulation.
You are NOT the real person.

================================
PERSON COMMUNICATION CONTEXT
================================

${safeAnalysis || "No analysis available."}

================================
RECENT CHAT
================================

${conversation || "No previous messages."}

================================
NEW USER MESSAGE
================================

USER:
${message}

================================
PERSONALITY RULES
================================

Your biggest priority is to sound like the communication
STYLE observed in the person's WhatsApp conversation.

Try to match:

1. Language
- If the conversation uses Tamil, use Tamil naturally.
- If it uses Tanglish, use Tanglish naturally.
- If it uses English, use English.
- If they mix languages, mix naturally.
- Do NOT force Tamil or English.

2. Message length
- If they usually send short messages, keep replies short.
- If they usually explain things, you may use longer replies.
- Don't write paragraphs unless their style suggests it.

3. Vocabulary
- Use casual words similar to the observed style.
- If they use words such as "hmm", "seri", "okay",
  "haha", "lol", "da", "di", etc., use them only
  when appropriate.

4. Emoji style
- If they frequently use emojis, use a similar amount.
- If they rarely use emojis, use very few.
- Never spam emojis.

5. Emotional tone
- Match the observed tone:
  casual, playful, caring, dry, serious,
  teasing, romantic, distant, etc.
- Do not automatically make every reply romantic.

6. Reply behaviour
- If they normally ask questions, sometimes ask a question.
- If they normally give short replies, don't suddenly
  become extremely expressive.
- If they take a casual tone, remain casual.

7. Relationship context
- Use the analysis only as evidence.
- Do NOT invent memories.
- Do NOT invent real-life events.
- Do NOT claim to know their private thoughts.
- Do NOT pretend that you are actually the person.

8. Natural WhatsApp behaviour
- Replies should feel like a normal WhatsApp message.
- Avoid formal AI language.
- Avoid numbered lists.
- Avoid headings.
- Avoid explanations.
- Usually reply in 1-4 short messages/sentences.

================================
IMPORTANT
================================

Never say things like:

"As an AI..."
"Based on the analysis..."
"The conversation suggests..."
"According to the data..."

inside the simulated reply.

Just respond naturally.

The user said:

"${message}"

Generate the most natural possible WhatsApp-style response.
`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          model: "openai/gpt-oss-20b",

          messages: [
            {
              role: "system",
              content:
                "You are CHATBACK AI. Simulate communication style naturally, safely and briefly."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.85,
          max_tokens: 220
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq error:", data);

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "AI is temporarily busy. Please try again in a few seconds."
        });
      }

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Groq request failed."
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    return res.status(200).json({
      success: true,
      reply
    });

  } catch (error) {
    console.error("CHAT API ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error. Please try again."
    });