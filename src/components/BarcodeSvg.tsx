import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import { renderBarcodeToSvgString } from '../utils/barcode';

export const BarcodeSvg: React.FC<{
  code: string;
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}> = ({ code, width = 1.5, height = 40, fontSize = 11, displayValue = true, className = '' }) => {
  const svgHtml = useMemo(
    () => renderBarcodeToSvgString(code, { width, height, fontSize, displayValue }),
    [code, width, height, fontSize, displayValue]
  );

  if (!code) return null;
  return (
    <div
      className={`inline-flex items-center justify-center bg-white rounded px-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
};

export const ProductThumb: React.FC<{
  src?: string;
  name: string;
  className?: string;
}> = ({ src, name, className = 'w-11 h-11 rounded-lg' }) => {
  const [errored, setErrored] = React.useState(false);

  React.useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    return (
      <div
        className={`${className} bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0`}
        title={name}
      >
        <Package className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={`${className} object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0`}
    />
  );
};
