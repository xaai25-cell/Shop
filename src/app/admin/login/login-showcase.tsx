"use client";

import { motion } from "motion/react";
import { CheckCircle2, Clock, TrendingUp } from "lucide-react";

/** Decorative floating "dashboard" cards for the login brand panel (sample visuals, not real data). */
export function LoginShowcase() {
  const bars = [38, 52, 44, 66, 58, 74, 62, 88, 70, 92, 84, 100];
  return (
    <div aria-hidden className="relative mt-10 h-56">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-0 w-72 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Revenue</span>
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <TrendingUp className="h-3.5 w-3.5" /> this month
          </span>
        </div>
        <div className="mt-4 flex h-16 items-end gap-1">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-fuchsia-500 to-orange-300"
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
        transition={{
          opacity: { delay: 0.5, duration: 0.6 },
          x: { delay: 0.5, duration: 0.6 },
          y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute right-0 top-6 w-56 rounded-2xl border border-white/10 bg-white p-4 text-slate-900 shadow-2xl"
      >
        <p className="text-xs text-slate-500">New payment slip</p>
        <p className="mt-1 font-bold">ORD-…-A1B2C3</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
          <Clock className="h-3.5 w-3.5" /> Awaiting review
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: [0, 6, 0] }}
        transition={{
          opacity: { delay: 0.8, duration: 0.6 },
          y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 },
        }}
        className="absolute bottom-0 left-24 flex items-center gap-3 rounded-2xl border border-white/10 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-xl backdrop-blur-xl"
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-300" /> Order approved
      </motion.div>
    </div>
  );
}
