import React from 'react';
import { unitEmblemAssets, type UnitSubject } from '@/src/lib/unitEmblem';
import { schoolAccent } from '@/src/lib/schoolAccent';
import { emblemGlow } from '@/src/lib/emblemGlow';
import './unitEmblem.css';

function assetUrl(asset: string): string {
  return `${import.meta.env.BASE_URL}${asset.split('/').map(encodeURIComponent).join('/')}`;
}

export function UnitEmblem({ subject }: { subject: UnitSubject }) {
  const assets = unitEmblemAssets(subject);
  if (!assets) return null;

  // El glow se deriva del color institucional del área, así que cada emblema
  // recibe su propia luz e intensidad en vez de un brillo único para todos.
  // La luz solo se dibuja en modo oscuro, por eso cuando hay arte oscuro
  // propio se toma su color y no el del área.
  const { nightIdentity } = schoolAccent({
    schoolName: subject.school,
    programName: subject.program,
    areaName: subject.area,
    roleName: subject.role_name,
  });
  const glow = emblemGlow(assets.nightGlow ?? nightIdentity);

  return <div
    className="unit-emblem"
    aria-hidden="true"
    style={{
      '--emblem-glow-rgb': glow.glowRgb,
      '--emblem-glow-strength': glow.strength,
      '--emblem-contrast': glow.contrast,
      '--emblem-brightness': glow.brightness,
    } as React.CSSProperties}
  >
    {/* Cuando hay arte propio de modo oscuro se montan los dos y CSS elige,
        de modo que el emblema sigue al tema sin re-render. */}
    <img
      className={assets.night ? 'emblem-day' : undefined}
      src={assetUrl(assets.day)}
      alt=""
      loading="lazy"
      decoding="async"
    />
    {assets.night ? (
      <img
        className="emblem-night"
        src={assetUrl(assets.night)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    ) : null}
  </div>;
}
