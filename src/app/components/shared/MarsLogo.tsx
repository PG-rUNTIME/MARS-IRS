/**
 * MARS (mars.co.zw) logo – loads from their site with fallback to wordmark.
 */
const MARS_LOGO_URL = 'https://www.mars.co.zw/images/logo.png';

interface MarsLogoProps {
  /** Size: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg';
  /** Use light version on dark backgrounds (e.g. sidebar) */
  variant?: 'default' | 'light';
  className?: string;
}

const sizeMap = { sm: 32, md: 40, lg: 48 };

export function MarsLogo({ size = 'md', variant = 'default', className = '' }: MarsLogoProps) {
  const px = sizeMap[size];

  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden rounded-lg bg-white ${className}`}
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
    >
      <img
        src={MARS_LOGO_URL}
        alt="MARS"
        width={px}
        height={px}
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
        style={{ display: 'none', width: px, height: px, fontSize: size === 'sm' ? 12 : size === 'md' ? 14 : 18 }}
        className="font-bold text-mars-navy flex items-center justify-center"
      >
        MARS
      </span>
    </div>
  );
}
