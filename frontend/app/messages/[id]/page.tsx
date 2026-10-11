"use client";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import ChatThread from "@/components/ChatThread";

export default function MessageThread() {
  const { id } = useParams<{ id: string }>();
  return <AppShell requireAuth title="Chat"><ChatThread id={Number(id)} /></AppShell>;
}
