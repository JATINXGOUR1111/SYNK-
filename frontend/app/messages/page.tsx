"use client";
import AppShell from "@/components/AppShell";
import ConversationList from "@/components/ConversationList";

export default function Messages() {
  return <AppShell requireAuth title="Messages"><h1 className="text-xl font-bold">Messages</h1><ConversationList /></AppShell>;
}
