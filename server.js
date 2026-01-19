import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ----- SESSION SETUP (MULTIPLE USERS) -----
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

// ----- LOCATIONS (ORDER LOCKED) -----
const LOCATIONS = [
  {
    answer: "wellington",
    rhyme: "A soldier rides where money sleeps, stone and power the city keeps.",
    hints: [
      "It’s in London’s financial district.",
      "It stands close to a famous central bank.",
      "It is an equestrian statue of a military leader."
    ]
  },
  {
    answer: "monument",
    rhyme: "From ash and flame the city rose, a tall reminder heavenward goes.",
    hints: [
      "It is near the River Thames.",
      "It is a tall stone column.",
      "It remembers a great disaster in London’s past."
    ]
  },
  {
    answer: "hinde",
    rhyme: "Wooden decks and cannon old, near food and crowds and stories told.",
    hints: [
      "It is south of the river.",
      "It is near Borough Market.",
      "It is a historic sailing ship."
    ]
  }
];

// ----- CHAT ENDPOINT -----
app.post("/chat", async (req, res) => {
  try {
    // Create game state PER USER
    if (!req.session.game) {
      req.session.game = {
        started: false,
        locationIndex: 0,
        hintIndex: -1
      };
    }

    const game = req.session.game;
    const message = req.body.message?.toLowerCase().trim();

    if (!message) {
      return res.json({ reply: "Say something to begin." });
    }

    // ----- FIRST MESSAGE -----
    if (!game.started) {
      game.started = true;
      return res.json({
        reply: "Welcome to London Adventure! Ask for a hint to begin."
      });
    }

    const current = LOCATIONS[game.locationIndex];

    // ----- SAFETY CHECK: END OF GAME -----
    if (!current) {
      req.session.game = {
        started: false,
        locationIndex: 0,
        hintIndex: -1
      };
      return res.json({
        reply: "🎉 You’ve completed the London Adventure! Refresh the page to play again."
      });
    }

    // ----- FIRST HINT (RHYME) -----
    if (message === "hint") {
      if (game.hintIndex === -1) {
        game.hintIndex = 0;
        return res.json({ reply: current.rhyme });
      }
      return res.json({ reply: "Ask for the next hint." });
    }

    // ----- NEXT HINTS -----
    if (message === "next hint") {
      if (game.hintIndex < current.hints.length) {
        const hint = current.hints[game.hintIndex];
        game.hintIndex++;
        return res.json({ reply: hint });
      }
      return res.json({ reply: "No more hints. Make your guess." });
    }

    // ----- GUESS CHECK -----
    if (message.includes(current.answer)) {
      game.locationIndex++;
      game.hintIndex = -1;

      if (game.locationIndex >= LOCATIONS.length) {
        req.session.game = {
          started: false,
          locationIndex: 0,
          hintIndex: -1
        };
        return res.json({
          reply: "Correct! 🎉 You have completed the London Adventure!"
        });
      }

      return res.json({
        reply: "Correct! Ask for a hint to continue."
      });
    }

    // ----- AI QUESTION ANSWER -----
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a London adventure guide.
Answer short factual questions.
Never reveal the landmark name.
Never skip locations.
Be indirect and concise.
          `
        },
        { role: "user", content: message }
      ],
      max_tokens: 50,
      temperature: 0.3
    });

    res.json({ reply: ai.choices[0].message.content });

  } catch (err) {
    console.error(err);
    res.json({ reply: "Bot: Sorry — something went wrong, but I'm still here." });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ London Adventure running on port ${PORT}`);
});
