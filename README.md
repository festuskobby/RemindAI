# RemindAI Web App — Netlify Deployment Guide

A fully working AI-powered reminder web app.  
The Claude API key is stored **secretly** on Netlify's server — never exposed in the browser.

---

## How it works

```
Browser → POST /api/claude → Netlify Function (claude.js) → Claude API → response → Browser
```

Your API key lives only in Netlify's environment variables. The browser never sees it.

---

## Deploy in 5 steps

### Step 1 — Upload to GitHub
1. Go to github.com → sign up free if you don't have an account
2. Click "New repository" → name it `remindai-web` → click "Create repository"
3. Upload all files from this folder by dragging them into the GitHub interface
   - Make sure to maintain the folder structure:
     ```
     netlify/functions/claude.js
     public/index.html
     public/css/style.css
     public/js/app.js
     netlify.toml
     package.json
     README.md
     ```

### Step 2 — Connect to Netlify
1. Go to netlify.com → sign up free (use your GitHub account)
2. Click "Add new site" → "Import an existing project"
3. Choose "GitHub" → select your `remindai-web` repository
4. Build settings (Netlify auto-detects from netlify.toml):
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Click "Deploy site"

### Step 3 — Add your API key (THE CRITICAL STEP)
1. In Netlify dashboard → your site → "Site configuration"
2. Click "Environment variables" in the left menu
3. Click "Add a variable"
4. Set:
   - **Key:** `CLAUDE_API_KEY`
   - **Value:** your actual Claude API key (starts with `sk-ant-`)
5. Click "Save"

### Step 4 — Trigger a redeploy
After adding the environment variable:
1. Go to "Deploys" tab in Netlify
2. Click "Trigger deploy" → "Deploy site"
3. Wait 1-2 minutes for it to finish

### Step 5 — Open your app
Your app is live at: `https://your-site-name.netlify.app`

---

## File structure explained

```
remindai-web/
├── netlify/
│   └── functions/
│       └── claude.js        ← Serverless function (your secret API proxy)
├── public/
│   ├── index.html           ← The app UI
│   ├── css/
│   │   └── style.css        ← All styling
│   └── js/
│       └── app.js           ← All app logic
├── netlify.toml             ← Tells Netlify where everything is
├── package.json             ← Project metadata
└── README.md                ← This file
```

---

## Why this approach works (and why hardcoding keys doesn't)

| Method | Safe? | Works on Netlify? |
|--------|-------|-------------------|
| Key in HTML/JS (frontend) | ❌ Exposed publicly | ❌ Anthropic revokes it |
| Key in Netlify env variable + Function | ✅ Never exposed | ✅ Works perfectly |

---

## Features
- 🤖 Live Claude AI parses natural language reminders
- 🔔 Browser notifications when reminders are due
- 🎤 Voice input (Chrome/Edge)
- 📅 Reminders tab shows upcoming and completed
- ⚙️ Settings: lead time, work hours, auto-send voice
- 💾 Reminders saved locally in browser storage
- 📱 Mobile-optimised interface

---

## Troubleshooting

**"Invalid x-api-key" error:**
→ Your API key in Netlify environment variables is missing or wrong.
→ Go to Netlify → Site configuration → Environment variables → check CLAUDE_API_KEY

**Function not found (404 on /api/claude):**
→ Check that `netlify.toml` is in the root of your repository
→ Check that `netlify/functions/claude.js` exists

**App loads but no AI response:**
→ Open browser DevTools (F12) → Console tab → look for the error message
→ Most common cause: API key not set or redeploy not triggered after adding key
