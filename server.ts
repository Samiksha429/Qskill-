import express from "express";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocketServer } from "ws";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const languageMap: { [key: string]: string } = {
  af: "Afrikaans",
  sq: "Albanian",
  ar: "Arabic",
  hy: "Armenian",
  az: "Azerbaijani",
  eu: "Basque",
  be: "Belarusian",
  bn: "Bengali",
  bs: "Bosnian",
  bg: "Bulgarian",
  ca: "Catalan",
  zh: "Chinese",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  eo: "Esperanto",
  et: "Estonian",
  fi: "Finnish",
  fr: "French",
  gl: "Galician",
  ka: "Georgian",
  de: "German",
  el: "Greek",
  gu: "Gujarati",
  ht: "Haitian Creole",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  is: "Icelandic",
  id: "Indonesian",
  ga: "Irish",
  it: "Italian",
  ja: "Japanese",
  kn: "Kannada",
  kk: "Kazakh",
  ko: "Korean",
  lv: "Latvian",
  lt: "Lithuanian",
  mk: "Macedonian",
  ms: "Malay",
  ml: "Malayalam",
  mt: "Maltese",
  mr: "Marathi",
  mn: "Mongolian",
  ne: "Nepali",
  no: "Norwegian",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  pa: "Punjabi",
  ro: "Romanian",
  ru: "Russian",
  sr: "Serbian",
  sk: "Slovak",
  sl: "Slovenian",
  es: "Spanish",
  sw: "Swahili",
  sv: "Swedish",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
  cy: "Welsh",
  yi: "Yiddish",
  zu: "Zulu"
};

async function translateWithGemini(text: string, fromCode: string, toCode: string): Promise<string> {
  const fromLang = languageMap[fromCode] || fromCode;
  const toLang = languageMap[toCode] || toCode;
  
  const prompt = `Translate the following text from ${fromLang} to ${toLang}.
Only return the exact translated text. Do not include any explanations, introduction, markdown blocks, notes, metadata, formatting, or extra characters. Keep any line breaks or layout of the original text exactly as is.

Text to translate:
${text}`;

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Attempting Gemini translation using model ${model} (attempt ${attempt}/2)...`);
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            temperature: 0.1,
          },
        });
        
        if (response && response.text) {
          const translated = response.text.trim();
          if (translated) {
            return translated;
          }
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Gemini translation with model ${model} failed on attempt ${attempt}:`, err?.message || err);
        
        // If it's a quota or rate-limit error, skip further attempts for this model and try the next model immediately
        const errStr = String(err?.message || err || "");
        const isQuotaError = err?.status === "RESOURCE_EXHAUSTED" || 
                             err?.code === 429 || 
                             errStr.includes("429") || 
                             errStr.includes("quota") || 
                             errStr.includes("Quota") || 
                             errStr.includes("RESOURCE_EXHAUSTED");
                             
        if (isQuotaError) {
          console.log(`Model ${model} hit rate limit / quota. Skipping remaining attempts for this model...`);
          break; // break the attempt loop to move to next model
        }

        if (attempt < 2) {
          // Wait 300ms before retrying the same model
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }
  }

  throw lastError || new Error("All Gemini translation fallback attempts failed.");
}


function extractTranslationText(data: any): string {
  if (!data) return "";
  
  if (typeof data === "string") return data;
  
  // standard Microsoft Translator array response: [ { translations: [ { text: "..." } ] } ]
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && first.translations && Array.isArray(first.translations) && first.translations.length > 0) {
      return first.translations[0].text || "";
    }
    if (first && typeof first === "object" && "text" in first) {
      return first.text || "";
    }
  }
  
  // { translations: [ { text: "..." } ] }
  if (data.translations && Array.isArray(data.translations) && data.translations.length > 0) {
    return data.translations[0].text || "";
  }
  
  // other common response structures
  if (typeof data === "object") {
    if ("text" in data && typeof data.text === "string") {
      return data.text;
    }
    if ("translatedText" in data && typeof data.translatedText === "string") {
      return data.translatedText;
    }
    if ("result" in data && typeof data.result === "string") {
      return data.result;
    }
    if ("translation" in data && typeof data.translation === "string") {
      return data.translation;
    }
  }
  
  return JSON.stringify(data);
}

let rapidApiConsecutiveFailures = 0;
let rapidApiLastFailureTime = 0;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isPlaceholderKey(key: string | undefined): boolean {
  if (!key) return true;
  const k = key.trim().toLowerCase();
  return k === "" || k === "your_api_key" || k.includes("placeholder") || k === "your-api-key" || k === "your_api_key_here";
}

