'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  UploadCloud, FileText, Loader2, CheckCircle, Database,
  Download, FileDown, Trash2, Camera, X, ChevronRight, ChevronLeft,
  Sparkles, AlertCircle, CheckSquare, Square
} from 'lucide-react';
import CyberButton from './ui/CyberButton';
import { deleteMentorQuiz } from '@/lib/mentorDelete';
import { downloadQuizPdfFile } from '@/lib/quizPdfDownload';
import { ensureMentorProfile } from '@/lib/ensureProfile';
import { formatUserError } from '@/lib/formatError';

interface QuizGeneratorProps {
  mentorId: string;
}

type Step = 1 | 2 | 3;

export default function QuizGenerator({ mentorId }: QuizGeneratorProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [format, setFormat] = useState<'mcq' | 'mixed' | 'fill_blank' | 'descriptive'>('mcq');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timerDefault, setTimerDefault] = useState(30);
  const [category, setCategory] = useState('');
  const [educationalLevel, setEducationalLevel] = useState('College');
  const [creativity, setCreativity] = useState(0.2);
  const [selectedQuizIds, setSelectedQuizIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [quizzes, setQuizzes] = useState<Array<{
    id: string;
    title: string;
    created_at: string;
    questions?: [{ count: number }];
  }>>([]);
  const [previewText, setPreviewText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchQuizzes = useCallback(async () => {
    if (!mentorId) return;
    const { data } = await supabase
      .from('quizzes')
      .select('*, questions(count)')
      .eq('mentor_id', mentorId)
      .order('created_at', { ascending: false });
    if (data) setQuizzes(data);
  }, [mentorId]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    // Auto-fill title from filename if empty
    if (!title) {
      const baseName = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      setTitle(baseName.substring(0, 60));
    }
    // Show preview for text files
    if (selectedFile.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewText((e.target?.result as string).substring(0, 300));
      reader.readAsText(selectedFile);
    } else {
      setPreviewText('');
    }
  };

  const toggleQuizSelect = (id: string) => {
    setSelectedQuizIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllQuizzes = () => {
    if (selectedQuizIds.size === quizzes.length) {
      setSelectedQuizIds(new Set());
    } else {
      setSelectedQuizIds(new Set(quizzes.map((q) => q.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuizIds.size === 0) return;
    if (!confirm(`Delete ${selectedQuizIds.size} selected quiz(zes)?`)) return;
    const ids = [...selectedQuizIds];
    setDeletingId('bulk');
    const failed: string[] = [];
    for (const id of ids) {
      const { ok, error: deleteError } = await deleteMentorQuiz(id);
      if (!ok) failed.push(deleteError || id);
    }
    if (failed.length === 0) {
      setQuizzes((prev) => prev.filter((q) => !selectedQuizIds.has(q.id)));
      setSelectedQuizIds(new Set());
    } else {
      await fetchQuizzes();
      alert(
        failed.length === ids.length
          ? failed[0]
          : `Some quizzes could not be deleted (${failed.length}/${ids.length}). List refreshed.`
      );
    }
    setDeletingId(null);
  };

  const handleBulkArchive = async () => {
    if (selectedQuizIds.size === 0) return;
    setDeletingId('archive');
    const { data, error } = await supabase.rpc('set_quiz_archive_state', {
      p_quiz_ids: [...selectedQuizIds],
      p_archived: true,
    });
    if (error || !(data as { success?: boolean } | null)?.success) {
      alert(
        error?.message ||
          'Archive failed. Run migration_v6_pipeline_realtime.sql in Supabase, then try again.'
      );
    } else {
      setQuizzes((prev) => prev.filter((q) => !selectedQuizIds.has(q.id)));
      setSelectedQuizIds(new Set());
    }
    setDeletingId(null);
  };

  const handleBulkExport = async () => {
    if (selectedQuizIds.size === 0) return;
    const ids = [...selectedQuizIds];
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*, quizzes(title)')
      .in('quiz_id', ids)
      .order('quiz_id')
      .order('order_index');

    if (questionsError) {
      alert(questionsError.message);
      return;
    }

    const content = ids
      .map((id) => {
        const quiz = quizzes.find((q) => q.id === id);
        const quizQuestions = (questions || []).filter((q) => q.quiz_id === id);
        const lines = [`QUIZ: ${quiz?.title || id}`, '='.repeat(64), ''];
        quizQuestions.forEach((q, index) => {
          lines.push(`${index + 1}. ${q.question_text}`);
          (q.options || []).forEach((opt: string, optIndex: number) => {
            lines.push(`   ${String.fromCharCode(65 + optIndex)}. ${opt}`);
          });
          lines.push(`   ANSWER: ${q.correct_answer}`, '');
        });
        return lines.join('\n');
      })
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buzznexus_quizzes_${ids.length}_export.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('Delete this quiz? This cannot be undone.')) return;
    setDeletingId(quizId);
    const { ok, error: deleteError } = await deleteMentorQuiz(quizId);
    if (ok) {
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      setSelectedQuizIds((prev) => {
        const next = new Set(prev);
        next.delete(quizId);
        return next;
      });
    } else {
      alert(deleteError || 'Failed to delete quiz.');
    }
    setDeletingId(null);
  };

  const downloadPDF = async (quizId: string, quizTitle: string) => {
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index');
      if (error) throw error;
      if (!questions || questions.length === 0) {
        alert('No questions in this quiz to export.');
        return;
      }
      await downloadQuizPdfFile(quizTitle, questions);
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to generate PDF. Ensure pdfkit is installed (npm install).'
      );
    }
  };

  const downloadTXT = async (quizId: string, quizTitle: string) => {
    try {
      const { data: questions } = await supabase
        .from('questions').select('*').eq('quiz_id', quizId).order('order_index');
      if (!questions || questions.length === 0) return;

      let content = `QUIZ: ${quizTitle}\n`;
      content += `Generated: ${new Date().toLocaleDateString()}\n`;
      content += '='.repeat(60) + '\n\n';

      questions.forEach((q, i) => {
        content += `${i + 1}. ${q.question_text}\n`;
        if (q.options && q.options.length > 0) {
          q.options.forEach((opt: string, j: number) => {
            content += `   ${String.fromCharCode(65 + j)}. ${opt}\n`;
          });
        }
        content += `   ANSWER: ${q.correct_answer}\n\n`;
      });

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quizTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_quiz.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download TXT.');
    }
  };

  const handleGenerate = async () => {
    if (!title.trim() || !file) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      let publicUrl: string | null = null;
      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${mentorId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        if (!uploadError) {
          publicUrl = supabase.storage.from('documents').getPublicUrl(filePath).data.publicUrl;
        }
      } catch {
        /* storage optional — quiz generation still works */
      }

      // Call generate-quiz API (clean extraction -> semantic chunks -> verified questions)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('questionCount', questionCount.toString());
      formData.append('format', format);
      formData.append('difficulty', difficulty);
      formData.append('timerDefault', timerDefault.toString());
      formData.append('category', category);
      formData.append('educationalLevel', educationalLevel);
      formData.append('creativity', creativity.toString());

      const res = await fetch('/api/generate-quiz', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok) {
        const hint =
          res.status === 503
            ? ' Add GEMINI_API_KEY to .env.local and restart npm run dev.'
            : res.status === 429
              ? ' See Google AI Studio usage / billing.'
              : '';
        throw new Error((json.error || 'Failed to generate quiz') + hint);
      }
      const generatedQuestions = json.quiz;

      if (!Array.isArray(generatedQuestions) || generatedQuestions.length === 0) {
        throw new Error('AI returned an empty quiz. Try fewer questions or a clearer PDF.');
      }

      const profileCheck = await ensureMentorProfile({
        id: mentorId,
        email: undefined,
      });
      if (!profileCheck.ok) {
        throw new Error(
          `Profile setup failed: ${profileCheck.error} ` +
            'Open Supabase → SQL Editor → run migration_v5_profiles.sql → log out → log in.'
        );
      }

      if (generatedQuestions.length < questionCount) {
        const rawNote =
          typeof json.rawFromAi === 'number' ? ` (AI returned ${json.rawFromAi}, ${generatedQuestions.length} passed checks)` : '';
        setSuccessMsg(
          `Created ${generatedQuestions.length} of ${questionCount} verified questions${rawNote}. ${json.warning || 'Try a clearer source if you need the full count.'}`
        );
      }

      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          mentor_id: mentorId,
          title: title.trim(),
          source_document_url: publicUrl,
        })
        .select()
        .single();

      if (quizError) {
        throw new Error(
          `Could not save quiz: ${quizError.message}${quizError.hint ? ` — ${quizError.hint}` : ''}`
        );
      }

      // Save questions
      const questionsToInsert = generatedQuestions.map((q, idx) => ({
        quiz_id: quizData.id,
        question_text: q.question_text,
        question_type: q.question_type || format,
        options: q.options || [],
        correct_answer: q.correct_answer,
        time_limit: q.time_limit || 30,
        order_index: idx,
        metadata: q.metadata || {},
      }));

      const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
      if (qError) {
        throw new Error(
          `Could not save questions: ${qError.message}${qError.hint ? ` — ${qError.hint}` : ''}`
        );
      }

      const modeLabel =
        json.mode === 'gemini_chunks'
          ? 'verified AI chunk analysis'
          : json.mode === 'mixed'
            ? 'verified AI + source fallback'
            : 'source-only fallback';
      const countNote =
        json.requested && json.generated < json.requested
          ? ` (${json.generated}/${json.requested} passed quality check)`
          : '';
      setSuccessMsg(
        `${generatedQuestions.length} questions ready - ${modeLabel}${countNote}${json.warning ? ` - ${json.warning}` : ''}`
      );
      setTitle('');
      setFile(null);
      setPreviewText('');
      setStep(1);
      fetchQuizzes();
    } catch (err: unknown) {
      setError(formatUserError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Please enter a quiz title.'); return; }
    if (!file) { setError('Please upload a document.'); return; }
    setError('');
    setStep(2);
  };

  const formatLabel = {
    mcq: { label: 'MCQ Quiz', desc: 'Multiple choice, 4 options each', icon: 'MCQ' },
    mixed: { label: 'Mixed Mode', desc: 'Mostly MCQ with a few typed prompts', icon: 'MIX' },
    fill_blank: { label: 'Fill in the Blanks', desc: 'Complete the missing term', icon: 'TXT' },
    descriptive: { label: 'Q & A', desc: 'Open-ended answers, mentor grades', icon: 'Q&A' },
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-2">
        {([1, 2] as const).map((s) => (
          <React.Fragment key={s}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all ${
              step >= s
                ? 'bg-[#FF4DCA] text-black shadow-[0_0_10px_rgba(255,77,202,0.4)]'
                : 'bg-neutral-800 text-neutral-500'
            }`}>{s}</div>
            {s < 2 && <div className={`flex-1 h-px transition-all ${step > s ? 'bg-[#FF4DCA]' : 'bg-neutral-800'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload + Title */}
      {step === 1 && (
        <form onSubmit={handleNextStep} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Quiz Title
            </label>
            <input
              type="text" required maxLength={80}
              className="w-full bg-neutral-950/60 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF4DCA] transition-colors"
              placeholder="e.g. Chapter 4: Photosynthesis"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA] flex items-center gap-1.5">
              <UploadCloud className="w-3.5 h-3.5" /> Source Document
            </label>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files[0];
                if (dropped) handleFileSelect(dropped);
              }}
              className={`relative group border-2 border-dashed rounded-xl transition-all ${
                isDragging
                  ? 'border-[#FF4DCA] bg-[#FF4DCA]/10'
                  : file
                    ? 'border-[#FF4DCA]/40 bg-[#FF4DCA]/5'
                    : 'border-neutral-700 bg-neutral-950/30 hover:border-neutral-500'
              }`}
            >
              <input
                type="file"
                accept=".txt,.pdf,.docx,image/*"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="p-6 flex flex-col items-center justify-center gap-2">
                {file ? (
                  <>
                    <CheckCircle className="w-7 h-7 text-[#FF4DCA]" />
                    <p className="text-sm text-white font-mono font-bold">{file.name}</p>
                    <p className="text-[10px] text-neutral-500">
                      {(file.size / 1024).toFixed(1)} KB • {file.type || 'unknown type'}
                    </p>
                    {previewText && (
                      <p className="text-[10px] text-neutral-600 mt-1 italic max-w-full truncate">
                        &quot;{previewText}...&quot;
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setPreviewText(''); }}
                      className="text-[10px] text-red-400 hover:text-red-300 font-mono mt-1 flex items-center gap-1 z-20 relative"
                    >
                      <X className="w-3 h-3" /> Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                    <p className="text-xs font-mono text-neutral-400">Drag & drop or click to select</p>
                    <p className="text-[10px] font-mono text-neutral-600">PDF - DOCX - TXT - PNG - JPG - WEBP</p>
                  </>
                )}
              </div>
            </div>

            {/* Camera capture option */}
            <label className="flex items-center gap-2 text-[10px] font-mono text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors w-fit">
              <input
                type="file" accept="image/*" capture="environment"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
              <Camera className="w-3.5 h-3.5" /> Or use camera to capture
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <CyberButton variant="pink" type="submit" className="w-full justify-center">
            CONFIGURE FORMAT <ChevronRight className="w-4 h-4" />
          </CyberButton>
        </form>
      )}

      {/* Step 2: Format + Count */}
      {step === 2 && (
        <div className="space-y-5">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-[10px] text-neutral-500 hover:text-white font-mono transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>

          <div className="p-3 bg-neutral-900/60 rounded-lg border border-neutral-800">
            <div className="text-[10px] text-neutral-500 font-mono mb-1">Source:</div>
            <div className="text-sm text-white font-bold truncate">{file?.name}</div>
            <div className="text-[10px] text-[#FF4DCA] font-mono mt-0.5 truncate">{title}</div>
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Question Format
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(formatLabel) as [keyof typeof formatLabel, typeof formatLabel[keyof typeof formatLabel]][]).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    format === key
                      ? 'border-[#FF4DCA] bg-[#FF4DCA]/10 shadow-[0_0_10px_rgba(255,77,202,0.15)]'
                      : 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{val.icon}</span>
                    <div>
                      <div className={`text-sm font-bold font-mono ${format === key ? 'text-[#FF4DCA]' : 'text-white'}`}>
                        {val.label}
                      </div>
                      <div className="text-[10px] text-neutral-500">{val.desc}</div>
                    </div>
                    {format === key && (
                      <CheckCircle className="w-4 h-4 text-[#FF4DCA] ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                Questions (1–100)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                  className="flex-1 accent-violet-500"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) =>
                    setQuestionCount(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-14 text-center bg-neutral-950 border border-neutral-800 rounded py-1 text-sm font-orbitron text-violet-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-2 text-sm text-white"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                Timer (sec)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={timerDefault}
                onChange={(e) => setTimerDefault(parseInt(e.target.value, 10) || 30)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-2 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                Topic / Category (optional)
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Photosynthesis, Chapter 4"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                Educational Level
              </label>
              <select
                value={educationalLevel}
                onChange={(e) => setEducationalLevel(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-2 text-sm text-white"
              >
                <option value="Middle school">Middle school</option>
                <option value="High school">High school</option>
                <option value="College">College</option>
                <option value="Professional training">Professional training</option>
              </select>
            </div>

            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300">
                AI Creativity - {Math.round(creativity * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={0.35}
                step={0.05}
                value={creativity}
                onChange={(e) => setCreativity(parseFloat(e.target.value))}
                className="w-full accent-pink-500"
              />
              <p className="text-[9px] text-neutral-500 font-mono">
                Factual sources: keep this low for best answer accuracy.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <CyberButton
            variant="pink"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                PARSING & GENERATING...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                GENERATE {questionCount} QUESTIONS
              </>
            )}
          </CyberButton>

          {loading && (
            <p className="text-[10px] text-neutral-500 font-mono text-center animate-pulse">
              Reading document content and generating unique questions...
            </p>
          )}
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-lg">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {successMsg}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-neutral-800" />

      {/* Quiz Inventory */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="text-[10px] uppercase font-mono tracking-widest text-violet-300 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> QUIZ INVENTORY ({quizzes.length})
          </label>
          {quizzes.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllQuizzes}
              className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 hover:text-[#FF4DCA] transition-colors"
            >
              {selectedQuizIds.size === quizzes.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-[#FF4DCA]" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {selectedQuizIds.size === quizzes.length ? 'DESELECT ALL' : 'SELECT ALL'}
            </button>
          )}
        </div>

        {selectedQuizIds.size > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleBulkExport}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-blue-500/40 bg-blue-950/30 text-blue-300 text-[10px] font-mono font-bold hover:bg-blue-950/50 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              EXPORT
            </button>
            <button
              type="button"
              onClick={handleBulkArchive}
              disabled={deletingId === 'archive'}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-violet-500/40 bg-violet-950/30 text-violet-300 text-[10px] font-mono font-bold hover:bg-violet-950/50 transition-all disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5" />
              ARCHIVE
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={deletingId === 'bulk'}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 text-[10px] font-mono font-bold hover:bg-red-950/50 transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              DELETE
            </button>
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
          {quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border border-dashed border-neutral-800 rounded-xl text-neutral-600">
              <Sparkles className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-xs font-mono">No quizzes generated yet</p>
            </div>
          ) : (
            quizzes.map((quiz) => {
              const qCount = quiz.questions?.[0]?.count || 0;
              return (
                <div
                  key={quiz.id}
                  className={`list-row-card p-3 rounded-xl group ${
                    selectedQuizIds.has(quiz.id) ? 'list-row-card-selected' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-center cursor-pointer shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={selectedQuizIds.has(quiz.id)}
                        onChange={() => toggleQuizSelect(quiz.id)}
                        className="sr-only"
                      />
                      {selectedQuizIds.has(quiz.id) ? (
                        <CheckSquare className="w-5 h-5 text-[#FF4DCA]" />
                      ) : (
                        <Square className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="font-orbitron font-bold text-sm text-white truncate">{quiz.title}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-mono text-[#8B5CF6]">
                          {qCount} question{qCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-600">
                          {new Date(quiz.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => downloadPDF(quiz.id, quiz.title)}
                        title="Download PDF"
                        className="p-1.5 rounded bg-blue-900/30 hover:bg-blue-900/60 text-blue-400 transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => downloadTXT(quiz.id, quiz.title)}
                        title="Download TXT"
                        className="p-1.5 rounded bg-emerald-900/30 hover:bg-emerald-900/60 text-emerald-400 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        disabled={deletingId === quiz.id}
                        title="Delete Quiz"
                        className="p-1.5 rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deletingId === quiz.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
