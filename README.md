# LinguaTranslate – AI Powered Language Translator

LinguaTranslate is a modern, responsive, and full-stack text translation web application built with **React.js (Vite)**, **Tailwind CSS (v4)**, **Node.js (Express)**, and **Axios**. It integrates Microsoft Translator Text API from **RapidAPI** via a secure server-side API proxy, protecting credential secrets completely from client-side vulnerability.

---

## 🎨 Visual Preview & Design philosophy

LinguaTranslate incorporates **Glassmorphism**, fluid motion transitions, and high-contrast color balances to deliver a premium user interface.
- **Glassmorphism Workspace Card**: Semi-transparent backing panels with real-time blur backdrops and clean border shadows.
- **Micro-Animations**: Staggered list layout animations on deletion, rotating loading indicators, and springs on button actions using `motion`.
- **Dual Visual Modes**: Native Light Mode and Dark Mode with immediate client-side persistence and dynamic layout shifting.
- **Aesthetic Pairings**: Headings pair with *Outfit* typography, general body UI with *Inter*, and data metrics with *JetBrains Mono*.

---

## 🚀 Core Features

1. **Robust Translation Grid**:
   - Translate from English to 10 key global and regional target languages: **Hindi**, **Marathi**, **French**, **German**, **Spanish**, **Japanese**, **Korean**, **Chinese**, **Arabic**, and **Russian**.
   - Live character-remaining ticker (cap at 5,000 maximum).
   - Word count ticker.

2. **Language Swap Utility**:
   - Instantly reverse the source and target languages along with active input and output texts for quick replies.

3. **Multi-Action Toolkit**:
   - **TTS Voice Synthesis**: Native audio playback utilizing standard Speech Synthesis matching the output locale's pronounciation standards.
   - **File Exporter**: Compile and download translations locally as an formatted `.txt` document file.
   - **Copy to Clipboard**: Quick single-tap copy actions with visual confirmation states.

4. **Persistent History Ledger**:
   - Local storage persistence storing the last 10 translation transactions with full timestamp details, language codes, and flags.
   - Capability to remove individual transactions with smooth exit transitions or empty the log completely.

5. **Full-Stack API Key Proxy**:
   - Proxies RapidAPI requests through an Express server route, keeping key strings hidden inside `.env` variables from potential malicious browser extraction.

---

## 🛠️ Tech Stack & Configurations

- **Client Runtime**: React 19 (TypeScript) with Vite
- **Server Runtime**: Node.js & Express (proxies API requests safely)
- **Styling Method**: Tailwind CSS (v4) with `@theme` configurations
- **Network Helpers**: Axios client & server integration
- **Animations**: Framer Motion (`motion/react`)
- **Icon Assets**: Lucide React Icons

---

## ⚙️ Environment Configuration

Define the following environment credentials in your local `.env` file at the root of the project:

```env
# Server Ingress URL
APP_URL="http://localhost:3000"

# RapidAPI Translation Credentials
VITE_RAPIDAPI_KEY="YOUR_RAPIDAPI_KEY_STRING_HERE"
VITE_RAPIDAPI_HOST="microsoft-translator-text-api3.p.rapidapi.com"
```

*Note: RapidAPI keys can be obtained directly from [Microsoft Translator Text API on RapidAPI](https://rapidapi.com/smarteye-smarteye-default/api/microsoft-translator-text-api3).*

---

## 📂 Project Structure

```text
/
├── server.ts                 # Full-stack Node.js server entry (express + vite integration)
├── package.json              # App dependencies and full-stack scripts
├── metadata.json             # AI Studio App configuration
├── index.html                # App root index page
├── README.md                 # Project handbook (this file)
└── src/
    ├── App.tsx               # Root React entry component & theme manager
    ├── main.tsx              # React mounting controller
    ├── types.ts              # TypeScript type interfaces
    ├── index.css             # Tailwind v4 directives & Google Fonts
    ├── components/
    │   ├── Navbar.tsx        # Responsive glassmorphism header & theme toggle
    │   ├── ThemeToggle.tsx   # Floating interactive button toggle
    │   ├── Translator.tsx    # Central dual text workspace & operations card
    │   └── History.tsx       # Translation logs list & deletion manager
    ├── pages/
    │   └── Home.tsx          # Landing dashboard & hero container
    └── services/
        └── translatorApi.ts  # Client-side Axios interface with the backend API
```

---

## 🚀 Installation & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
Starts both the Express backend and Vite frontend via hot-reloading `tsx` executor:
```bash
npm run dev
```
Open browser tab at [http://localhost:3000](http://localhost:3000) to view app.

### 3. Build & Run Production Bundle
Compiles Vite assets and bundles Express TS entrypoint into robust, self-contained CommonJS code inside `dist/`:
```bash
npm run build
npm start
```
