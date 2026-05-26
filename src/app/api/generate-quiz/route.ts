import { NextResponse } from 'next/server';
import { semanticChunkText, allocateQuestionsAcrossChunks } from '@/lib/chunking';
import {
  filterValidQuestions,
  normalizeQuestion,
  type QuizQuestion,
} from '@/lib/questionValidator';
import {
  hasGeminiKey,
  generateQuestionsFromChunk,
  verifyMcqAnswers,
  shouldVerifyMcqAnswers,
  isGeminiQuotaError,
  geminiQuotaUserMessage,
  resetGeminiQuotaFlag,
  isGeminiQuotaExhausted,
  type Difficulty,
  type QuizFormat,
} from '@/lib/gemini';
import { extractTextFromFileDetailed } from '@/lib/pdfExtract';
import { fillQuizGapsFromText } from '@/lib/fillQuizGaps';
import { extractEducationalConcepts, extractEducationalSentences } from '@/lib/concepts';
import { rankChunksByRelevance, filterTopChunks } from '@/lib/semanticRetrieval';

export const maxDuration = 300;

const MIN_GENERATABLE_TEXT = 120;

function recommendedQuestionCount(requested: number, sourceText: string, qualityScore: number): number {
  const educationalSentences = extractEducationalSentences(sourceText, requested * 3);
  const sentenceBasedLimit = Math.max(1, Math.floor(educationalSentences.length * 0.75));
  const qualityBasedLimit =
    qualityScore < 80
      ? Math.min(requested, 5)
      : qualityScore < 140
        ? Math.min(requested, 10)
        : requested;
  return Math.max(1, Math.min(requested, sentenceBasedLimit, qualityBasedLimit));
}

function parseFormat(value: FormDataEntryValue | null): QuizFormat {
  const raw = String(value || 'mcq');
  return raw === 'mixed' || raw === 'fill_blank' || raw === 'descriptive' ? raw : 'mcq';
}

function parseDifficulty(value: FormDataEntryValue | null): Difficulty {
  const raw = String(value || 'medium');
  return raw === 'easy' || raw === 'hard' ? raw : 'medium';
}

