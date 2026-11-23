import React from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import type { RadialCrumb } from '@/src/components/planta/radial/usePlantaRadial';

type OrganizationBreadcrumbProps = {
  crumbs: RadialCrumb[];
  onNavigate: (index: number) => void;
};

export const OrganizationBreadcrumb: React.FC<OrganizationBreadcrumbProps> = ({
  crumbs,
  onNavigate,
}) => {
  const reduced = useReducedMotion();
  return (
    <nav aria-label="Ruta de la estructura" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <motion.li
              key={`${crumb.key}-${index}`}
              className="flex min-w-0 items-center gap-1"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : index * 0.04 }}
            >
              {index > 0 && (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-orbit-muted" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => onNavigate(index)}
                disabled={current}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'max-w-[14rem] truncate rounded-lg px-2 py-1 text-left text-xs font-semibold transition-colors',
                  current
                    ? 'text-orbit-text'
                    : 'text-orbit-primary hover:bg-orbit-primary/10'
                )}
              >
                {crumb.label}
              </button>
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
};
