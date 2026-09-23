Opportunity Tracker 🎯

Never miss a hackathon, CTF, or competition deadline again.

A personal dashboard for tracking hackathons, CTFs, competitions, developer programs, scholarships, and conferences — with AI-powered research, deadline reminders, voice notes, and website monitoring, so you stop losing links and missing registration deadlines.

🔗 Live app: https://opportunity-tracker-r2cg.onrender.com

What it does
📊 Dashboard — all your opportunities in one place, color-coded by urgency (safe / approaching / urgent / passed)
🔍 AI Research — paste an event URL, and AI pulls out the deadline, prize info, team size, and requirements for you
🎤 Voice Notes — talk instead of type; AI transcribes and pulls out key details automatically
📢 Notifications — reminders as deadlines approach (14, 7, 3, 1 days before, customizable)
🌐 Website Monitoring — automatically checks if an event page changes (deadline extended, new announcement, etc.)
✅ Task Checklists — track prep steps per opportunity (register, set up environment, submit, etc.)
📱 Installable as an app — works as a PWA, add it to your phone's home screen like a real app
Using the live app (easiest way)

Just open the link above. No installation needed on your computer.

To install it on your phone as an app:

Android (Chrome): open the link → tap the ⋮ menu → "Add to Home screen"
iPhone (Safari): open the link → tap the Share icon → "Add to Home Screen"

⚠️ Note on this hosted version: it currently has no login system — it's a single shared dataset for anyone with the link. Only share this link with people you trust for now. A private, per-user version is planned.

⚠️ Note on free hosting: this runs on Render's free tier, which "sleeps" after 15 minutes of no traffic. The first person to open it after a quiet period may wait 30-50 seconds for it to wake up — that's normal, not a bug.

Running your own private copy (self-hosted)

If you want your own completely private version instead of sharing the link above:

1. Get a free Gemini API key
Go to ai.google.dev
Sign in with a Google account
Click "Get API key" → "Create API key"
Copy the key it gives you
2. Clone and set up the project
bash
git clone https://github.com/zenithVeil/opportunity-tracker.git
cd opportunity-tracker
npm install
3. Add your API key

Create a .env file in the project root:

env
GEMINI_API_KEY=your_key_here
4. Run it
bash
npm run dev

Opens at http://localhost:3000

5. Deploy your own copy online (optional, free)
Fork this repo to your own GitHub account
Go to render.com, sign up with GitHub
New → Web Service → select your forked repo
Build command: npm install && npm run build
Start command: npm run start
Add environment variable GEMINI_API_KEY with your key
Instance type: Free
Deploy — you'll get your own URL
Tech Stack
Frontend: React 19 + TypeScript, Vite, Tailwind CSS, PWA
Backend: Express.js, Google Gemini API (@google/genai)
Storage: JSON file-based (atomic writes, corruption recovery)
Testing: Node's built-in test runner
Troubleshooting

AI features not working / "invalid API key" error

Confirm GEMINI_API_KEY is set correctly with no extra spaces or quotes
Note: newer Gemini keys start with AQ. instead of the older AIza... format — both should work with this app's SDK version, but if you hit auth errors, try generating a fresh key

Voice notes not transcribing

Check your browser's microphone permission for the site
Try refreshing the page

App feels slow to load the first time

If using the hosted free-tier link, this is Render's free plan "waking up" after inactivity — wait ~30-50 seconds

Website monitoring shows outdated info

The AI currently checks the event's main website only; if the organizer posts updates elsewhere (a registration platform, social media), that change won't be caught yet — this is a known limitation being worked on
Roadmap
 Per-user accounts with private data (currently single shared dataset)
 Check multiple sources per opportunity (not just one website) to reduce inaccurate/stale info
 Email/push notifications for reminders
 Export to calendar (Google Calendar / iCal)
Privacy
No tracking, no ads
Your data lives in this app's storage — not shared with any third party except Google's Gemini API for the AI features you use
Source code is open — anyone can review exactly what it does
License

MIT

Built to solve a real problem: missing hackathon and CTF deadlines. If it helps you too, that's the whole point. 🚀
