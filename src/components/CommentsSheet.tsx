import React, { useState } from 'react';
import {
  CornerDownRight,
  Pin,
  Send,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { CommentItem, ShortVideoItem, UserProfile } from '../types/shorts';
import { formatCompactCount, formatRelativeTime } from '../utils/effects';

interface CommentsSheetProps {
  video: ShortVideoItem | null;
  profile: UserProfile;
  onClose: () => void;
  onAddComment: (videoId: string, text: string, parentCommentId?: string) => void;
  onToggleCommentLike: (videoId: string, commentId: string, replyId?: string) => void;
  onTogglePinComment: (videoId: string, commentId: string) => void;
  onDeleteComment: (videoId: string, commentId: string, replyId?: string) => void;
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({
  video,
  profile,
  onClose,
  onAddComment,
  onToggleCommentLike,
  onTogglePinComment,
  onDeleteComment,
}) => {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);

  if (!video) return null;

  const sortedComments = [...video.comments].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.createdAt - a.createdAt;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment(video.id, trimmed, replyingTo?.id);
    setDraft('');
    setReplyingTo(null);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
        aria-hidden="true"
      />

      {/* Responsive Container: Mobile Bottom Sheet / Desktop Docked Side Panel */}
      <aside
        aria-label="Panel komentar"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col rounded-t-3xl border-t border-white/10 bg-[#141419] shadow-2xl lg:static lg:z-auto lg:h-[calc(100dvh-2rem)] lg:max-h-[880px] lg:w-[390px] lg:shrink-0 lg:rounded-2xl lg:border"
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-bold text-white">Komentar</h3>
            <span className="tabular-nums text-xs font-medium text-zinc-400">
              {formatCompactCount(video.comments.length)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup komentar"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comment List */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {sortedComments.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-zinc-300">
                Belum ada komentar
              </p>
              <p className="mt-1 max-w-[24ch] text-xs text-zinc-500">
                Tambahkan catatan atau komentar pertamamu untuk video ini.
              </p>
            </div>
          ) : (
            sortedComments.map((comment) => (
              <div key={comment.id} className="space-y-3">
                <div className="flex gap-3">
                  <img
                    src={comment.authorAvatar}
                    alt={comment.authorName}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">
                        {comment.authorHandle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(comment.createdAt)}</span>
                      {comment.isPinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[#FF2D55] font-medium">
                            <Pin className="h-3 w-3" />
                            Disematkan
                          </span>
                        </>
                      )}
                    </div>

                    <p className="mt-1 break-words text-sm leading-relaxed text-zinc-100">
                      {comment.text}
                    </p>

                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                      <button
                        type="button"
                        onClick={() => onToggleCommentLike(video.id, comment.id)}
                        className={`inline-flex min-h-[32px] items-center gap-1.5 transition hover:text-white ${
                          comment.likedByMe ? 'text-[#FF2D55] font-semibold' : ''
                        }`}
                      >
                        <ThumbsUp
                          className={`h-3.5 w-3.5 ${
                            comment.likedByMe ? 'fill-[#FF2D55]' : ''
                          }`}
                        />
                        <span className="tabular-nums">
                          {comment.likes > 0 ? comment.likes : 'Suka'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReplyingTo(comment)}
                        className="min-h-[32px] transition hover:text-white"
                      >
                        Balas
                      </button>

                      <button
                        type="button"
                        onClick={() => onTogglePinComment(video.id, comment.id)}
                        className="min-h-[32px] transition hover:text-white"
                      >
                        {comment.isPinned ? 'Lepas' : 'Sematkan'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteComment(video.id, comment.id)}
                        aria-label="Hapus komentar"
                        className="ml-auto flex min-h-[32px] min-w-[32px] items-center justify-center text-zinc-500 transition hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies.length > 0 && (
                  <div className="ml-11 space-y-3 border-l border-white/10 pl-3">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex gap-2.5">
                        <img
                          src={reply.authorAvatar}
                          alt={reply.authorName}
                          referrerPolicy="no-referrer"
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <span className="font-semibold text-zinc-200">
                              {reply.authorHandle}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeTime(reply.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 break-words text-sm text-zinc-100">
                            {reply.text}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                            <button
                              type="button"
                              onClick={() =>
                                onToggleCommentLike(video.id, comment.id, reply.id)
                              }
                              className={`inline-flex items-center gap-1 transition hover:text-white ${
                                reply.likedByMe ? 'text-[#FF2D55] font-semibold' : ''
                              }`}
                            >
                              <ThumbsUp className="h-3 w-3" />
                              <span className="tabular-nums">
                                {reply.likes > 0 ? reply.likes : 'Suka'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onDeleteComment(video.id, comment.id, reply.id)
                              }
                              aria-label="Hapus balasan"
                              className="ml-auto text-zinc-500 transition hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Sticky Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-white/10 bg-[#141419] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
              <span className="flex items-center gap-1.5 truncate">
                <CornerDownRight className="h-3.5 w-3.5 text-[#FF2D55]" />
                Membalas {replyingTo.authorHandle}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="ml-2 text-zinc-400 hover:text-white"
              >
                Batal
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <img
              src={profile.avatarDataUrl}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full object-cover border border-white/15"
            />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                replyingTo
                  ? `Balas ${replyingTo.authorHandle}...`
                  : 'Tulis komentar...'
              }
              className="h-11 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Kirim komentar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF2D55] text-white transition hover:bg-[#e6244a] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
};
