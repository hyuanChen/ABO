export interface SearchRequest {
  keyword: string;
  max_results?: number;
  min_likes?: number;
  sort_by?: 'likes' | 'time';
}

export interface SearchResponse {
  keyword: string;
  total_found: number;
  notes: {
    id: string;
    title: string;
    content: string;
    author: string;
    likes: number;
    collects: number;
    comments_count: number;
    url: string;
    published_at: string | null;
  }[];
}

export interface CommentsRequest {
  note_id: string;
  max_comments?: number;
  sort_by?: 'likes' | 'time';
}

export interface CommentsResponse {
  note_id: string;
  total_comments: number;
  sort_by: string;
  comments: {
    id: string;
    author: string;
    content: string;
    likes: number;
    is_top: boolean;
  }[];
}

export interface TrendsRequest {
  keyword: string;
}

export interface TrendsResponse {
  keyword: string;
  analysis: {
    hot_topics: string[];
    trending_tags: { tag: string; frequency: number }[];
    content_patterns: string[];
    audience_insights: string[];
    engagement_factors: string[];
    summary: string;
  };
  based_on_notes: number;
}

const API_BASE = 'http://127.0.0.1:8765/api/tools';

export async function xiaohongshuSearch(req: SearchRequest): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function xiaohongshuComments(req: CommentsRequest): Promise<CommentsResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Fetch comments failed');
  return res.json();
}

export async function xiaohongshuTrends(req: TrendsRequest): Promise<TrendsResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/trends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Analyze trends failed');
  return res.json();
}
