'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type VantaAuthEffect = 'net' | 'halo' | 'rings';

type VantaBackgroundProps = {
  effect: VantaAuthEffect;
  className?: string;
};

type EffectConfig = Record<string, number | boolean>;

const EFFECT_CONFIGS: Record<VantaAuthEffect, EffectConfig> = {
  /** Parent — interactive connected network */
  net: {
    color: 0x5eead4,
    backgroundColor: 0x042f2e,
    points: 12,
    maxDistance: 24,
    spacing: 16,
    mouseCoeffX: 1.25,
    mouseCoeffY: 1.25,
  },
  /** School owner — glowing orb that smoothly follows the cursor */
  halo: {
    baseColor: 0x0f766e,
    color2: 0xfbbf24,
    backgroundColor: 0x042f2e,
    amplitudeFactor: 1.2,
    ringFactor: 1.15,
    rotationFactor: 0.9,
    size: 1.15,
    speed: 0.9,
    mouseEase: true,
  },
  /** Staff — floating 3D rings that tilt with mouse movement */
  rings: {
    backgroundColor: 0x0c1222,
    color: 0x2dd4bf,
  },
};

async function loadEffect(effect: VantaAuthEffect) {
  const THREE = await import('three');
  switch (effect) {
    case 'halo':
      return { THREE, Effect: (await import('vanta/dist/vanta.halo.min')).default };
    case 'rings':
      return { THREE, Effect: (await import('vanta/dist/vanta.rings.min')).default };
    default:
      return { THREE, Effect: (await import('vanta/dist/vanta.net.min')).default };
  }
}

/** [Vanta.js](https://www.vantajs.com/) animated login backgrounds with mouse interaction */
export function VantaBackground({ effect, className }: VantaBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const init = async () => {
      const { THREE, Effect } = await loadEffect(effect);
      if (cancelled || !containerRef.current) return;

      effectRef.current?.destroy();
      effectRef.current = Effect({
        el: containerRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 0.85,
        ...EFFECT_CONFIGS[effect],
      });
    };

    init();

    return () => {
      cancelled = true;
      effectRef.current?.destroy();
      effectRef.current = null;
    };
  }, [effect]);

  return (
    <div
      ref={containerRef}
      className={cn('absolute inset-0 z-0', className)}
      aria-hidden
    />
  );
}
