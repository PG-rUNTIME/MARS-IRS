/**
 * Local brand logo served by Vite static assets.
 * Place your PNG at: public/blue.png
 */
const MARS_LOGO_URL = '/blue.png';

interface MarsLogoProps {
  /** Size: 'sm' | 'md' | 'lg' | 'xl' */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Layout: square icon or wide wordmark */
  layout?: 'square' | 'wide';
  /** Use light version on dark backgrounds (e.g. sidebar) */
  variant?: 'default' | 'light';
  className?: string;
}

const squareSizeMap = { sm: 32, md: 40, lg: 72, xl: 128 };
const wideSizeMap = {
  sm: { width: 120, height: 32 },
  md: { width: 170, height: 40 },
  lg: { width: 250, height: 72 },
  xl: { width: 340, height: 96 },
};

export function MarsLogo({ size = 'md', layout = 'square', variant = 'default', className = '' }: MarsLogoProps) {
  const dims = layout === 'wide'
    ? wideSizeMap[size]
    : { width: squareSizeMap[size], height: squareSizeMap[size] };
  const fallbackTextClass = variant === 'light' ? 'text-white' : 'text-mars-navy';

  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden rounded-lg ${className}`}
      style={{ width: dims.width, height: dims.height, minWidth: dims.width, minHeight: dims.height }}
    >
      <img
        src={MARS_LOGO_URL}
        alt="MARS"
        width={dims.width}
        height={dims.height}
        className="object-contain w-full h-full"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <span
        aria-hidden
        style={{ display: 'none', width: dims.width, height: dims.height, fontSize: size === 'sm' ? 12 : size === 'md' ? 14 : 18 }}
        className={`font-bold flex items-center justify-center ${fallbackTextClass}`}
      >
        MARS
      </span>
    </div>
  );
}
