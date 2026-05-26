import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  cleanExtractedText,
  getTextQualityReport,
  isScannedPdfText,
  type TextQualityReport,
} from '@/lib/pdfCleaner';

export type ExtractionResult = {
  text: string;
  fileKind: 'pdf' | 'docx' | 'text' | 'image' | 'unknown';
  usedOcr: boolean;
  extractionMethod: string;
  quality: TextQualityReport;
  warnings: string[];
};

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const result = await pdfParse(buffer);
  return (result?.text as string) || '';
}

async function extractWithPdf2Json(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json');
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: { parserError: string }) => {
      reject(new Error(errData.parserError));
    });
    pdfParser.on('pdfParser_dataReady', () => {
      try {
        resolve(pdfParser.getRawTextContent() as string);
      } catch {
        reject(new Error('pdf2json parse failed'));
      }
    });
    pdfParser.parseBuffer(buffer);
  });
}

async function extractDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Tesseract = require('tesseract.js');
  const {
    data: { text },
  } = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {},
    tessedit_pageseg_mode: '1',
  });
  return text || '';
}

async function ocrPdfBuffer(buffer: Buffer): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'buzznexus-ocr-'));
  const pdfPath = path.join(tempRoot, 'source.pdf');
  const outPrefix = 'page';

  try {
    await fs.writeFile(pdfPath, buffer);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfPoppler = require('pdf-poppler') as {
      convert(
        file: string,
        options: {
          format: string;
          out_dir: string;
          out_prefix: string;
          page?: number | null;
          scale?: number;
        }
      ): Promise<void>;
    };

    await pdfPoppler.convert(pdfPath, {
      format: 'png',
      out_dir: tempRoot,
      out_prefix: outPrefix,
      page: null,
      scale: 1600,
    });

    const images = (await fs.readdir(tempRoot))
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .sort()
      .slice(0, 12);

    const pages: string[] = [];
    for (const image of images) {
      const imageBuffer = await fs.readFile(path.join(tempRoot, image));
      const pageText = cleanExtractedText(await ocrImageBuffer(imageBuffer));
      if (pageText) pages.push(pageText);
    }
    return pages.join('\n\n');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function extractTextFromPdfBufferDetailed(buffer: Buffer): Promise<ExtractionResult> {
  const attempts: Array<{ method: string; text: string }> = [];
  const warnings: string[] = [];

  try {
    attempts.push({ method: 'pdf-parse', text: cleanExtractedText(await extractWithPdfParse(buffer)) });
  } catch (err) {
    warnings.push(`pdf-parse failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  try {
    attempts.push({ method: 'pdf2json', text: cleanExtractedText(await extractWithPdf2Json(buffer)) });
  } catch (err) {
    warnings.push(`pdf2json failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  const bestAttempt = attempts
    .filter((attempt) => attempt.text.length > 0)
    .sort((a, b) => getTextQualityReport(b.text).qualityScore - getTextQualityReport(a.text).qualityScore)[0];

  let bestText = bestAttempt?.text || '';
  let method = bestAttempt?.method || 'none';
  let usedOcr = false;

  if (!bestText || bestText.length < 450 || isScannedPdfText(bestText)) {
    warnings.push('This PDF appears scanned or contains insufficient readable text.');
    try {
      const ocrText = cleanExtractedText(await ocrPdfBuffer(buffer));
      const currentScore = getTextQualityReport(bestText).qualityScore;
      const ocrScore = getTextQualityReport(ocrText).qualityScore;
      if (ocrText.length > bestText.length || ocrScore > currentScore) {
        bestText = ocrText;
        method = 'tesseract-ocr';
        usedOcr = true;
      }
    } catch (err) {
      warnings.push(
        `OCR fallback could not read this scanned PDF: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  const quality = getTextQualityReport(bestText);
  return {
    text: bestText,
    fileKind: 'pdf',
    usedOcr,
    extractionMethod: method,
    quality,
    warnings: [...new Set([...warnings, ...quality.warnings])],
  };
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const result = await extractTextFromPdfBufferDetailed(buffer);
  if (result.text.length < 25) {
    throw new Error('Could not extract enough readable text from this PDF.');
  }
  return result.text;
}

export async function extractTextFromFileDetailed(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<ExtractionResult> {
  const lower = fileName.toLowerCase();

  if (fileType === 'application/pdf' || lower.endsWith('.pdf')) {
    return extractTextFromPdfBufferDetailed(buffer);
  }

  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const text = cleanExtractedText(await extractDocx(buffer));
    const quality = getTextQualityReport(text);
    return {
      text,
      fileKind: 'docx',
      usedOcr: false,
      extractionMethod: 'mammoth',
      quality,
      warnings: quality.warnings,
    };
  }

  if (fileType === 'text/plain' || lower.endsWith('.txt')) {
    const text = cleanExtractedText(buffer.toString('utf-8'));
    const quality = getTextQualityReport(text);
    return {
      text,
      fileKind: 'text',
      usedOcr: false,
      extractionMethod: 'plain-text',
      quality,
      warnings: quality.warnings,
    };
  }

  if (fileType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower)) {
    const text = cleanExtractedText(await ocrImageBuffer(buffer));
    const quality = getTextQualityReport(text);
    return {
      text,
      fileKind: 'image',
      usedOcr: true,
      extractionMethod: 'tesseract-ocr',
      quality,
      warnings: quality.warnings,
    };
  }

  throw new Error(`Unsupported file type: ${fileType || fileName}`);
}

export async function extractTextFromFile(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<string> {
  return (await extractTextFromFileDetailed(buffer, fileType, fileName)).text;
}

/** Never throws; use when generation can degrade gracefully. */
export async function extractTextLenient(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<string> {
  try {
    return (await extractTextFromFileDetailed(buffer, fileType, fileName)).text;
  } catch {
    return '';
  }
}

export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  return cleanExtractedText(await ocrImageBuffer(buffer));
}

