import { jsPDF } from 'jspdf';
import { parseQuestionOptions } from '@/lib/parseQuestionOptions';

export type QuizPdfRow = {
  question_text: string;
  question_type?: string;
  options?: unknown;
  correct_answer: string;
};

function buildQuizPdfClient(quizTitle: string, rows: QuizPdfRow[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxW = pageW - margin * 2;
  let y = 16;

  const newPageIfNeeded = (need: number) => {
    if (y + need > 280) {
      doc.addPage();
      y = 16;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(139, 92, 246);
  doc.text('BUZZNEXUS QUIZ', pageW / 2, y, { align: 'center' });
  y += 9;

  doc.setFontSize(14);
  doc.setTextColor(255, 77, 202);
  const titleLines = doc.splitTextToSize(quizTitle, maxW);
  doc.text(titleLines, pageW / 2, y, { align: 'center' });
  y += titleLines.length * 6 + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`${rows.length} questions • Student copy (answers on last page)`, pageW / 2, y, {
    align: 'center',
  });
  y += 10;

  rows.forEach((q, i) => {
    newPageIfNeeded(28);

    doc.setDrawColor(139, 92, 246);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y - 2, maxW, 4, 1, 1, 'S');
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${q.question_text}`, maxW);
    doc.text(qLines, margin, y);
    y += qLines.length * 5 + 3;

    const opts = parseQuestionOptions(q.options);
    if (opts.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      opts.forEach((opt, j) => {
        newPageIfNeeded(8);
        const lines = doc.splitTextToSize(`${String.fromCharCode(65 + j)}) ${opt}`, maxW - 4);
        doc.text(lines, margin + 4, y);
        y += lines.length * 4.5 + 1;
      });
    } else {
      newPageIfNeeded(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Answer: _________________________________________________', margin + 4, y);
      y += 8;
    }
    y += 6;
  });

  doc.addPage();
  y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(139, 92, 246);
  doc.text('ANSWER KEY', pageW / 2, y, { align: 'center' });
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  rows.forEach((q, i) => {
    newPageIfNeeded(10);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'bold');
    doc.text(`Q${i + 1}.`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 120, 70);
    const aLines = doc.splitTextToSize(q.correct_answer, maxW - 14);
    doc.text(aLines, margin + 12, y);
    y += Math.max(aLines.length * 4.5, 6) + 2;
  });

  return doc;
}

export function downloadQuizPdfClient(quizTitle: string, rows: QuizPdfRow[]): void {
  const doc = buildQuizPdfClient(quizTitle, rows);
  const safe = quizTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'quiz';
  doc.save(`${safe}_quiz.pdf`);
}

export async function downloadQuizPdfFile(quizTitle: string, rows: QuizPdfRow[]): Promise<void> {
  if (!rows.length) {
    throw new Error('No questions to export.');
  }
  downloadQuizPdfClient(quizTitle, rows);
}
