"use client";
import { useRouter } from "next/navigation";

export function LogoutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
