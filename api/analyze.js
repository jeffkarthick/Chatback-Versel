import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { exName, chatText } = req.body || {};

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

    const cleanChat = String(chatText)
      .replace(/\r/g, "")
      .trim();

    const chatHash = crypto
      .createHash("sha256")
      .update(cleanChat)
      .digest("hex");

    const cacheKey = `chatback:free:${chatHash}`;

    // Personality profile has its own Redis key
    const personalityKey =
      `chatback:personality:${chatHash}`;

    // Check cached analysis first
    const cachedResult = await redisCommand([
      "GET",
      cacheKey
    ]);

    const cachedPersonality = await redisCommand([
      "GET",
      personalityKey
    ]);

    if (cachedResult) {
      return res.status(200).json({
        success: true,
        result: cachedResult,
        personality:
          cachedPersonality || "",
        cached: true
      });
    }

    // =========================================
    // LOCAL CHAT COMPRESSION
    // =========================================

    function smartCompressChat(text) {
      const MAX_CHARS = 10000;

      if (text.length <= MAX_CHARS) {
        return text;
      }

      let lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

      lines = lines.filter(line => {
        const lower = line.toLowerCase();

        if (
          lower.includes(
            "messages and calls are end-to-end encrypted"
          )
        ) {
          return false;
        }

        if (lower.includes("<media omitted>")) {
          return false;
        }

        if (lower.includes("image omitted")) {
          return false;
        }

        if (lower.includes("video omitted")) {
          return false;
        }

        if (lower.includes("audio omitted")) {
          return false;
        }

        if (lower.includes("sticker omitted")) {
          return false;
        }

        return true;
      });

      if (lines.length === 0) {
        return text.slice(0, MAX_CHARS);
      }

      const selected = [];

      const firstCount =
        Math.floor(lines.length * 0.30);

      const middleCount =
        Math.floor(lines.length * 0.40);

      const lastCount =
        Math.floor(lines.length * 0.30);

      for (let i = 0; i < firstCount; i++) {
        selected.push(lines[i]);
      }

      const middleStart =
        Math.floor(
          (lines.length - middleCount) / 2
        );

      for (
        let i = middleStart;
        i < middleStart + middleCount;
        i++
      ) {
        if (lines[i]) {
          selected.push(lines[i]);
        }
      }

      for (
        let i = Math.max(
          0,
          lines.length - lastCount
        );
        i < lines.length;
        i++
      ) {
        selected.push(lines[i]);
      }

      const uniqueLines = [
        ...new Set(selected)
      ];

      let result = "";

      for (const line of uniqueLines) {
        if (
          result.length +
            line.length +
            1 >
          MAX_CHARS
        ) {
          break;
        }

        result += line + "\n";
      }

      return `
[CHAT COMPRESSED LOCALLY]

The original WhatsApp chat was large.
A representative sample was selected from
the beginning, middle and end.

Do not assume missing parts.

${result}
`;
    }

    const compressedChat =
      smartCompressChat(cleanChat);

    // =========================================
    // 1. NORMAL RELATIONSHIP ANALYSIS
    // =========================================

    const analysisPrompt = `
You are CHATBACK, an AI relationship chat analyzer.

Person being analyzed:
${exName || "Unknown"}

Analyze the WhatsApp conversation below.

IMPORTANT RULES:

- Analyze only what is visible.
- Never claim to know private thoughts.
- Never say something is 100% certain.
- Use phrases like "the conversation suggests".
- Do not invent events or facts.
- Be emotionally neutral.
- Keep the answer easy to read.

Provide:

1. 💬 Relationship Summary
Give a short summary.

2. 📱 Who Initiates More
Explain who appears to start conversations more.

3. ❤️ Emotional Tone
Describe the overall emotional tone.

4. 🔥 Interest Signals
Mention visible signs of interest or engagement.

5. 🚩 Red Flags
Mention concerning communication patterns.

6. 💚 Green Flags
Mention positive communication patterns.

7. 🧠 Communication Pattern
Explain how both communicate.

8. 💯 Connection Score
Give a score from 0-100 based only on the conversation.

9. 🔍 Final Takeaway
Give a short honest conclusion.

Use headings and bullet points.

Do not make the response extremely long.

WHATSAPP CHAT:

${compressedChat}
`;

    const analysisResponse = await fetch(
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
                "You are CHATBACK. Analyze WhatsApp conversations clearly, neutrally and concisely."
            },
            {
              role: "user",
              content: analysisPrompt
            }
          ],

          temperature: 0.5,
          max_tokens: 650
        })
      }
    );

    const analysisData =
      await analysisResponse.json();

    if (!analysisResponse.ok) {
      console.error(
        "Groq Analysis Error:",
        analysisData
      );

      if (analysisResponse.status === 429) {
        return res.status(429).json({
          error:
            analysisData?.error?.message ||
            "AI rate limit reached. Please try again shortly."
        });
      }

      return res.status(
        analysisResponse.status
      ).json({
        error:
          analysisData?.error?.message ||
          "Groq analysis failed."
      });
    }

    const result =
      analysisData?.choices?.[0]?.message?.content;

    if (!result) {
      return res.status(502).json({
        error:
          "AI returned an empty analysis."
      });
    }

    // =========================================
    // 2. PERSONALITY PROFILE
    // =========================================

    /*
      IMPORTANT:
      This profile is intentionally compact.

      We do NOT save the original WhatsApp chat.
      Only this communication-style summary is saved.
    */

    const personalityPrompt = `
You are CHATBACK personality extraction AI.

Analyze the WhatsApp conversation and create a
COMPACT communication-style profile for the person:

${exName || "Unknown"}

Your job is NOT to diagnose personality.
Only describe observable communication behaviour.

Return ONLY valid JSON.

Use exactly these fields:

{
  "language": "",
  "reply_length": "",
  "tone": "",
  "emoji_style": "",
  "humour": "",
  "affection_style": "",
  "question_style": "",
  "communication_style": "",
  "common_expressions": "",
  "important_notes": ""
}

Rules:

- language: Tamil / English / Tanglish / Mixed
- reply_length: Short / Medium / Long
- tone: describe observable tone
- emoji_style: None / Low / Medium / High
- humour: Low / Medium / High
- affection_style: describe only visible behaviour
- question_style: describe how they ask questions
- communication_style: concise description
- common_expressions: only expressions actually visible
- important_notes: useful details for simulating communication
- Do not invent words.
- Do not infer hidden thoughts.
- Do not diagnose mental health or personality disorders.

WHATSAPP CHAT:

${compressedChat}
`;

    /*
      Personality extraction uses the SAME Groq request
      whenever possible? No — this is a second small request.

      It only happens ONCE for a new chat.
      The resulting profile is cached in Redis for 30 days.
    */

    const personalityResponse = await fetch(
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
                "Return only valid JSON. No markdown."
            },
            {
              role: "user",
              content: personalityPrompt
            }
          ],

          temperature: 0.2,
          max_tokens: 250
        })
      }
    );

    const personalityData =
      await personalityResponse.json();

    let personality = "";

    if (personalityResponse.ok) {
      personality =
        personalityData?.choices?.[0]
          ?.message?.content
          ?.trim() || "";
    } else {
      console.error(
        "Personality extraction error:",
        personalityData
      );
    }

    // Remove markdown JSON fences if model adds them
    personality = personality
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // =========================================
    // SAVE TO REDIS
    // =========================================

    await redisCommand([
      "SET",
      cacheKey,
      result,
      "EX",
      "2592000"
    ]);

    if (personality) {
      await redisCommand([
        "SET",
        personalityKey,
        personality,
        "EX",
        "2592000"
      ]);
    }

    return res.status(200).json({
      success: true,
      result,
      personality,
      cached: false
    });

  } catch (error) {

    console.error(
      "CHATBACK ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Server error. Please try again."
    });
  }
}