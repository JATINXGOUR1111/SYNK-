"use client";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PostCard from "@/components/PostCard";
import { ErrorState, PostSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { Post } from "@/lib/types";
import { useAuth } from "@/components/Providers";

export default function SinglePost() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<Post>(`/posts/${id}`), [id, user?.id]);
  return (
    <AppShell title="Post">
      {loading ? <PostSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : data && <PostCard post={data} expanded />}
    </AppShell>
  );
}
