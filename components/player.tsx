'use client';
import {useEffect, useState} from 'react';
import {X, ArrowUpRight, Eye, Heart, MessageCircle, Loader2} from 'lucide-react';
import {type Video, languageOf, languageLabel} from '@/lib/videos';
import {embedFor} from '@/lib/embed';
import {type Trust, VERDICT_LABEL} from '@/lib/trust';
import {TrustChip} from './verdict';

const fmt = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(n);

export function Player({
  video,
  trust,
  onClose,
}: {
  video: Video | null;
  trust?: Trust;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const embed = video ? embedFor(video) : null;

  useEffect(() => setReady(false), [video?.url]);

  useEffect(() => {
    if (!video) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    // Hold the page still behind the modal.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = previous;
    };
  }, [video, onClose]);

  if (!video) return null;
  const language = languageOf(video);

  return (
    <div className="player-backdrop" onClick={onClose} role="dialog" aria-label={video.title}>
      <div
        className={'player-shell ' + (embed?.ratio || 'landscape')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="player-frame">
          {embed ? (
            <>
              {!ready && (
                <span className="player-loading">
                  <Loader2 className="spin" size={22} />
                </span>
              )}
              <iframe
                key={embed.src}
                src={embed.src}
                title={video.title}
                allow={embed.allow}
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setReady(true)}
              />
            </>
          ) : (
            <div className="player-none">
              <p>{video.platform} does not offer an embeddable player for this link.</p>
              <a className="search-submit" href={video.url} target="_blank" rel="noopener noreferrer">
                Watch on {video.platform}
                <ArrowUpRight size={17} />
              </a>
            </div>
          )}
        </div>

        <div className="player-side">
          <button className="player-close" onClick={onClose} aria-label="Close player">
            <X size={18} />
          </button>
          <span className={'source-label ' + video.platform.toLowerCase()}>{video.platform}</span>
          <h3>{video.title}</h3>
          <p className="player-creator">
            {video.creator}
            {video.published
              ? ' · ' + new Date(video.published).toLocaleDateString('en', {month: 'short', day: 'numeric', year: 'numeric'})
              : ''}
            {language ? ' · ' + languageLabel(language) : ''}
          </p>

          <div className="player-metrics">
            {([[Eye, video.views, 'Views'], [Heart, video.likes, 'Likes'], [MessageCircle, video.comments, 'Comments']] as const).map(
              ([Icon, n, label]) => (
                <div key={label}>
                  <span>
                    <Icon size={13} />
                    {label}
                  </span>
                  <strong className={n === null ? 'unknown' : ''}>{fmt(n)}</strong>
                </div>
              ),
            )}
          </div>

          {trust && (
            <div className="player-trust">
              <TrustChip trust={trust} />
              <p>
                {trust.sample} substantive comments read. {trust.counts.outcome} report it worked,{' '}
                {trust.counts.complaint} report problems, {trust.counts.noise} low-effort replies discarded.
              </p>
              {trust.evidence[0] && (
                <p className={'quote ' + (trust.evidence[0].kind === 'complaint' ? 'complaint' : '')}>
                  “{trust.evidence[0].text}”
                  <span>{trust.evidence[0].likes.toLocaleString()} likes · {VERDICT_LABEL[trust.verdict]}</span>
                </p>
              )}
            </div>
          )}

          {video.description && <p className="player-desc">{video.description.slice(0, 420)}</p>}

          <a className="player-out" href={video.url} target="_blank" rel="noopener noreferrer">
            Open on {video.platform}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </div>
  );
}
