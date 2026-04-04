import { useState } from 'react';
import { xiaohongshuSearch, xiaohongshuComments, xiaohongshuTrends } from '../../api/xiaohongshu';
import type { SearchResponse, CommentsResponse, TrendsResponse } from '../../api/xiaohongshu';
import { Search, MessageCircle, TrendingUp, Heart, Loader2, ExternalLink } from 'lucide-react';

type TabType = 'search' | 'comments' | 'trends';

export function XiaohongshuTool() {
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [keyword, setKeyword] = useState('');
  const [noteId, setNoteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [maxResults, _setMaxResults] = useState(20);
  const [minLikes, setMinLikes] = useState(100);
  const [sortBy, setSortBy] = useState<'likes' | 'time'>('likes');

  // Comments state
  const [commentsResult, setCommentsResult] = useState<CommentsResponse | null>(null);

  // Trends state
  const [trendsResult, setTrendsResult] = useState<TrendsResponse | null>(null);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await xiaohongshuSearch({
        keyword: keyword.trim(),
        max_results: maxResults,
        min_likes: minLikes,
        sort_by: sortBy,
      });
      setSearchResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleComments = async () => {
    if (!noteId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await xiaohongshuComments({
        note_id: noteId.trim(),
        max_comments: 50,
        sort_by: 'likes',
      });
      setCommentsResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch comments failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTrends = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await xiaohongshuTrends({
        keyword: keyword.trim(),
      });
      setTrendsResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyze trends failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">小红书分析工具</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">搜索高赞内容、分析趋势、获取评论</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: 'search', label: '搜索笔记', icon: Search },
          { id: 'trends', label: '趋势分析', icon: TrendingUp },
          { id: 'comments', label: '评论获取', icon: MessageCircle },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as TabType)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors
              ${activeTab === id
                ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
            {error}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入关键词搜索..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'likes' | 'time')}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)]"
              >
                <option value="likes">按赞排序</option>
                <option value="time">按时间</option>
              </select>
              <input
                type="number"
                value={minLikes}
                onChange={(e) => setMinLikes(Number(e.target.value))}
                placeholder="最小点赞"
                className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)]"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !keyword.trim()}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2 text-white hover:bg-[var(--primary-dim)] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                搜索
              </button>
            </div>

            {searchResult && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-muted)]">
                  找到 {searchResult.total_found} 条结果
                </p>
                {searchResult.notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h3 className="font-medium text-[var(--text)]">{note.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">{note.content}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                      <span>作者: {note.author}</span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {note.likes}
                      </span>
                      <span>收藏: {note.collects}</span>
                      <span>评论: {note.comments_count}</span>
                      {note.published_at && (
                        <span>{new Date(note.published_at).toLocaleDateString()}</span>
                      )}
                      <a
                        href={note.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto flex items-center gap-1 text-[var(--primary)] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> 查看
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入关键词分析趋势..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                onKeyDown={(e) => e.key === 'Enter' && handleTrends()}
              />
              <button
                onClick={handleTrends}
                disabled={loading || !keyword.trim()}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2 text-white hover:bg-[var(--primary-dim)] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                分析
              </button>
            </div>

            {trendsResult && (
              <div className="space-y-6">
                <div className="rounded-lg bg-[var(--surface)] p-4">
                  <h3 className="font-medium text-[var(--text)]">趋势总结</h3>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{trendsResult.analysis.summary}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">基于 {trendsResult.based_on_notes} 条笔记分析</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="font-medium text-[var(--text)]">热门话题</h4>
                    <ul className="mt-2 space-y-1">
                      {trendsResult.analysis.hot_topics.map((topic, i) => (
                        <li key={i} className="text-sm text-[var(--text-muted)]">{topic}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="font-medium text-[var(--text)]">热门标签</h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {trendsResult.analysis.trending_tags.map((tag, i) => (
                        <span key={i} className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-muted)]">
                          {tag.tag} ({tag.frequency})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="font-medium text-[var(--text)]">内容模式</h4>
                    <ul className="mt-2 space-y-1">
                      {trendsResult.analysis.content_patterns.map((pattern, i) => (
                        <li key={i} className="text-sm text-[var(--text-muted)]">{pattern}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="font-medium text-[var(--text)]">高互动因素</h4>
                    <ul className="mt-2 space-y-1">
                      {trendsResult.analysis.engagement_factors.map((factor, i) => (
                        <li key={i} className="text-sm text-[var(--text-muted)]">{factor}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments Tab */}
        {activeTab === 'comments' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <input
                type="text"
                value={noteId}
                onChange={(e) => setNoteId(e.target.value)}
                placeholder="输入笔记 ID..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                onKeyDown={(e) => e.key === 'Enter' && handleComments()}
              />
              <button
                onClick={handleComments}
                disabled={loading || !noteId.trim()}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2 text-white hover:bg-[var(--primary-dim)] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                获取评论
              </button>
            </div>

            {commentsResult && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-muted)]">
                  共 {commentsResult.total_comments} 条评论（按{commentsResult.sort_by === 'likes' ? '赞' : '时间'}排序）
                </p>
                {commentsResult.comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text)]">{comment.author}</span>
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Heart className="h-3 w-3" /> {comment.likes}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{comment.content}</p>
                    {comment.is_top && (
                      <span className="mt-2 inline-block rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)]">置顶</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
