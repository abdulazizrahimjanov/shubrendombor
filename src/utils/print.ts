/**
 * Clean thermal receipt / label sheet / report printing without window.open
 * (uses an isolated hidden print iframe so it works inside sandboxed iFrames).
 */
export function printHtmlDocument(
  html: string,
  title = 'SHU BREND OMBOR',
  thermalWidth?: '58mm' | '80mm'
) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  const pageCss = thermalWidth
    ? `@page { size: ${thermalWidth} auto; margin: 2mm; }`
    : `@page { margin: 4mm; }`;

  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: ${thermalWidth ? '4px' : '8px'};
      font-family: 'JetBrains Mono', ui-monospace, monospace, sans-serif;
      color: #000;
      background: #fff;
      font-size: 12px;
      line-height: 1.4;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider { border-top: 1px dashed #444; margin: 6px 0; }
    @media print {
      ${pageCss}
    }
  </style>
</head>
<body>${html}</body>
</html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
}
