import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { PortfolioReport } from './report.types';

export function renderPdf(report: PortfolioReport): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const currency = report.portfolio.currency;
  doc.fontSize(20).text('InvestAI', { continued: false });
  doc.fontSize(12).fillColor('#444444').text('Informe de portafolio');
  doc.moveDown(0.5);
  doc.fillColor('#111111').fontSize(16).text(report.portfolio.name);
  doc.fontSize(10).fillColor('#444444').text(`${currency} · ${report.generatedAt.slice(0, 10)}`);
  doc.moveDown();
  doc.fillColor('#111111').fontSize(11).text(report.narrative, { width: 500 });
  doc.moveDown();

  section(doc, 'Resumen');
  lines(doc, [
    `Valor: ${money(report.summary.portfolioValue, currency)}`,
    `Invertido: ${money(report.summary.investedAmount, currency)}`,
    `Efectivo: ${money(report.summary.cash, currency)}`,
    `P/L total: ${money(report.summary.totalPl, currency)}`,
    `Rendimiento: ${percent(report.summary.returnPercent)}`,
    `Cambio diario: ${report.summary.dailyChange === null ? 'No disponible' : money(report.summary.dailyChange, currency)}`,
    `Referencia ${report.benchmarkSymbol}: ${percent(report.benchmarkReturn)}`,
    `Exceso: ${percent(report.excessReturn)}`,
    `Volatilidad anual: ${percent(report.annualizedVolatility)}`,
    `Caída máxima: ${percent(report.maxDrawdownPercent)}`,
  ]);
  if (report.riskReason) {
    doc.moveDown(0.3).fontSize(9).fillColor('#666666').text(report.riskReason);
  }

  section(doc, 'Posiciones');
  if (report.summary.positions.length === 0) {
    doc.fontSize(10).fillColor('#444444').text('Sin posiciones abiertas.');
  } else {
    for (const position of report.summary.positions) {
      doc
        .fontSize(10)
        .fillColor('#111111')
        .text(
          `${position.asset?.symbol ?? '—'}  cant. ${position.quantity}  costo ${money(position.averageCost, currency)}  valor ${money(position.marketValue, currency)}  P/L ${money(position.totalPl, currency)}`,
        );
    }
  }

  section(doc, 'Asignación');
  const allocation = report.summary.allocation.filter((slice) => slice.value > 0);
  if (allocation.length === 0) {
    doc.fontSize(10).text('Sin asignación.');
  } else {
    for (const slice of allocation) {
      doc.fontSize(10).text(`${slice.symbol}  ${slice.percent.toFixed(2)}%  ${money(slice.value, currency)}`);
    }
  }

  section(doc, 'Movimientos');
  const transactions = report.transactions.slice(0, 40);
  if (transactions.length === 0) {
    doc.fontSize(10).text('Sin movimientos.');
  } else {
    for (const transaction of transactions) {
      doc
        .fontSize(9)
        .text(
          `${transaction.executedAt.slice(0, 10)}  ${transaction.type}  ${transaction.asset?.symbol ?? 'Efectivo'}  ${transaction.quantity} × ${money(transaction.price, currency)}`,
        );
    }
  }

  section(doc, 'Noticias');
  if (report.news.length === 0) {
    doc.fontSize(10).text('Sin noticias disponibles.');
  } else {
    for (const article of report.news.slice(0, 12)) {
      doc.fontSize(9).text(`${article.symbol} · ${article.headline} (${article.source})`);
    }
  }

  doc.end();
  return done;
}

export async function renderWorkbook(report: PortfolioReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InvestAI';
  const currency = report.portfolio.currency;

  const summary = workbook.addWorksheet('Resumen');
  summary.addRow(['InvestAI', report.portfolio.name, currency, report.generatedAt]);
  summary.addRow([]);
  summary.addRow(['Valor', report.summary.portfolioValue]);
  summary.addRow(['Invertido', report.summary.investedAmount]);
  summary.addRow(['Efectivo', report.summary.cash]);
  summary.addRow(['P/L total', report.summary.totalPl]);
  summary.addRow(['Rendimiento %', report.summary.returnPercent]);
  summary.addRow(['Cambio diario', report.summary.dailyChange]);
  summary.addRow(['Referencia', report.benchmarkSymbol]);
  summary.addRow(['Rendimiento referencia %', report.benchmarkReturn]);
  summary.addRow(['Exceso %', report.excessReturn]);
  summary.addRow(['Volatilidad anual %', report.annualizedVolatility]);
  summary.addRow(['Caída máxima %', report.maxDrawdownPercent]);
  summary.addRow(['Narrativa', report.narrative]);

  const positions = workbook.addWorksheet('Posiciones');
  positions.addRow(['Símbolo', 'Nombre', 'Cantidad', 'Costo promedio', 'Precio', 'Valor', 'P/L', 'Precio disponible']);
  for (const position of report.summary.positions) {
    positions.addRow([
      position.asset?.symbol ?? '',
      position.asset?.name ?? '',
      position.quantity,
      position.averageCost,
      position.marketPrice,
      position.marketValue,
      position.totalPl,
      position.priceAvailable ? 'sí' : 'no',
    ]);
  }

  const allocation = workbook.addWorksheet('Asignación');
  allocation.addRow(['Símbolo', 'Nombre', 'Valor', 'Porcentaje']);
  for (const slice of report.summary.allocation) {
    allocation.addRow([slice.symbol, slice.name, slice.value, slice.percent]);
  }

  const movements = workbook.addWorksheet('Movimientos');
  movements.addRow(['Fecha', 'Tipo', 'Símbolo', 'Cantidad', 'Precio', 'Comisiones', 'Moneda']);
  for (const transaction of report.transactions) {
    movements.addRow([
      transaction.executedAt,
      transaction.type,
      transaction.asset?.symbol ?? '',
      transaction.quantity,
      transaction.price,
      transaction.fees,
      transaction.currency,
    ]);
  }

  const analytics = workbook.addWorksheet('Analítica');
  analytics.addRow(['Fecha', 'Valor']);
  for (const point of report.performance) {
    analytics.addRow([point.date, point.value]);
  }
  analytics.addRow([]);
  analytics.addRow(['Contribuidores']);
  for (const row of report.contributors) {
    analytics.addRow([row.symbol, row.name, row.pl]);
  }
  analytics.addRow(['Detractores']);
  for (const row of report.detractors) {
    analytics.addRow([row.symbol, row.name, row.pl]);
  }

  const news = workbook.addWorksheet('Noticias');
  news.addRow(['Símbolo', 'Titular', 'Fuente']);
  for (const article of report.news) {
    news.addRow([article.symbol, article.headline, article.source]);
  }

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function section(doc: PdfDoc, title: string) {
  doc.moveDown().fontSize(13).fillColor('#0f766e').text(title);
  doc.moveDown(0.3);
}

function lines(doc: PdfDoc, rows: string[]) {
  for (const row of rows) {
    doc.fontSize(10).fillColor('#111111').text(row);
  }
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

function percent(value: number | null): string {
  return value === null ? 'No disponible' : `${value.toFixed(2)}%`;
}
