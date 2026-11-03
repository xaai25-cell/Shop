"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { signIn, type LoginState } from "../actions";
import { Spinner } from "@/components/ui";

const inputClass =
  "peer h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm " +
  "placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 " +
  "aria-[invalid=true]:border-rose-300";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Controlled so the email survives a failed attempt (React resets uncontrolled form fields after an action).
  const [email, setEmail] = useState("");
  // Counts failed attempts so the error message re-animates (shakes) every time.
  const [attempt, setAttempt] = useState(0);
  const hasError = !!state?.error;

  useEffect(() => {
    if (state?.error) setAttempt((n) => n + 1);
  }, [state]);

  return (
    <motion.form
      action={action}
      className="mt-8 space-y-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <div className="relative">
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={hasError}
            className={inputClass}
          />
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition peer-focus:text-brand-600" />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="••••••••"
            aria-invalid={hasError}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            className={`${inputClass} pr-12`}
          />
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition peer-focus:text-brand-600" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {capsLock && <p className="mt-1.5 text-xs font-medium text-amber-600">Caps Lock is on</p>}
      </div>

      <AnimatePresence>
        {hasError && (
          <motion.p
            key={attempt}
            role="alert"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: [0, -10, 10, -6, 6, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-start gap-2 overflow-hidden rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {state?.error}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={pending}
        className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-600 via-fuchsia-600 to-pink-500 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:shadow-xl hover:shadow-fuchsia-500/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/30 active:scale-[0.99] disabled:opacity-80"
      >
        {/* sheen */}
        <span className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/20 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
        {pending ? (
          <>
            <Spinner /> Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>
    </motion.form>
  );
}
