"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/axiom/AuthProvider";

export default function AxiomPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/axiom/dashboard");
    }
  }, [session, loading, router]);

  // Login screen is rendered by the layout when not authenticated
  return null;
}
