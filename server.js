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
    answers: ["wellington", "duke of wellington"],
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
    // ----- SAFE SESSION INIT / REPAIR -----
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
        reply: "🎉 You’ve completed the entire adventure. Say hello to play again.",
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

    // ----- YES / NO CHECK (“is it the …”) -----
    if (message.startsWith("is it")) {
      const correct = current.answers.some((ans) =>
        message.includes(ans)
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

    // ----- AI: FACTUAL QUESTIONS ONLY -----
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a strict London adventure moderator.

Rules:
- Answer short factual questions only.
- Never confirm, deny, or imply a landmark name.
- If the question helps solve the puzzle, politely refuse.
- Do not invent clues.
- Keep answers brief.
          `,
        },
        { role: "user", content: message },
      ],
      max_tokens: 60,
      temperature: 0.2,
    });

    res.json({ reply: ai.choices[0].message.content });

  } catch (err) {
    console.error("🔥 SERVER ERROR:", err);
    res.json({
      reply: "Bot: Something went wrong, but the game is still running.",
    });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ London Adventure running on port ${PORT}`);
});
