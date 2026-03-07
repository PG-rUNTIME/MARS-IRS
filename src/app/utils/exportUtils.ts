/**
 * Client-side export helpers for CSV (Excel), PDF, and Word-compatible HTML.
 */

/** Escape CSV cell and wrap in quotes if needed. */
function escapeCsvCell(val: string): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

/** Build CSV string from rows (array of string arrays). */
export function buildCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/** Trigger download of a blob as a file. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export table data as CSV (opens in Excel). */
export function exportToExcel(headers: string[], rows: string[][], baseName: string) {
  const csv = buildCsv(headers, rows);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${baseName}_${date}.csv`);
}

/** Build a simple HTML document with a table (Word can open .doc by saving as .html or we use .doc with HTML content). */
export function buildWordHtml(title: string, headers: string[], rows: string[][]): string {
  const thCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const trs = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<table border="1" cellpadding="4" cellspacing="0">
<thead><tr>${thCells}</tr></thead>
<tbody>${trs}</tbody>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Export table as Word-openable HTML file. */
export function exportToWord(title: string, headers: string[], rows: string[][], baseName: string) {
  const html = buildWordHtml(title, headers, rows);
  const blob = new Blob([html], { type: 'application/msword' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${baseName}_${date}.doc`);
}
