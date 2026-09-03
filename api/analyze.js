import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { exName, chatText, premium = false } = req.body || {};

    // --------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------

    if (!chatText || String(chatText).trim().length < 20) {
      return res.status(400).json({
        error: "Please provide a WhatsApp chat."
      });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!groqKey) {
      return res.status(500).json({
        error: "GROQ_API_KEY is missing in Vercel."
      });
    }

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        error: "Upstash Redis environment variables are missing."
      });
    }

    // --------------------------------------------------
    // REDIS HELPERS
    // --------------------------------------------------

    async function redisCommand(command) {
      const response = await fetch(redisUrl, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(command)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Redis request failed."
        );
      }

      return data?.result;
    }

    // --------------------------------------------------
    // CREATE UNIQUE HASH FOR CHAT
    // --------------------------------------------------

    const cleanChat = String(chatText).trim();

    const chatHash = crypto
      .createHash("sha256")
      .update(cleanChat)
      .digest("hex");

    const cacheKey = `chatback:${chatHash}:${premium ? "premium" : "free"}`;

    // --------------------------------------------------
    // CHECK CACHE
    // --------------------------------------------------

    const savedResult = await redisCommand([
      "GET",
      cacheKey
    ]);

    if (savedResult) {
      return res.status(200).json({
        success: true,
        result: savedResult,
        cached: true
      });
    }

    // --------------------------------------------------
    // GROQ FUNCTION
    // --------------------------------------------------

    async function askGroq(prompt, maxTokens = 500) {
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
                  "You are CHATBACK, a concise WhatsApp relationship chat analyzer. Analyze only the provided text. Never claim certainty about private feelings."
              },
              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.5,
            max_tokens: maxTokens
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Groq error:", data);

        throw new Error(
          data?.error?.message ||
            "Groq request failed."
        );
      }

      return (
        data?.choices?.[0]?.message?.content || ""
      );
    }

    // --------------------------------------------------
    // SPLIT CHAT
    // --------------------------------------------------

    // Small chunks so we stay safely under 8K TPM.
    const CHUNK_SIZE = 2200;

    const chunks = [];

    for (
      let i = 0;
      i < cleanChat.length;
      i += CHUNK_SIZE
    ) {
      chunks.push(
        cleanChat.slice(i, i + CHUNK_SIZE)
      );
    }

    // Maximum chunks per request.
    // This protects Vercel from extremely large chats.
    const MAX_CHUNKS = 8;

    let selectedChunks = chunks.slice(
      0,
      MAX_CHUNKS
    );

    // If chat is very large, select parts from
    // beginning, middle and end instead of only
    // taking the beginning.
    if (chunks.length > MAX_CHUNKS) {
      const indexes = [];

      for (let i = 0; i < MAX_CHUNKS; i++) {
        const index = Math.floor(
          (i * (chunks.length - 1)) /
            (MAX_CHUNKS - 1)
        );

        indexes.push(index);
      }

      selectedChunks = indexes.map(
        (index) => chunks[index]
      );
    }

    // --------------------------------------------------
    // ANALYZE EACH CHUNK
    // --------------------------------------------------

    const analyses = [];

    for (
      let i = 0;
      i < selectedChunks.length;
      i++
    ) {
      const chunk = selectedChunks[i];

      const prompt = `
Analyze PART ${i + 1} of a WhatsApp conversation.

Person being analyzed:
${exName || "Unknown"}

Find only observable patterns from this part:

- Who starts conversations
- Who replies more
- Emotional tone
- Interest signals
- Affection signals
- Distance or avoidance
- Positive communication signals
- Negative communication signals

Do not make a final relationship conclusion.

Be very concise.

PART ${i + 1}:

${chunk}
`;

      const analysis = await askGroq(
        prompt,
        400
      );

      if (analysis) {
        analyses.push(
          `PART ${i + 1}:\n${analysis}`
        );
      }
    }

    if (analyses.length === 0) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    // --------------------------------------------------
    // FINAL COMBINATION
    // --------------------------------------------------

    const combined = analyses.join("\n\n");

    const finalPrompt = `
You are CHATBACK.

Create the final relationship analysis using
the chat-part analyses below.

Person being analyzed:
${exName || "Unknown"}

IMPORTANT:

- Never claim to know someone's private thoughts.
- Say "the conversation suggests" instead of making certain claims.
- Do not invent facts.
- If evidence is insufficient, say so.
- Keep the answer clear and useful.

Provide:

1. Relationship Summary
2. Who appears to initiate more
3. Emotional Tone
4. Main Communication Pattern
5. Overall Connection Score /100

${
  premium
    ? `
6. Who appears more emotionally invested and why
7. Attachment Indicators
8. Red Flags
9. Green Flags
10. Communication Compatibility
11. Detailed Relationship Insight
12. Suggested Next Reply
13. Final Takeaway
`
    : ""
}

Use headings and bullet points.

CHAT PART ANALYSES:

${combined.slice(0, 9000)}
`;

    const finalResult = await askGroq(
      finalPrompt,
      premium ? 1500 : 700
    );

    if (!finalResult) {
      return res.status(502).json({
        error: "AI returned an empty final response."
      });
    }

    // --------------------------------------------------
    // SAVE FINAL RESULT
    // --------------------------------------------------

    // Save for 30 days.
    // Same chat = no new Groq analysis.
    await redisCommand([
      "SET",
      cacheKey,
      finalResult,
      "EX",
      "2592000"
    ]);

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      result: finalResult,
      cached: false,
      chunksAnalyzed: selectedChunks.length,
      totalChunks: chunks.length
    });

  } catch (error) {
    console.error("CHATBACK ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error. Please try again."
    });
  }
}