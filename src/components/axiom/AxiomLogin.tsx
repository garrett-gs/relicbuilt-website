"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "./AuthProvider";
import Button from "@/components/ui/Button";

export default function AxiomLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo-emblem.png"
              alt="Relic"
              width={64}
              height={64}
              className="h-16 w-16"
            />
          </div>
          <h1 className="text-3xl font-heading font-bold tracking-widest text-foreground">
            AXIOM
          </h1>
          <p className="text-muted text-sm mt-2">
            R&ensp;E&ensp;L&ensp;I&ensp;C Project Management
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-card border border-border px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
              placeholder="you@relicbuilt.com"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-card border border-border px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
              placeholder="Enter password"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
