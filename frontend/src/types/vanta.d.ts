declare module 'vanta/dist/vanta.net.min' {
  import type * as THREE from 'three';
  type VantaEffect = { destroy: () => void };
  type VantaOptions = {
    el: HTMLElement | string;
    THREE: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    color?: number;
    backgroundColor?: number;
    points?: number;
    maxDistance?: number;
    spacing?: number;
    mouseCoeffX?: number;
    mouseCoeffY?: number;
  };
  export default function NET(options: VantaOptions): VantaEffect;
}

declare module 'vanta/dist/vanta.halo.min' {
  import type * as THREE from 'three';
  type VantaEffect = { destroy: () => void };
  type VantaOptions = {
    el: HTMLElement | string;
    THREE: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    baseColor?: number;
    color2?: number;
    backgroundColor?: number;
    amplitudeFactor?: number;
    ringFactor?: number;
    rotationFactor?: number;
    size?: number;
    speed?: number;
    mouseEase?: boolean;
  };
  export default function HALO(options: VantaOptions): VantaEffect;
}

declare module 'vanta/dist/vanta.rings.min' {
  import type * as THREE from 'three';
  type VantaEffect = { destroy: () => void };
  type VantaOptions = {
    el: HTMLElement | string;
    THREE: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    color?: number;
    backgroundColor?: number;
  };
  export default function RINGS(options: VantaOptions): VantaEffect;
}
