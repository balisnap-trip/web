"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background shadow-lg ring-1 ring-border">
            <Image
              src="/logo.png"
              alt="Balisnaptrip"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              priority
            />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Balisnaptrip Content Manager</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in to manage catalog and publish workflow</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <div className="animate-shake rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div>
          <Label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-700">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 px-4"
            placeholder="admin@balisnaptrip.com"
            required
          />
        </div>

        <div>
          <Label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 px-4"
            placeholder="********"
            required
          />
        </div>

        <Button type="submit" className="h-12 w-full text-base font-semibold shadow-lg" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <p>Secure content access only</p>
        </div>
      </div>
    </Card>
  );
}
