# 🚀 BuzzNexus Arena

AI-powered real-time multiplayer quiz battle platform for classrooms, workshops, and training sessions.

## ✨ Features

* 🤖 Generate quizzes from documents using AI
* ⚔️ Create real-time battle arenas
* 👨‍🏫 Mentor dashboard for hosting sessions
* 👨‍🎓 Students join using a room code
* 🚨 First-to-buzz gameplay system
* 🔒 Only the participant who buzzes first can view and answer the question while all other participants remain locked
* 📊 Live leaderboard and scoring
* 🏆 Final podium and achievement badges
* 📱 Progressive Web App (PWA)
* 🔄 Real-time synchronization with Supabase

## 🛠️ Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* Supabase Realtime
* Google Gemini AI

## 📦 Installation

Clone the repository:

```bash
git clone https://github.com/Hyma241/BuzzNexus.git
cd BuzzNexus
```

Install dependencies:

```bash
npm install
```

## ⚙️ Environment Setup

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key
```

## 🚀 Run Locally

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 🎮 How It Works

1. Mentor uploads study material
2. AI generates quiz questions
3. Mentor creates a battle arena
4. Students join using a room code
5. Participants race to buzz first
6. The fastest participant gains exclusive access to answer
7. Other participants remain locked until evaluation
8. Scores update in real time
9. Winners are ranked on the leaderboard and final podium

## 📸 Screenshots

Screenshots are available in the `/screenshots` directory.


