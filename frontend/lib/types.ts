export type Role = "creator" | "brand";

export interface UserBrief {
  id: number; name: string; handle: string; role: Role; company: string | null;
  avatar_url: string | null; verified: boolean; headline: string | null;
}
export interface Me extends UserBrief { email: string; banner_url: string | null }
export interface MediaItem { url: string; type: "image" | "video" | "audio" }
export interface PostTags {
  medium?: string; style_tags?: string[]; mood_tags?: string[]; likely_tools?: string[];
  industry_fit?: string[]; best_use_cases?: string[]; quality_notes?: string; confidence?: number;
}
export interface BriefSummary {
  id: number; title: string; status: string; goal: string | null; format: string | null;
  budget_range_inr: { min: number | null; max: number | null } | null; deadline_days: number | null;
}
export interface Trust { risk_level: "low" | "medium" | "high"; flags: string[]; recommendation: string }
export interface Post {
  id: number; kind: "work" | "brief"; caption: string; media: MediaItem[]; declared_tools: string[];
  hashtags: string[]; tags: PostTags; like_count: number; comment_count: number; save_count: number;
  created_at: string; brief_id: number | null; author: UserBrief; liked: boolean; saved: boolean;
  author_followed: boolean; trust_risk?: string | null; brief?: BriefSummary; fit?: number; trust?: Trust;
}
export interface FeedPage { items: Post[]; next_cursor: string | null }
export interface Comment {
  id: number; post_id: number; parent_id: number | null; body: string; like_count: number; liked: boolean;
  created_at: string; author: UserBrief; replies?: Comment[];
}
export interface Profile {
  headline: string; bio: string; ideal_client: string; location: string; links: string[]; specialties: string[];
  tools: string[]; categories: string[]; mediums: string[]; price_min: number; price_max: number;
  turnaround_days: number; rating: number; rating_count: number; verified: boolean;
}
export interface UserFull extends UserBrief {
  banner_url: string | null; created_at: string; profile: Profile | null; is_following: boolean; is_me: boolean;
  stats: { posts: number; followers: number; following: number; rating: number; rating_count: number; avg_turnaround: number | null };
}
export interface Story { user: UserBrief; followed: boolean; posts: Post[] }
export interface StoriesRes { stories: Story[]; open_briefs: Post[] }
export interface CreatorCard { user: UserBrief; profile?: Profile; match_pct: number | null; rating?: number; tools?: string[] }
export interface ExploreRes {
  posts: Post[]; creators: CreatorCard[]; next_cursor: string | null; total: number;
  parsed: { semantic_query: string; filters: Record<string, unknown> } | null;
}
export interface Structured {
  title: string; goal: string | null; target_audience: string | null; format: "video" | "image" | "audio" | "mixed" | null;
  platform: string | null; duration_or_size: string | null; tone_and_style: string[];
  deliverables: { type: string; quantity: number }[]; budget_range_inr: { min: number | null; max: number | null };
  deadline_days: number | null; preferred_tools: string[]; must_have: string[]; avoid: string[];
  categories?: string[]; search_summary: string;
}
export interface Brief {
  id: number; title: string; raw_idea: string; structured: Structured; status: "open" | "in_progress" | "closed";
  created_at: string; brand: UserBrief; proposal_count: number; is_owner?: boolean; fit?: number | null; my_proposal_id?: number | null;
}
export interface Question { q: string; examples: string[]; key?: string }
export interface MatchScore {
  semantic: number; tools: number; budget: number; quality: number; total: number;
  vector_similarity: number; industry_overlap: number | null;
}
export interface Match {
  creator: UserBrief; score: MatchScore; why_match: string; strengths: string[]; watch_out: string;
  pieces: { post_id: number; caption: string; tools: string[]; tags: string[]; media: MediaItem | null }[];
  price_min: number; price_max: number; turnaround_days: number; tools: string[]; rating: number; rating_count: number;
  shortlisted: boolean;
}
export interface Milestone { id: number; title: string; amount_inr: number; status: "todo" | "in_progress" | "delivered" | "approved"; due_in_days: number }
export interface ProposalListItem {
  id: number; brief_id: number; brief_title: string; brief_status: string; creator: UserBrief; brand: UserBrief; text: string;
  price_inr: number; timeline_days: number; status: "pending" | "accepted" | "rejected" | "completed"; created_at: string;
  conversation_id: number | null; milestones: Milestone[]; review?: { rating: number; comment: string } | null;
}
export interface BriefProposal {
  id: number; creator: UserBrief; text: string; price_inr: number; timeline_days: number; status: string;
  created_at: string; rating: number; rating_count: number;
}
export interface Review { id: number; rating: number; comment: string; created_at: string; reviewer: UserBrief }
export interface Message {
  id: number; conversation_id: number; sender_id: number; body: string; attachment_url: string | null;
  created_at: string; read_at: string | null;
}
export interface Conversation {
  id: number; kind: "direct" | "proposal"; others: UserBrief[]; unread: number; last_message: Message | null;
  proposal: { proposal_id: number; brief_title: string; status: string; price_inr: number; milestones_total: number; milestones_approved: number } | null;
  updated_at: string;
}
export interface NotificationItem {
  id: number; type: string; text: string; read: boolean; group: "today" | "this_week" | "earlier"; created_at: string;
  actor: UserBrief | null; post_id: number | null; proposal_id: number | null; brief_id: number | null; conversation_id: number | null;
}
export interface Trending { tags: { tag: string; count: number }[]; tools: { tool: string; count: number }[] }
export interface Concept { name: string; image_prompt: string; palette: string[] }
export interface PriceSuggestion { low: number | null; mid: number | null; high: number | null; reasoning: string; sample_size?: number }
export interface SavedRes { posts: (Post & { collection: string })[]; creators: (UserBrief & { collection: string })[]; collections: string[] }
