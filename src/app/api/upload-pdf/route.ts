import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_PAGES = 30;

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const roomId = formData.get('roomId') as string | null;
    const roomCode = formData.get('roomCode') as string | null;

    if (!file || !roomId || !roomCode) {
      return NextResponse.json(
        { error: 'Missing required fields: file, roomId, roomCode' },
        { status: 400 }
      );
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) ||
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name.toLowerCase());

    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'Only PDF or image files (JPG/PNG/WEBP/HEIC) are supported' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    // IMAGE FAST PATH — camera capture or scanned photo: treat as single-page
    if (isImage) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `${roomId}/${timestamp}/page-1.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('presentations').upload(storagePath, buffer, { contentType: file.type, upsert: true });
      if (uploadError) return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
      const { data: urlData } = supabaseAdmin.storage.from('presentations').getPublicUrl(storagePath);
      const pageUrl = urlData.publicUrl;
      const pdfTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      await supabaseAdmin.from('rooms').update({
        pdf_mode_active: true, pdf_pages: [pageUrl], pdf_total_pages: 1,
        pdf_current_page: 1, pdf_title: pdfTitle, pdf_presentation_url: pageUrl,
      }).eq('id', roomId);
      return NextResponse.json({ success: true, pages: [pageUrl], totalPages: 1, title: pdfTitle, roomCode });
    }


    const buffer = Buffer.from(await file.arrayBuffer());
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buzznexus-pdf-'));
    const pdfPath = path.join(tempDir, 'source.pdf');
    await fs.writeFile(pdfPath, buffer);

    // Convert PDF pages to PNG images
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfPoppler = require('pdf-poppler') as {
      convert(
        file: string,
        opts: { format: string; out_dir: string; out_prefix: string; page: null; scale: number }
      ): Promise<void>;
      info(file: string): Promise<{ pages: number }>;
    };

    // Get page count
    let totalPages = 0;
    try {
      const info = await pdfPoppler.info(pdfPath);
      totalPages = Math.min(info.pages || 1, MAX_PAGES);
    } catch {
      totalPages = MAX_PAGES; // will be corrected by actual images
    }

    await pdfPoppler.convert(pdfPath, {
      format: 'png',
      out_dir: tempDir,
      out_prefix: 'page',
      page: null,
      scale: 1200,
    });

    const allFiles = await fs.readdir(tempDir);
    const pageFiles = allFiles
      .filter((f) => f.toLowerCase().endsWith('.png') && f.startsWith('page'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10);
        const numB = parseInt(b.replace(/\D/g, ''), 10);
        return numA - numB;
      })
      .slice(0, MAX_PAGES);

    if (pageFiles.length === 0) {
      return NextResponse.json(
        {
          error: 'Could not convert PDF to images. The file may be encrypted or corrupted.',
        },
        { status: 422 }
      );
    }

    totalPages = pageFiles.length;
    const timestamp = Date.now();
    const pageUrls: string[] = [];

    // Upload each page image to Supabase storage
    for (let i = 0; i < pageFiles.length; i++) {
      const imgPath = path.join(tempDir, pageFiles[i]);
      const imgBuffer = await fs.readFile(imgPath);
      const storagePath = `${roomId}/${timestamp}/page-${i + 1}.png`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('presentations')
        .upload(storagePath, imgBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`[upload-pdf] Page ${i + 1} upload error:`, uploadError.message);
        // Continue with remaining pages
        pageUrls.push('');
        continue;
      }

      const { data: urlData } = supabaseAdmin.storage
        .from('presentations')
        .getPublicUrl(storagePath);

      pageUrls.push(urlData.publicUrl);
    }

    const validPageUrls = pageUrls.filter(Boolean);
    if (validPageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Failed to upload any PDF pages. Check storage bucket permissions.' },
        { status: 500 }
      );
    }

    const pdfTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

    // Update the room record
    const { error: updateError } = await supabaseAdmin
      .from('rooms')
      .update({
        pdf_mode_active: true,
        pdf_pages: validPageUrls,
        pdf_total_pages: validPageUrls.length,
        pdf_current_page: 1,
        pdf_title: pdfTitle,
        pdf_presentation_url: validPageUrls[0] || null,
      })
      .eq('id', roomId);

    if (updateError) {
      console.error('[upload-pdf] Room update error:', updateError.message);
      return NextResponse.json(
        { error: `Failed to update room: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pages: validPageUrls,
      totalPages: validPageUrls.length,
      title: pdfTitle,
      roomCode,
    });
  } catch (error: unknown) {
    console.error('[upload-pdf] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup failure is non-critical
      }
    }
  }
}
