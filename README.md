# 🚀 BuzzNexus Arena

AI-powered real-time multiplayer quiz battle platform for classrooms, workshops, and training sessions.

## ✨ Features

* 🤖 Generate quizzes from documents using AI
* ⚔️ Create real-time battle arenas
* 👨‍🏫 Mentor dashboard for hosting sessions
* 👨‍🎓 Students join using a room code
* 🚨 First-to-buzz answering system
* 🔒 Only the participant who buzzes first can answer the question while others are temporarily locked
* 📊 Live leaderboard and scoring
* 🏆 Final podium and achievements
* 📱 Progressive Web App (PWA)
* 🔄 Real-time synchronization with Supabase

## 🛠️ Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* Supabase Realtime
* Google Gemini AI

## 🚀 Getting Started

### Install

```bash
npm install
```

### Configure Environment

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
```

### Run

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
3. Create a battle arena
4. Students join using a room code
5. A countdown begins for each question
6. Participants race to buzz first
7. The fastest participant gets exclusive access to answer the question
8. Other participants are temporarily locked until the response is evaluated
9. Points are awarded based on correctness and configured scoring rules
10. Live standings update in real time
11. Winners are ranked on the final leaderboard and podium

```
```
