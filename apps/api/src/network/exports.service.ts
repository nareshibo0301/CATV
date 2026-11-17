import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';
import type { AuthUser, ReportQuery } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

const fonts = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async build(actor: AuthUser, report: string, format: 'csv' | 'xlsx' | 'pdf', query: ReportQuery, ip: string | null) {
    const full = await this.reports.table(actor, report, { ...query, page: 1, pageSize: 100 });
    const pages = Math.ceil(full.total / 100);
    const rows = [...full.rows];
    for (let page = 2; page <= pages; page += 1) {
      const next = await this.reports.table(actor, report, { ...query, page, pageSize: 100 });
      rows.push(...next.rows);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'EXPORT_CREATED',
      entity: 'Report',
      entityId: report,
      after: { format, rows: rows.length, filters: query },
      ip,
    });
    if (format === 'csv') {
      return { filename: `${report}.csv`, type: 'text/csv', body: toCsv(full.columns, rows) };
    }
    if (format === 'xlsx') {
      const body = await toExcel(report, full.columns, rows);
      return { filename: `${report}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body };
    }
    const body = await toPdf(report, full.columns, rows, query);
    return { filename: `${report}.pdf`, type: 'application/pdf', body };
  }

  async enqueue(actor: AuthUser, report: string, format: string, filters: ReportQuery) {
    return this.prisma.exportJob.create({
      data: { userId: actor.id, report, format, filters: filters as object, status: 'PENDING' },
    });
  }

  async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId }, include: { user: true } });
    if (!job) return;
    const actor = { id: job.user.id, role: job.user.role, adminType: job.user.adminType, email: job.user.email, name: job.user.name };
    const file = await this.build(actor, job.report, job.format as 'csv' | 'xlsx' | 'pdf', job.filters as ReportQuery, null);
    const dir = join(tmpdir(), 'catv-exports');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${job.id}-${file.filename}`);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(file.body);
    });
    await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: 'READY', progress: 100, filePath } });
  }

  async download(actor: AuthUser, id: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, userId: actor.id, status: 'READY', filePath: { not: null } } });
    if (!job?.filePath) return null;
    return { stream: createReadStream(job.filePath), filename: `${job.report}.${job.format === 'xlsx' ? 'xlsx' : job.format}` };
  }

  sweep(maxAgeMs = 24 * 60 * 60 * 1000): void {
    const dir = join(tmpdir(), 'catv-exports');
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of names) {
      const path = join(dir, name);
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    }
  }
}

function toCsv(columns: string[], rows: string[][]): Buffer {
  const lines = [columns, ...rows].map((line) => line.map(csvCell).join(','));
  return Buffer.from(lines.join('\n'), 'utf8');
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

async function toExcel(title: string, columns: string[], rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(title.slice(0, 31));
  sheet.addRow(columns);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF14120B' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4AF37' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  const data = await book.xlsx.writeBuffer();
  return Buffer.from(data);
}

function toPdf(title: string, columns: string[], rows: string[][], query: ReportQuery): Promise<Buffer> {
  const printer = new PdfPrinter(fonts);
  const doc = {
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    header: { text: 'CATV', margin: [40, 16, 40, 0], color: '#B8860B', bold: true },
    footer: (current: number, count: number) => ({ text: `${current} / ${count}`, alignment: 'right', margin: [0, 0, 40, 0] }),
    content: [
      { text: title, style: { fontSize: 16, bold: true } },
      { text: `Filters: ${JSON.stringify(query)}`, margin: [0, 4, 0, 8], color: '#5c5340' },
      {
        table: {
          headerRows: 1,
          widths: columns.map(() => '*'),
          body: [columns, ...rows],
        },
        layout: 'lightHorizontalLines',
      },
      { text: `Rows: ${rows.length}`, margin: [0, 8, 0, 0], bold: true },
    ],
  };
  const pdf = printer.createPdfKitDocument(doc);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.end();
  });
}
