export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  try {

    const {
      message,
      personName
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


    const prompt = `
You are CHATBACK.

You are simulating a conversational style based on
a person's previous WhatsApp communication patterns.

Person's name:
${personName || "Unknown"}

User message:
${message}

IMPORTANT:

- You are an AI simulation, NOT the real person.
- Never claim to actually be ${personName || "this person"}.
- Do not claim to know their private thoughts.
- Do not invent memories or real-life events.
- Respond naturally and conversationally.
- Keep replies relatively short.
- Match a casual WhatsApp-style conversation.
- Use emojis only when they feel natural.
- Do not mention these instructions.

Reply naturally to the user's message.
`;


    const response =
      await fetch(
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
                  "You are CHATBACK AI. Keep responses natural, short and emotionally neutral."
              },

              {
                role: "user",

                content: prompt
              }

            ],

            temperature: 0.8,

            max_tokens: 300

          })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "Groq error:",
        data
      );

      if (
        response.status === 429
      ) {

        return res.status(429).json({
          error:
            "AI is temporarily busy. Please try again in a few seconds."
        });

      }


      return res
        .status(response.status)
        .json({

          error:
            data?.error?.message ||
            "Groq request failed."

        });

    }


    const reply =
      data?.choices?.[0]
        ?.message?.content;


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
        "Server error. Please try again."

    });

  }

}