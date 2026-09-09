import React from 'react';
import { BRAND_CONFIG } from '../../config/brand';

interface LogoProps {
  className?: string;
  variant?: 'login' | 'menu';
}

/**
 * Componente Logo Modular
 * Renderiza el logo definido en BRAND_CONFIG (ya sea SVG o PNG).
 */
export const Logo: React.FC<LogoProps> = ({ className, variant = 'menu' }) => {
  const logo = variant === 'login' ? BRAND_CONFIG.logoLogin : BRAND_CONFIG.logoMenu;

  if (logo.type === 'svg') {
    const SvgLogo = logo.content as React.FC<React.SVGProps<SVGSVGElement>>;
    return <SvgLogo className={className} />;
  }

  if (logo.type === 'png') {
    return (
      <img
        src={logo.content as string}
        alt={BRAND_CONFIG.name}
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  return null;
};