function rawToValid(
  raw: Record<string, unknown>[],
  format: QuizFormat,
  timerDefault: number,
  maxCount: number,
  sourceText: string
): QuizQuestion[] {
  const normalized = raw
    .map((item) => normalizeQuestion(item, format, timerDefault))
    .filter((q): q is QuizQuestion => q !== null);
  return filterValidQuestions(normalized, maxCount, sourceText);
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || 'Quiz';
    const questionCount = Math.min(
      Math.max(parseInt((formData.get('questionCount') as string) || '5', 10), 1),
      100
    );
    const format = parseFormat(formData.get('format'));
    const difficulty = parseDifficulty(formData.get('difficulty'));
    const category = (formData.get('category') as string) || '';
    const educationalLevel = (formData.get('educationalLevel') as string) || '';
    const creativity = Math.min(
      0.35,
      Math.max(0, parseFloat((formData.get('creativity') as string) || '0.2'))
    );
    const timerDefault = Math.min(
      180,
      Math.max(10, parseInt((formData.get('timerDefault') as string) || '30', 10))
    );

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    resetGeminiQuotaFlag();

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractTextFromFileDetailed(buffer, file.type, file.name);
    const sourceText = extraction.text;
    const warnings = [...extraction.warnings];

    if (sourceText.length < MIN_GENERATABLE_TEXT) {
      return NextResponse.json(
        {
          error: 'This PDF appears scanned or contains insufficient readable text.',
          warning:
            'This PDF appears scanned or contains insufficient readable text. Upload a text-based PDF, DOCX, TXT, or a clearer scan.',
          textChars: sourceText.length,
          extraction,
        },
        { status: 422 }
      );
    }

    const effectiveQuestionCount = recommendedQuestionCount(
      questionCount,
      sourceText,
      extraction.quality.qualityScore
    );

    if (effectiveQuestionCount < questionCount) {
      warnings.push(
        `Source quality supports about ${effectiveQuestionCount} reliable question${effectiveQuestionCount === 1 ? '' : 's'}, so BuzzNexus reduced the count instead of hallucinating.`
      );
    }

    const chunks = semanticChunkText(sourceText, {
      maxChars: 6500,
      minChars: 700,
      overlapParagraphs: 1,
      topicFocus: category,
    }).slice(0, 12);

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error: 'The extracted text did not contain enough educational context to build reliable questions.',
          warning:
            'This PDF appears scanned or contains insufficient readable text. Try a clearer source file.',
          textChars: sourceText.length,
          extraction,
        },
        { status: 422 }
      );
    }

    const allocatedChunks = allocateQuestionsAcrossChunks(chunks, effectiveQuestionCount);

    // ── Semantic Retrieval Grounding ────────────────────────────────────────
    // Build a retrieval query from topic, title, and top chunk topics, then
    // rank all chunks by TF-IDF cosine similarity. Questions are generated
    // first from the most semantically relevant chunks, and non-relevant chunks
    // have their allocation reduced by 1 to prevent hallucinated MCQs.
    const retrievalQuery = [category, title, ...chunks.slice(0, 4).map((c) => c.topic)]
      .filter(Boolean)
      .join(' ');
    const rankedByRelevance = rankChunksByRelevance(chunks, retrievalQuery);
    const topGroundedChunks = filterTopChunks(rankedByRelevance, 0.04);
    const groundedChunkIds = new Set(topGroundedChunks.map((r) => r.chunk.id));

    const groundedAllocated = allocatedChunks
      .map((chunk) => ({
        ...chunk,
        // Reduce allocation for chunks not semantically grounded in the query
        questionCount: groundedChunkIds.has(chunk.id)
          ? chunk.questionCount
          : Math.max(0, chunk.questionCount - 1),
      }))
      .filter((chunk) => chunk.questionCount > 0);
    // ── End Semantic Retrieval Grounding ───────────────────────────────────
    const allRaw: Record<string, unknown>[] = [];
    let mode: 'gemini_chunks' | 'source_fallback' | 'mixed' = 'source_fallback';

    if (hasGeminiKey()) {
      for (const chunk of groundedAllocated) {
        if (allRaw.length >= effectiveQuestionCount || isGeminiQuotaExhausted()) break;
        const concepts = extractEducationalConcepts(chunk.text, 14);
        const evidence = extractEducationalSentences(chunk.text, 10);
        const raw = await generateQuestionsFromChunk({
          chunkText: chunk.text,
          questionCount: Math.min(chunk.questionCount + 1, effectiveQuestionCount - allRaw.length),
          format,
          difficulty,
          category,
          creativity,
          title,
          educationalLevel,
          conceptHints: concepts.map((concept) => concept.term),
          evidenceHints: evidence.map((item) => item.sentence),
          chunkIndex: chunk.index + 1,
          totalChunks: chunks.length,
          excludeStems: allRaw.map((item) => String(item.question_text || item.question || '')),
        });
        allRaw.push(...raw);
      }
    } else {
      warnings.push('GEMINI_API_KEY is not set; generated a source-only fallback quiz.');
    }

    let valid = rawToValid(allRaw, format, timerDefault, effectiveQuestionCount, sourceText);
    if (valid.length > 0) mode = 'gemini_chunks';

    if (
      format !== 'descriptive' &&
      valid.some((q) => q.question_type === 'mcq') &&
      shouldVerifyMcqAnswers() &&
      !isGeminiQuotaExhausted()
    ) {
      const mcqIndexes = valid
        .map((q, index) => ({ q, index }))
        .filter(({ q }) => q.question_type === 'mcq');
      const verified = await verifyMcqAnswers(
        mcqIndexes.map(({ q }) => ({
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
        })),
        { sourceText }
      );
      valid = valid.map((question, index) => {
        const mcqPosition = mcqIndexes.findIndex((item) => item.index === index);
        if (mcqPosition === -1) return question;
        return {
          ...question,
          correct_answer: verified[mcqPosition]?.correct_answer ?? question.correct_answer,
        };
      });
      valid = rawToValid(
        valid.map((q) => ({ ...q } as Record<string, unknown>)),
        format,
        timerDefault,
        effectiveQuestionCount,
        sourceText
      );
    }

    if (valid.length < effectiveQuestionCount) {
      const filled = fillQuizGapsFromText(
        valid,
        sourceText,
        effectiveQuestionCount,
        format,
        difficulty,
        timerDefault
      );
      if (filled.filled > 0) {
        mode = valid.length > 0 ? 'mixed' : 'source_fallback';
        warnings.push(
          `Generated ${filled.filled} source-only fallback question${filled.filled === 1 ? '' : 's'} from verified extracted text.`
        );
      }
      valid = filled.questions;
    }

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: isGeminiQuotaExhausted()
            ? `${geminiQuotaUserMessage()} No reliable fallback questions could be created from the extracted text.`
            : 'No reliable, source-supported questions could be created from this file.',
          warning:
            extraction.quality.isScannedLike || extraction.quality.isLowText
              ? 'This PDF appears scanned or contains insufficient readable text.'
              : undefined,
          debug: {
            rawCount: allRaw.length,
            textLen: sourceText.length,
            chunks: chunks.length,
            mode,
            quality: extraction.quality,
          },
        },
        { status: isGeminiQuotaExhausted() ? 429 : 422 }
      );
    }

    if (valid.length < effectiveQuestionCount) {
      warnings.push(
        `Only ${valid.length} of ${effectiveQuestionCount} reliable questions passed strict source verification.`
      );
    }

    return NextResponse.json({
      success: true,
      quiz: valid.map((q, idx) => ({ ...q, order_index: idx })),
      fallbackUsed: mode !== 'gemini_chunks',
      isMock: mode !== 'gemini_chunks',
      mode,
      title,
      requested: questionCount,
      effectiveRequested: effectiveQuestionCount,
      generated: valid.length,
      rawFromAi: allRaw.length,
      textChars: sourceText.length,
      chunks: chunks.length,
      extractionMethod: extraction.extractionMethod,
      usedOcr: extraction.usedOcr,
      quality: extraction.quality,
      semanticGrounding: {
        totalChunks: chunks.length,
        rankedChunks: rankedByRelevance.length,
        groundedChunks: topGroundedChunks.length,
        retrievalQuery: retrievalQuery.substring(0, 120),
      },
      warning: warnings[0],
      warnings: [...new Set(warnings)],
      quotaExhausted: isGeminiQuotaExhausted(),
      verifyMcq: shouldVerifyMcqAnswers(),
    });
  } catch (error: unknown) {
    console.error('Quiz generation error:', error);
    if (isGeminiQuotaError(error)) {
      return NextResponse.json({ error: geminiQuotaUserMessage() }, { status: 429 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
