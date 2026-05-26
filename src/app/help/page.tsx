'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ChevronDown,
  Download,
  FileText,
  Gamepad2,
  HelpCircle,
  KeyRound,
  Lock,
  Monitor,
  PresentationIcon,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UploadCloud,
  Users,
  Zap,
} from 'lucide-react';
import NeonBackground from '@/components/NeonBackground';
import CyberButton from '@/components/ui/CyberButton';

type HelpSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  steps: string[];
  tips: string[];
};

const SECTIONS: HelpSection[] = [
  {
    id: 'mentor',
    title: 'Mentor Workflow',
    subtitle: 'Create quizzes, launch arenas, control the room, and export results.',
    icon: ShieldCheck,
    steps: [
      'Open Dashboard and upload a PDF, DOCX, TXT, or clear image scan in Quiz Generator.',
      'Choose question count, difficulty, timer, topic focus, creativity, and education level.',
      'BuzzNexus extracts readable text, cleans OCR noise, chunks the material, asks Gemini for source-backed questions, then validates answers before saving.',
      'Create an arena, select a quiz, share the room code or QR code, and open Projector for the audience screen.',
      'Start the battle, watch buzz order, grade answers, reveal results after the timer, and move to the next question.',
      'At the final podium, export leaderboard data as CSV, XLSX, or PDF.',
    ],
    tips: [
      'Use fewer questions for short chapters. The app reduces count automatically when the source cannot support reliable MCQs.',
      'Keep creativity low for textbooks and factual exams.',
      'Use Projector mode on a separate display; keep mentor controls on your own screen.',
    ],
  },
  {
    id: 'student',
    title: 'Student Workflow',
    subtitle: 'Join, buzz, answer, track points, and download a futuristic badge.',
    icon: Users,
    steps: [
      'Students open the join link or scan the room QR code.',
      'They enter a display name and wait in the lobby until the mentor starts.',
      'During the live timer, students watch the projector and tap BUZZ when ready.',
      'Only the fastest eligible student sees the answer interface. Their selected option locks after submission.',
      'Correct answers are hidden until the mentor moves the room into results.',
      'At the final leaderboard, each student sees their score and downloadable BuzzNexus credential badge.',
    ],
    tips: [
      'Refreshing should not be needed; room state resyncs automatically.',
      'If another student is answering, stay ready because the next buzzer can be activated after a wrong answer.',
    ],
  },
  {
    id: 'pdf',
    title: 'PDF Guidelines',
    subtitle: 'Use clean source files to get clean questions.',
    icon: FileText,
    steps: [
      'Best results come from text-based PDFs exported from Word, Google Docs, PowerPoint, or a textbook platform.',
      'DOCX and TXT files are excellent because text extraction is direct.',
      'Scanned PDFs are images. BuzzNexus attempts OCR only when scanned text is detected, but OCR can miss formulas, tables, or faint text.',
      'Avoid PDFs with answer keys, watermark-heavy pages, handwritten notes, sideways pages, or low-resolution photos.',
      'If the source has too little readable text, BuzzNexus warns you and reduces or blocks generation instead of hallucinating fake MCQs.',
    ],
    tips: [
      'For scanned notes, upload a clearer image or re-export a text PDF.',
      'Remove answer-key pages before uploading if possible.',
      'A focused 3-8 page topic produces better questions than a huge mixed chapter.',
    ],
  },
  {
    id: 'ai',
    title: 'AI Quiz Generation Guide',
    subtitle: 'How Gemini is used without trusting it blindly.',
    icon: Brain,
    steps: [
      'BuzzNexus extracts text with pdf-parse, DOCX with mammoth, and OCR only for scanned material.',
      'The cleaner removes OCR fragments, page numbers, repeated symbols, and [Correct] markers while preserving paragraphs and MCQ structure.',
      'Semantic chunking keeps related paragraphs together and sends only meaningful chunks to Gemini.',
      'Gemini must return JSON with exact source evidence for every answer.',
      'The validator rejects malformed grammar, duplicated options, vague stems, OCR garbage, repeated questions, and answers not supported by source text.',
      'Fallback questions are generated only from verified source sentences, never from guesses.',
    ],
    tips: [
      'If a PDF fails, the source text is usually too short, scanned poorly, or semantically mixed.',
      'Use topic focus to guide the model toward one chapter section.',
      'Hard mode works best when the source has enough explanation, examples, and cause-effect statements.',
    ],
  },
  {
    id: 'arena',
    title: 'Realtime Arena Guide',
    subtitle: 'Room sync, projector timing, answer reveal, and leaderboard flow.',
    icon: Radio,
    steps: [
      'Rooms sync through Supabase Realtime channels and periodic visible-tab resync.',
      'Mentor controls advance the canonical room state: lobby, question active, buzz locked, evaluation, results, leaderboard.',
      'Projector mode is a fullscreen audience screen. It shows the question, timer, buzz order, score motion, and results without admin controls.',
      'Students do not receive the correct answer during the timer or answer phase.',
      'Correct options reveal only in results, leaderboard, or finished states.',
      'Leaderboard exports include participant names, ranks, scores, timestamps, and accuracy/streak fields where available.',
    ],
    tips: [
      'Use one projector tab and one mentor tab for clean control.',
      'Keep the room open until exports and badges are downloaded.',
      'Run the latest Supabase migration so realtime tables publish full row updates.',
    ],
  },
  {
    id: 'account-recovery',
    title: 'Account Recovery (Forgot Password)',
    subtitle: 'Reset your mentor password with a 8-digit email OTP.',
    icon: Lock,
    steps: [
      'On the login page, click the "FORGOT PASSWORD?" link below the password field.',
      'Enter your registered operator email and click SEND RECOVERY CODE.',
      'Supabase sends a 8-digit code to your email — check inbox and spam. The code expires in 60 minutes.',
      'Enter the 8 digits in the individual boxes (paste supported). Click VERIFY CODE.',
      'Set a new password (minimum 8 characters). Both fields must match.',
      'Click SET NEW PASSWORD. You see ACCESS RESTORED and are redirected automatically.',
      'If the code expired, use the RESEND CODE button after the 60-second cooldown.',
    ],
    tips: [
      'Free Supabase email has a rate limit of ~4 OTPs per hour — avoid requesting repeatedly.',
      'Using a custom SMTP in Supabase removes rate limits and speeds up delivery.',
      'The code is single-use. Requesting a new code invalidates the previous one.',
    ],
  },
  {
    id: 'pdf-projector',
    title: 'PDF Presentation Mode',
    subtitle: 'Project any PDF live to all participants without generating MCQs.',
    icon: PresentationIcon,
    steps: [
      'Open your arena room as mentor. Click the PDF MODE button in the top header.',
      'Select a PDF file (max 50 MB). BuzzNexus converts each page to a high-resolution image server-side.',
      'Once uploaded, the PDF Projector opens fullscreen with the first page displayed.',
      'Navigate with ← → arrow keys, SPACE bar, or the Prev/Next buttons. Click thumbnails to jump.',
      'Every page change syncs in real-time to the Projector screen and all participant join pages via Supabase Realtime.',
      'Press F or click the fullscreen button for fullscreen mode. Press Escape to exit.',
      'Click EXIT PDF MODE to return to the quiz arena and clear the PDF from the room.',
    ],
    tips: [
      'Initial upload may take 10–60 seconds depending on page count — pages are cached as images.',
      'Open the Projector tab on the classroom display before starting PDF Mode for seamless switching.',
      'Participants on the join page see the current PDF page update in real-time.',
    ],
  },
  {
    id: 'semantic-grounding',
    title: 'AI Semantic Retrieval Grounding',
    subtitle: 'How BuzzNexus prevents hallucinated and off-topic MCQs.',
    icon: Sparkles,
    steps: [
      'After extracting and cleaning source text, BuzzNexus divides it into semantic chunks of up to 8,500 characters.',
      'Each chunk is tokenized and converted to a TF-IDF vector (term frequency × inverse document frequency).',
      'A query vector is built from your topic focus, document title, and detected chunk topics.',
      'Cosine similarity is computed between the query vector and every chunk vector to rank relevance.',
      'Only chunks above the relevance threshold (score > 0.04) are fully allocated for question generation.',
      'Non-relevant chunks have their question allocation reduced by 1, preventing off-topic MCQs.',
      'The final API response includes a semanticGrounding field showing how many chunks were used.',
    ],
    tips: [
      'Setting a specific Topic Focus dramatically improves retrieval — e.g. "cell membrane" not just "biology".',
      'Longer documents benefit most from semantic grounding since it filters irrelevant chapters.',
      'If questions seem off-topic, the source PDF may mix multiple unrelated subjects — split into separate files.',
    ],
  },
  {
    id: 'quiz-quality',
    title: 'Quiz Quality Guide',
    subtitle: 'Practical tips to get the best MCQs from your source material.',
    icon: KeyRound,
    steps: [
      'Use text-based PDFs, DOCX, or TXT files for best extraction. Avoid low-resolution scanned images.',
      'Keep source files focused: one topic per file. Mixed chapters produce mixed-quality questions.',
      'Set difficulty to Easy for recall, Medium for application, Hard for analytical Bloom\'s taxonomy.',
      'Use Topic Focus to guide semantic retrieval toward a specific section of a large document.',
      'Set Creativity to 0–10% for factual exams, 30–50% for diverse discussion questions.',
      'If fewer questions than requested are returned, the source lacked enough evidence — never a bug.',
      'Answer distractors are automatically checked: no "None of the above", same-category alternatives only.',
    ],
    tips: [
      'A focused 3–10 page document on one topic consistently produces 10–15 high-quality MCQs.',
      'Hard mode requires cause-effect, process, and analytical content in the source — not just definitions.',
      'Remove answer keys and solution pages from PDFs before uploading to prevent corrupted questions.',
    ],
  },
];

