import React from 'react';
import { unitEmblem, type UnitSubject } from '@/src/lib/unitEmblem';
import './unitEmblem.css';

export function UnitEmblem({ subject }: { subject: UnitSubject }) {
  const asset = unitEmblem(subject);
  if (!asset) return null;
  return <div className="unit-emblem" aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}${asset.split('/').map(encodeURIComponent).join('/')}`} alt="" loading="lazy" decoding="async" />
  </div>;
}