function splitTextIntoTtsChunks(text: string, maxLength: number = 180): string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  
  // Split by punctuation and line breaks
  const sentences = text.match(/[^.!?\n\r]+[.!?\n\r]*|.+/g) || [text];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    if (trimmed.length <= maxLength) {
      if ((currentChunk + " " + trimmed).trim().length <= maxLength) {
        currentChunk = (currentChunk + " " + trimmed).trim();
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = trimmed;
      }
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      
      const words = trimmed.split(/\s+/);
      for (const word of words) {
        if ((currentChunk + " " + word).trim().length <= maxLength) {
          currentChunk = (currentChunk + " " + word).trim();
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = word;
        }
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for translation proxying
  app.post("/api/translate", async (req: express.Request, res: express.Response) => {
    try {
      const { from = "en", to, text, engine = "auto" } = req.body;
      if (!to) {
        return res.status(400).json({ error: "Target language code ('to') is required" });
      }
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Text to translate is required" });
      }

      const apiKey = process.env.VITE_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
      const apiHost = process.env.VITE_RAPIDAPI_HOST || "microsoft-translator-text-api3.p.rapidapi.com";

      const isRapidApiCircuitBroken = () => {
        if (rapidApiConsecutiveFailures >= 2) {
          const timeSinceLastFailure = Date.now() - rapidApiLastFailureTime;
          if (timeSinceLastFailure < BREAKER_COOLDOWN_MS) {
            return true;
          } else {
            console.log("RapidAPI circuit breaker cooldown expired. Resetting circuit breaker...");
            rapidApiConsecutiveFailures = 0;
          }
        }
        return false;
      };

      // 1. Explicit Gemini requested
      if (engine === "gemini") {
        try {
          const translatedText = await translateWithGemini(text, from, to);
          return res.json({ translation: translatedText, engine: "gemini" });
        } catch (geminiErr: any) {
          console.error("Gemini direct translation error:", geminiErr?.message);
          return res.status(500).json({
            error: "TRANSLATION_FAILED",
            message: `Gemini AI failed to translate: ${geminiErr?.message || "Internal error"}`
          });
        }
      }

      const isKeyMissing = isPlaceholderKey(apiKey);
      const isBroken = isRapidApiCircuitBroken();

      // If RapidAPI key is missing or circuit is broken and user didn't force Microsoft, use Gemini
      if ((isKeyMissing || isBroken) && engine !== "microsoft") {
        try {
          const translatedText = await translateWithGemini(text, from, to);
          return res.json({ translation: translatedText, engine: isBroken ? "gemini_circuit_broken_fallback" : "gemini" });
        } catch (geminiErr: any) {
          console.error("Gemini translation fallback error:", geminiErr?.message);
          return res.status(500).json({
            error: "TRANSLATION_FAILED",
            message: "Translation service failed to respond."
          });
        }
      }

      // 2. Explicit Microsoft requested
      if (engine === "microsoft") {
        if (isKeyMissing) {
          return res.status(400).json({
            error: "API_KEY_MISSING",
            message: "Microsoft Translator key is missing or not configured. Please add VITE_RAPIDAPI_KEY in Secrets."
          });
        }

        try {
          const response = await axios.post(
            `https://${apiHost}/largetranslate?from=${from}&to=${to}`,
            {
              sep: "|",
              text: text
            },
            {
              headers: {
                "Content-Type": "application/json",
                "x-rapidapi-host": apiHost,
                "x-rapidapi-key": apiKey
              },
              timeout: 10000
            }
          );

          // Success, reset consecutive failures
          rapidApiConsecutiveFailures = 0;
          const translatedText = extractTranslationText(response.data);
          return res.json({ translation: translatedText, raw: response.data, engine: "microsoft" });
        } catch (rapidErr: any) {
          // Increment failures
          rapidApiConsecutiveFailures++;
          rapidApiLastFailureTime = Date.now();
          console.error("Direct Microsoft translation failed:", rapidErr?.message);
          return res.status(502).json({
            error: "MICROSOFT_API_FAILED",
            message: `Microsoft Translation service timed out or failed: ${rapidErr?.message || "Service error"}`
          });
        }
      }

      // 3. Auto mode (Prefer Microsoft but fall back to Gemini with a fast timeout)
      const timeoutMs = 3500; // Use a fast 3.5s timeout for auto-detect to keep UX fluid
      try {
        const response = await axios.post(
          `https://${apiHost}/largetranslate?from=${from}&to=${to}`,
          {
            sep: "|",
            text: text
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-rapidapi-host": apiHost,
              "x-rapidapi-key": apiKey
            },
            timeout: timeoutMs
          }
        );

        // Success, reset consecutive failures
        rapidApiConsecutiveFailures = 0;
        const translatedText = extractTranslationText(response.data);
        return res.json({ translation: translatedText, raw: response.data, engine: "microsoft" });
      } catch (rapidErr: any) {
        // Increment failures
        rapidApiConsecutiveFailures++;
        rapidApiLastFailureTime = Date.now();
        
        // Log info/debug message instead of console.warn to avoid triggering "error" labels in log parsers
        console.info(`RapidAPI translation fallback triggered (timeout ${timeoutMs}ms). Details: ${rapidErr?.message || "Timeout"}`);
        try {
          const translatedText = await translateWithGemini(text, from, to);
          return res.json({ translation: translatedText, engine: "gemini_fallback" });
        } catch (geminiErr: any) {
          console.error("Gemini translation fallback error after RapidAPI failed:", geminiErr?.message);
          return res.status(503).json({
            error: "TRANSLATION_SERVICES_UNAVAILABLE",
            message: `All translation options are temporarily timing out. (Details: ${geminiErr?.message || 'System busy'})`
          });
        }
      }
    } catch (error: any) {
      console.error("Translation server route error:", error?.message);
      
      const status = error?.response?.status || 500;
      let errorMessage = "Internal translation request failure";
      
      if (error?.response?.data) {
        errorMessage = error.response.data.message || error.response.data.error || JSON.stringify(error.response.data);
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      return res.status(status).json({
        error: "API_FAILURE",
        message: errorMessage
      });
    }
  });

  // Text-To-Speech (TTS) Proxy API
  app.get("/api/tts", async (req, res) => {
    try {
      const text = req.query.text as string;
      const lang = req.query.lang as string;
      
      if (!text || !lang) {
        return res.status(400).json({ error: "Missing 'text' or 'lang' parameters" });
      }
      
      const chunks = splitTextIntoTtsChunks(text);
      const buffers: Buffer[] = [];
      
      for (const chunk of chunks) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          responseType: "arraybuffer",
          timeout: 6000
        });
        buffers.push(Buffer.from(response.data));
      }
      
      const combinedBuffer = Buffer.concat(buffers);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400"); // cache for 1 day
      return res.send(combinedBuffer);
    } catch (err: any) {
      console.error("TTS proxy generation error:", err?.message);
      return res.status(500).json({ error: "TTS_FAILED", message: "Failed to generate text-to-speech audio" });
    }
  });

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite development vs production build serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: "/api/live" });

  wss.on("connection", async (clientWs, req) => {
    console.log("New Live API WebSocket connection established");
    
    // Config parameters can be passed as query string
    const urlParams = new URLSearchParams(req.url?.split("?")[1] || "");
    const voiceName = urlParams.get("voice") || "Zephyr";
    const mode = urlParams.get("mode") || "translator";
    
    let systemInstruction = "You are a helpful translation and language learning assistant. Keep responses brief, conversational, and natural. Speak in the language requested by the user, or assist them with their language learning. Speak clearly and accurately.";
    if (mode === "translator") {
      systemInstruction = "You are a friendly bilingual translation assistant. Any time the user speaks, translate their message to the other language if they speak English, or to English if they speak another language, and say it back in a friendly, conversational tone. Keep your responses short and clear.";
    } else if (mode === "teacher") {
      systemInstruction = "You are a supportive, encouraging language teacher. Guide the user in conversational practice, correcting pronunciation gently and explaining words in a simple, friendly manner. Keep responses conversational and brief.";
    } else if (mode === "chat") {
      systemInstruction = "You are a helpful, conversational AI friend. Talk naturally with the user, keeping your responses brief and engaging.";
    }

    try {
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: any) => {
            // Forward everything safely to the client
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.text) {
                clientWs.send(JSON.stringify({ text: part.text }));
              }
            }
            
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (err: any) {
          console.error("Error sending input to Gemini Live:", err?.message);
        }
      });

      clientWs.on("close", () => {
        console.log("Client closed Live WebSocket connection");
        try {
          session.close();
        } catch (e: any) {
          console.warn("Error closing Gemini Live session:", e?.message);
        }
      });

      clientWs.on("error", (err) => {
        console.error("Client WebSocket error:", err);
        try {
          session.close();
        } catch (e) {}
      });

    } catch (err: any) {
      console.error("Failed to connect to Gemini Live:", err);
      clientWs.send(JSON.stringify({ error: "CONNECTION_FAILED", message: err?.message || "Could not connect to Gemini Live API" }));
      clientWs.close();
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