export default function HelpPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['mentor', 'account-recovery', 'pdf-projector', 'semantic-grounding']));

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((section) =>
      [section.title, section.subtitle, ...section.steps, ...section.tips]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      <NeonBackground />

      <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#FF4DCA]/60 hover:text-[#FF4DCA] text-xs font-mono transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              BACK
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#8B5CF6]/60 hover:text-[#8B5CF6] text-xs font-mono transition-all"
            >
              <Gamepad2 className="w-4 h-4" />
              DASHBOARD
            </button>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#FF4DCA]/70"
            />
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="mb-8 rounded-2xl border border-[#8B5CF6]/25 bg-neutral-950/65 backdrop-blur-xl p-6 sm:p-8 shadow-[0_0_40px_rgba(139,92,246,0.12)]"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FF4DCA]/10 border border-[#FF4DCA]/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-[#FF4DCA]" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#8B5CF6] mb-2">
                BuzzNexus Field Manual
              </p>
              <h1 className="font-orbitron font-black text-3xl sm:text-5xl tracking-wide text-white">
                Run AI quiz arenas with confidence
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 mt-4 max-w-3xl leading-relaxed">
                A beginner-friendly guide for mentors and students covering uploads, verified AI
                question generation, realtime gameplay, projector timing, exports, and badge flow.
              </p>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4 space-y-3">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setOpenIds((prev) => new Set(prev).add(section.id));
                    document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-800 bg-neutral-950/55 hover:border-[#FF4DCA]/50 hover:bg-[#FF4DCA]/5 text-left transition-all"
                >
                  <Icon className="w-5 h-5 text-[#FF4DCA]" />
                  <div>
                    <div className="font-orbitron text-sm font-bold text-white">{section.title}</div>
                    <div className="text-[10px] text-neutral-500 line-clamp-1">{section.subtitle}</div>
                  </div>
                </button>
              );
            })}

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
              <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs uppercase tracking-widest mb-2">
                <HelpCircle className="w-4 h-4" />
                Quick Rule
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Clean source in, clean questions out. If BuzzNexus warns about scanned or low text,
                reduce the count or upload a clearer file.
              </p>
            </div>
          </aside>

          <section className="lg:col-span-8 space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredSections.map((section, sectionIndex) => {
                const Icon = section.icon;
                const isOpen = openIds.has(section.id);
                return (
                  <motion.article
                    layout
                    id={section.id}
                    key={section.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ delay: sectionIndex * 0.03 }}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/70 backdrop-blur-xl overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(section.id)}
                      className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/35 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-[#8B5CF6]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-orbitron font-bold text-lg text-white">{section.title}</h2>
                        <p className="text-xs text-neutral-500 mt-1">{section.subtitle}</p>
                      </div>
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
                        <ChevronDown className="w-5 h-5 text-neutral-500" />
                      </motion.div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 grid gap-4">
                            <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
                              <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF4DCA] mb-3">
                                Walkthrough
                              </div>
                              <ol className="space-y-3">
                                {section.steps.map((step, index) => (
                                  <li key={step} className="flex gap-3 text-sm text-neutral-300 leading-relaxed">
                                    <span className="w-6 h-6 rounded-lg bg-[#FF4DCA]/10 border border-[#FF4DCA]/30 text-[#FF4DCA] font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                      {index + 1}
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {section.tips.map((tip) => (
                                <div
                                  key={tip}
                                  className="rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 p-3 text-xs text-neutral-400 leading-relaxed"
                                >
                                  {tip}
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.article>
                );
              })}
            </AnimatePresence>

            {filteredSections.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 p-8 text-center">
                <Search className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
                <p className="text-sm font-mono text-neutral-500">No help sections matched your search.</p>
              </div>
            )}
          </section>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { label: 'Upload', icon: UploadCloud },
            { label: 'Projector', icon: Monitor },
            { label: 'Buzz', icon: Zap },
            { label: 'Export', icon: Download },
            { label: 'Scores', icon: Trophy },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 flex items-center gap-3"
              >
                <Icon className="w-5 h-5 text-[#FF4DCA]" />
                <span className="font-mono text-xs text-neutral-300 uppercase tracking-widest">{item.label}</span>
              </div>
            );
          })}
        </motion.div>

        <div className="mt-8 flex justify-center">
          <CyberButton variant="pink" onClick={() => router.push('/dashboard')}>
            OPEN DASHBOARD
          </CyberButton>
        </div>
      </main>
    </div>
  );
}

