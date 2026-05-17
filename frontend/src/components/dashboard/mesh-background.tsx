'use client';

import { motion } from 'framer-motion';

export function MeshBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: 'var(--dash-mesh-bg)' }}
    >
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(var(--dash-grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--dash-grid-line) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      <motion.div
        className="absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-teal-500/25 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/20 blur-[100px]"
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-cyan-500/15 blur-[90px]"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
