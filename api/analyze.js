import crypto from "crypto";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compressChat(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.includes("<Media omitted>"))
    .filter(line => !line.includes("Messages and calls are end-to-end encrypted"));

  const joined = lines.join("\n");

  if (joined.length <= 7000) {
    return joined;
  }

  const first = joined.slice(0, 2500);
  const middleStart = Math.floor(joined.length / 2) - 1250;
  const middle = joined.slice(Math.max(0, middleStart), middleStart + 2500);
  const last = joined.slice(-2000);

  return `${first}\n\n[...middle...]\n\n${middle}\n\n[...recent...]\n\n${last}`;
}

async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Upstash environment variables are missing.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis error: ${text}`);
  }

  return response.json();
}

function extractJSON(text) {
  let cleaned = text.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("AI returned invalid JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
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

    // Accept both names to avoid frontend/API mismatch
    const exName = cleanText(body.exName || body.personName || "Unknown");
    const chatText = cleanText(body.chatText || body.message || "");

    if (!chatText) {
      return res.status(400).json({
        success: false,
        error: "Chat text is required."
      });
    }

    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(500).json({
        success: false,
        error: "GROQ_API_KEY is missing."
      });
    }

    const compressedChat = compressChat(chatText);

    const chatHash = crypto
      .createHash("sha256")
      .update(chatText)
      .digest("hex");

    const analysisKey = `chatback:analysis:${chatHash}`;
    const personalityKey = `chatback:personality:${chatHash}`;

    // Check cache
    try {
      const cachedAnalysis = await redisCommand([
        "GET",
        analysisKey
      ]);

      const cachedPersonality = await redisCommand([
        "GET",
        personalityKey
      ]);

      if (
        cachedAnalysis?.result &&
        cachedPersonality?.result
      ) {
        let personality = cachedPersonality.result;

        try {
          personality = JSON.parse(personality);
        } catch {
          // Keep as string
        }

        return res.status(200).json({
          success: true,
          result: cachedAnalysis.result,
          personality,
          cached: true
        });
      }
    } catch (cacheError) {
      console.log("CACHE READ ERROR:", cacheError.message);
    }

    const prompt = `
You are CHATBACK, a WhatsApp relationship chat analyzer.

The user wants to understand the communication style of "${exName}".

Analyze ONLY the provided WhatsApp chat.
Do not invent facts.
Do not diagnose mental health conditions.
Do not claim to know private thoughts.

Return ONLY valid JSON.

Required format:

{
  "analysis": "relationship analysis",
  "personality": {
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
}

For analysis include:
- relationship summary
- who initiates more
- emotional tone
- interest signals
- green flags
- red flags
- communication pattern
- connection score from 0 to 100
- final takeaway

For personality identify:
- Tamil / English / Tanglish / Mixed
- typical reply length
- tone
- emoji usage
- humour
- affection style
- question style
- communication style
- actual common expressions found in the chat
- important communication patterns

Do not invent expressions that are not present.

Person name:
${exName}

WhatsApp chat:
${compressedChat}
`;

    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
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
        temperature: 0.4,
        max_tokens: 900
      })
    });

    const groqText = await groqResponse.text();

    if (!groqResponse.ok) {
      console.error("GROQ ERROR:", groqText);

      return res.status(groqResponse.status).json({
        success: false,
        error: "Groq API error.",
        details: groqText
      });
    }

    let groqData;

    try {
      groqData = JSON.parse(groqText);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Invalid response from Groq."
      });
    }

    const content =
      groqData?.choices?.[0]?.message?.content || "";

    if (!content) {
      return res.status(502).json({
        success: false,
        error: "Groq returned an empty response."
      });
    }

    let parsed;

    try {
      parsed = extractJSON(content);
    } catch (jsonError) {
      console.error("JSON PARSE ERROR:", content);

      return res.status(502).json({
        success: false,
        error: "AI returned an invalid analysis."
      });
    }

    const analysis = parsed.analysis || "No analysis available.";
    const personality = parsed.personality || {};

    // Save only analysis + personality
    try {
      await redisCommand([
        "SET",
        analysisKey,
        analysis,
        "EX",
        "2592000"
      ]);

      await redisCommand([
        "SET",
        personalityKey,
        JSON.stringify(personality),
        "EX",
        "2592000"
      ]);
    } catch (cacheError) {
      console.log("CACHE WRITE ERROR:", cacheError.message);
    }

    return res.status(200).json({
      success: true,
      result: analysis,
      personality,
      cached: false
    });

  } catch (error) {
    console.error("ANALYZE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Analysis failed."
    });
  }
}