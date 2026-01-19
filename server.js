import express from "express";
import cors from "cors";
import session from "express-session";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// ----- SESSION SETUP -----
app.use(
  session({
    secret: "london-adventure-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ----- STATIC FILES -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ----- OPENAI -----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----- GAME LOCATIONS (ORDER LOCKED) -----
const LOCATIONS = [
  {
    answers: ["wellington"],
    clue: `Rubber treads where leather once would step,
A victor waits where coin and columns bide.
Seek the Duke whose name keeps rain at bay`,
  },
  {
    answers: ["monument"],
    clue: `Count the year when flames wore hell’s own mark,
Six, six, six — the City turned to dark.
Measure two-oh-two from where the baker stood,
And rise in stone where fire was understood.`,
  },
  {
    answers: ["golden hinde", "hinde"],
    clue: `She ringed the world, a wooden line on blue,
Knighted thief of crowns and oceans too.
Spanish gold grew lighter in her wake,
Find Drake’s old galleon — history at anchor, awake.`,
  },
  {
    answers: ["hawksmoor"],
    clue: `Beasts meet flame where iron once was weighed,
Cut and time are honoured, not betrayed.
Look for birds of war above the door,
Meat is king — you’ve found the Hawk of Moor.`,
  },
];

// ----- CHAT ENDPOINT -----
app.post("/chat", async (req, res) => {
  try {
    // Create game state per user
    if (!req.session.game) {
      req.session.game = {
        started: false,
        index: 0,
      };
    }

    const game = req.session.game;
    const message = req.body.message?.toLowerCase().trim();

    if (!message) {
      return res.json({ reply: "Say something when you're ready." });
    }

    // ----- START GAME -----
    if (!game.started) {
      game.started = true;
      return res.json({
        reply: "Welcome. Ask for the clue when you’re ready.",
      });
    }

    const current = LOCATIONS[game.index];

    // ----- END OF GAME -----
    if (!current) {
      return res.json({
        reply: "🎉 You’ve reached the final destination. Well done.",
      });
    }

    // ----- GIVE CLUE -----
    if (message === "clue" || message === "hint") {
      return res.json({ reply: current.clue });
    }

    // ----- CHECK GUESS -----
    const correct = current.answers.some((ans) =>
      message.includes(ans)
    );

    if (correct) {
      game.index++;

      if (game.index >= LOCATIONS.length) {
        return res.json({
          reply: "Correct. 🎉 You’ve completed the entire London adventure.",
        });
      }

      return res.json({
        reply: "Correct. Ask for the next clue when you are ready.",
      });
    }

    // ----- AI QUESTION ANSWERING (NO PROGRESSION) -----
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a cryptic London game master.
Answer factual or directional questions briefly.
Never reveal place names.
Never confirm or deny guesses.
Do not advance the game.
          `,
        },
        { role: "user", content: message },
      ],
      max_tokens: 60,
      temperature: 0.4,
    });

    res.json({ reply: ai.choices[0].message.content });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.json({
      reply: "Bot: Something went wrong, but the game continues.",
    });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ London Adventure running on port ${PORT}`);
});
