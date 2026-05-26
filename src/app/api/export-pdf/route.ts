import PDFDocument from 'pdfkit';
import { parseQuestionOptions } from '@/lib/parseQuestionOptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { title, questions, randomize } = await req.json();

    if (!title || !questions || !Array.isArray(questions)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    let finalQuestions = [...questions];
    if (randomize) {
      finalQuestions = finalQuestions.sort(() => Math.random() - 0.5);
    }

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      // Initialize PDF Document
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ----- Header -----
      doc.fillColor('#8B5CF6') // Cyber Purple
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('BUZZNEXUS ARENA', { align: 'center' });
      
      doc.moveDown(0.5);
      
      doc.fillColor('#FF4DCA') // Neon Pink
         .fontSize(16)
         .text(`Sector: ${title}`, { align: 'center' });
      
      doc.moveDown(2);
      
      doc.fillColor('#000000').fontSize(12).font('Helvetica');

      // ----- Questions -----
      finalQuestions.forEach((q, index) => {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#333333');
        doc.text(`Q${index + 1}. ${q.question_text}`);
        doc.moveDown(0.5);

        doc.font('Helvetica').fontSize(11).fillColor('#555555');

        const opts = parseQuestionOptions(q.options);
        if ((q.question_type === 'mcq' || opts.length > 0) && opts.length > 0) {
          let ordered = [...opts];
          if (randomize) ordered = ordered.sort(() => Math.random() - 0.5);
          
          ordered.forEach((opt: string, i: number) => {
            const letter = String.fromCharCode(65 + i);
            doc.text(`    ${letter}) ${opt}`);
          });
          doc.moveDown(1);
        } else if (q.question_type === 'fill_blank') {
          doc.text('    ___________________________________________________');
          doc.moveDown(1.5);
        } else if (q.question_type === 'descriptive') {
          doc.text('    ___________________________________________________');
          doc.text('    ___________________________________________________');
          doc.text('    ___________________________________________________');
          doc.moveDown(1.5);
        }
      });

      doc.addPage();

      // ----- Answer Key -----
      doc.fillColor('#8B5CF6')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text('CLASSIFIED ANSWER KEY', { align: 'center' });
      doc.moveDown(2);

      doc.fillColor('#000000').fontSize(12).font('Helvetica');

      finalQuestions.forEach((q, index) => {
        doc.font('Helvetica-Bold').fillColor('#333333').text(`Q${index + 1}. `);
        doc.font('Helvetica').fillColor('#10B981').text(`${q.correct_answer}`);
        doc.moveDown(0.5);
      });

      doc.end();
    });

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="BuzzNexus_${title.replace(/\s+/g, '_')}.pdf"`
      }
    });

  } catch (error) {
    console.error('PDF Export Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
