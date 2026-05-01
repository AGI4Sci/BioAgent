export function exportJsonFile(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  exportBlob(name, blob);
}

export function exportTextFile(name: string, content: string, contentType = 'text/plain') {
  exportBlob(name, new Blob([content], { type: `${contentType};charset=utf-8` }));
}

export function exportBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
