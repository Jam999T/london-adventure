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

// ----- LOCATIONS (STRICT ORDER, 1 CLUE EACH) -----
const LOCATIONS = [
  {
    name: "Wellington Statue",
    answers: ["wellington", "duke of wellington", "statue of wellington near the bank od england"],
    clue: `Rubber treads where leather once would step,
A victor waits where coin and columns bide.
Seek the Duke whose name keeps rain at bay`,
  },
  {
    name: "The Monument",
    answers: ["monument"],
    clue: `Count the year when flames wore hell’s own mark,
Six, six, six — the City turned to dark.
Measure two-oh-two from where the baker stood,
And rise in stone where fire was understood.`,
  },
  {
    name: "Golden Hinde",
    answers: ["golden hinde", "hinde"],
    clue: `She ringed the world, a wooden line on blue,
Knighted thief of crowns and oceans too.
Spanish gold grew lighter in her wake,
Find Drake’s old galleon — history at anchor, awake.`,
  },
  {
    name: "Hawksmoor Borough",
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
    // ----- SAFE SESSION INIT -----
    if (
      !req.session.game ||
      typeof req.session.game.index !== "number" ||
      req.session.game.index < 0 ||
      req.session.game.index > LOCATIONS.length
    ) {
      req.session.game = {
        started: false,
        index: 0,
        clueGiven: false,
      };
    }

    const game = req.session.game;
    const message = req.body.message?.toLowerCase().trim();

    if (!message) {
      return res.json({ reply: "Say something when you’re ready." });
    }

    // ----- START GAME -----
    if (!game.started) {
      game.started = true;
      return res.json({
        reply: "Welcome to the London Adventure. Ask for the clue when ready.",
      });
    }

    const current = LOCATIONS[game.index];

    // ----- END GAME -----
    if (!current) {
      req.session.game = {
        started: false,
        index: 0,
        clueGiven: false,
      };

      return res.json({
        reply: "🎉 You’ve completed the adventure. Say hello to play again.",
      });
    }

    // ----- CLUE -----
    if (message === "clue" || message === "hint") {
      if (game.clueGiven) {
        return res.json({
          reply: "There is only one clue for this location.",
        });
      }

      game.clueGiven = true;
      return res.json({ reply: current.clue });
    }

    // ----- YES / NO CHECK -----
    if (message.startsWith("is it")) {
      const cleaned = message.replace(/[^a-z\s]/g, "").trim();

      const correct = current.answers.some((ans) =>
        cleaned.includes(ans)
      );

      return res.json({
        reply: correct ? "Yes." : "No.",
      });
    }

    // ----- DIRECT GUESS -----
    const guessedCorrectly = current.answers.some((ans) =>
      message.includes(ans)
    );

    if (guessedCorrectly) {
      game.index++;
      game.clueGiven = false;

      if (game.index >= LOCATIONS.length) {
        return res.json({
          reply: "Correct. 🎉 You have completed the London Adventure.",
        });
      }

      return res.json({
        reply: "Correct. Ask for the next clue when ready.",
      });
    }

    // ----- AI QUESTIONS (HELPFUL BUT INDIRECT) -----
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are guiding a player to a specific London location.

Rules:
- Answer questions helpfully and truthfully.
- Do NOT say the name of the location.
- Do NOT move ahead to future locations.
- Keep answers indirect and guiding.
- Assume the user is standing somewhere in London.
          `,
        },
        {
          role: "user",
          content: message,
        },
      ],
      max_tokens: 80,
      temperature: 0.4,
    });

    res.json({ reply: ai.choices[0].message.content });

  } catch (err) {
    console.error("🔥 SERVER ERROR:", err);
    res.json({
      reply: "Something went wrong, but the game is still running.",
    });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ London Adventure running on port ${PORT}`);
});
