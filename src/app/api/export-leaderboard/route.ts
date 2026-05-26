import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type LeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  accuracy: number;
  streak: number;
  joined_at: string;
  player_number: number;
};

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: LeaderboardRow[]): string {
  const header = ['Rank', 'Name', 'Score', 'Accuracy', 'Streak', 'Player #', 'Joined At'];
  return [
    header.join(','),
    ...rows.map((r) =>
      [
        r.rank,
        escapeCsv(r.name),
        r.score,
        r.accuracy,
        r.streak,
        r.player_number,
        escapeCsv(r.joined_at),
      ].join(',')
    ),
  ].join('\n');
}

async function rowsToPdf(roomCode: string, rows: LeaderboardRow[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fontSize(18)
    .fillColor('#111827')
    .text('BuzzNexus Leaderboard', { continued: false });
  doc.fontSize(10).fillColor('#6b7280').text(`Arena ${roomCode} - ${new Date().toISOString()}`);
  doc.moveDown(1.5);

  const x = [48, 92, 270, 340, 410, 470];
  doc.fontSize(9).fillColor('#374151');
  ['Rank', 'Name', 'Score', 'Accuracy', 'Streak', 'Joined'].forEach((label, index) => {
    doc.text(label, x[index], doc.y, { width: index === 1 ? 160 : 70 });
  });
  doc.moveDown(0.5);
  doc.moveTo(48, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').stroke();
  doc.moveDown(0.4);

  rows.forEach((row) => {
    if (doc.y > 760) doc.addPage();
    const y = doc.y;
    doc.fillColor('#111827').fontSize(9);
    doc.text(String(row.rank), x[0], y, { width: 40 });
    doc.text(row.name, x[1], y, { width: 160 });
    doc.text(String(row.score), x[2], y, { width: 60 });
    doc.text(String(row.accuracy), x[3], y, { width: 60 });
    doc.text(String(row.streak), x[4], y, { width: 50 });
    doc.text(new Date(row.joined_at).toLocaleString(), x[5], y, { width: 90 });
    doc.moveDown(0.8);
  });

  doc.end();
  return done;
}

function rowsToXlsx(rows: LeaderboardRow[]): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Rank: row.rank,
      Name: row.name,
      Score: row.score,
      Accuracy: row.accuracy,
      Streak: row.streak,
      'Player #': row.player_number,
      'Joined At': row.joined_at,
    }))
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leaderboard');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const format = (searchParams.get('format') || 'csv').toLowerCase();

  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(url, key);

  const { data: participants, error: pErr } = await supabase
    .from('participants')
    .select('id, name, score, join_order, player_number, accuracy, streak_count, joined_at')
    .eq('room_id', roomId)
    .order('score', { ascending: false });

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('code')
    .eq('id', roomId)
    .single();

  const rows = (participants || []).map((p, i) => ({
    rank: i + 1,
    name: p.name,
    score: p.score,
    accuracy: p.accuracy ?? 0,
    streak: p.streak_count ?? 0,
    joined_at: p.joined_at,
    player_number: p.join_order || p.player_number,
  }));
  const roomCode = room?.code || roomId;
  const basename = `buzznexus-leaderboard-${roomCode}`;

  if (format === 'json') {
    return NextResponse.json({ room, leaderboard: rows });
  }

  if (format === 'pdf') {
    const pdf = await rowsToPdf(roomCode, rows);
    return new NextResponse(bufferToArrayBuffer(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${basename}.pdf"`,
      },
    });
  }

  if (format === 'xlsx') {
    const xlsx = rowsToXlsx(rows);
    return new NextResponse(bufferToArrayBuffer(xlsx), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${basename}.xlsx"`,
      },
    });
  }

  return new NextResponse(rowsToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${basename}.csv"`,
    },
  });
}
