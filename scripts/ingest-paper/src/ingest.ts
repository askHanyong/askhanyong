#!/usr/bin/env node
import path from 'node:path';
import { extractPdfFullText } from './pdfText.js';
import { segmentPaper, segmentMarkscheme } from './claudeSegment.js';
import { reconcile } from './reconcile.js';
import { resolveSubjectId, uploadPdf, ingestPaper } from './supabaseIngest.js';

interface Args {
  paper: string;
  markscheme: string;
  subject: string;
  level: 'SL' | 'HL';
  year: number;
  session: 'May' | 'Nov';
  paperNumber: 1 | 2 | 3;
  timeZone?: string;
  calculatorAllowed: boolean;
}

function usageAndExit(): never {
  console.error(`Usage:
  npm run ingest -- \\
    --paper <path.pdf> --markscheme <path.pdf> \\
    --subject MAA --level HL --year 2021 --session May \\
    --paper-number 1 --calculator true|false [--timezone TZ1]`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const paper = get('--paper');
  const markscheme = get('--markscheme');
  const subject = get('--subject');
  const level = get('--level');
  const year = get('--year');
  const session = get('--session');
  const paperNumber = get('--paper-number');
  const timeZone = get('--timezone');
  const calculator = get('--calculator');

  if (!paper || !markscheme || !subject || !level || !year || !session || !paperNumber || !calculator) {
    usageAndExit();
  }
  if (level !== 'SL' && level !== 'HL') throw new Error('--level must be SL or HL');
  if (session !== 'May' && session !== 'Nov') throw new Error('--session must be May or Nov');
  if (calculator !== 'true' && calculator !== 'false') throw new Error('--calculator must be true or false');
  const pn = Number(paperNumber);
  if (![1, 2, 3].includes(pn)) throw new Error('--paper-number must be 1, 2 or 3');

  return {
    paper,
    markscheme,
    subject,
    level,
    year: Number(year),
    session,
    paperNumber: pn as 1 | 2 | 3,
    timeZone,
    calculatorAllowed: calculator === 'true',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('Extracting text with pdf-parse (reference/debug only -- not sent to Claude)...');
  const paperText = await extractPdfFullText(args.paper);
  const msText = await extractPdfFullText(args.markscheme);
  console.log(`  paper: ${paperText.length} chars, markscheme: ${msText.length} chars extracted.`);

  console.log('Asking Claude to segment the paper (native PDF input, so it can see diagrams)...');
  const paperSeg = await segmentPaper(args.paper);
  console.log(`  found ${paperSeg.questions.length} question(s).`);

  console.log('Asking Claude to segment the markscheme (aligned to the confirmed paper structure)...');
  const msSeg = await segmentMarkscheme(args.markscheme, paperSeg);
  console.log(`  found ${msSeg.questions.length} question(s).`);

  console.log('Reconciling paper parts against markscheme parts...');
  const reconciled = reconcile(paperSeg, msSeg);
  if (reconciled.mismatches.length === 0) {
    console.log('  no mismatches -- every paper part has exactly one matching markscheme part.');
  } else {
    console.log(`  ${reconciled.mismatches.length} mismatch(es) found:`);
    for (const m of reconciled.mismatches) {
      console.log(`   - [${m.kind}] Q${m.question_number}${m.part_label ? ` (${m.part_label})` : ''}: ${m.reason}`);
    }
  }

  console.log(`Resolving subject_id for "${args.subject}"...`);
  const subjectId = await resolveSubjectId(args.subject);

  const totalMarks = paperSeg.questions.reduce((sum, q) => sum + (q.total_marks ?? 0), 0) || null;

  const paperFileName = path.basename(args.paper);
  const msFileName = path.basename(args.markscheme);
  const storagePrefix = `${args.subject}/${args.level}/${args.year}-${args.session}${args.timeZone ? `-${args.timeZone}` : ''}-P${args.paperNumber}`;
  const paperStoragePath = `${storagePrefix}/${paperFileName}`;
  const msStoragePath = `${storagePrefix}/${msFileName}`;

  console.log(`Uploading paper to papers-private/${paperStoragePath}...`);
  await uploadPdf('papers-private', paperStoragePath, args.paper);
  console.log(`Uploading markscheme to markschemes-private/${msStoragePath}...`);
  await uploadPdf('markschemes-private', msStoragePath, args.markscheme);

  const payload = {
    paper: {
      subject_id: subjectId,
      level: args.level,
      year: args.year,
      session: args.session,
      paper_number: args.paperNumber,
      time_zone: args.timeZone ?? null,
      calculator_allowed: args.calculatorAllowed,
      total_marks: totalMarks,
      paper_file_path: paperStoragePath,
      markscheme_file_path: msStoragePath,
    },
    questions: reconciled.questions,
    orphan_markscheme_questions: reconciled.orphan_markscheme_questions,
  };

  console.log('Inserting paper + questions + parts + markscheme in one DB transaction (ingest_paper RPC)...');
  const paperId = await ingestPaper(payload);
  console.log(`Done. papers.id = ${paperId}`);

  const reviewCount = reconciled.mismatches.filter((m) => m.kind !== 'part_count_mismatch').length;
  if (reviewCount > 0) {
    console.log(`${reviewCount} row(s) were logged to review_queue for manual review.`);
  }
}

main().catch((err) => {
  console.error('Ingestion failed -- no DB rows were written for this paper (the DB insert is one transaction),');
  console.error('but if uploadPdf() already ran, the uploaded files may still be sitting in storage unreferenced:');
  console.error(err);
  process.exit(1);
});
