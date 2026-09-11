'use client';
import {ShieldCheck, Loader2, Info} from 'lucide-react';
import {type Trust, VERDICT_LABEL} from '@/lib/trust';
import {type Video} from '@/lib/videos';
import {Thumb} from './poster';
import {canPlayInPage} from '@/lib/embed';

export type Analysis = {
  state: 'idle' | 'running' | 'ok' | 'unavailable' | 'not_configured' | 'unsupported' | 'error';
  results: Trust[];
  message?: string;
  ms?: number;
  analysed?: number;
};

const tone = (v: Trust['verdict']) =>
  v === 'verified' ? 'verified' : v === 'promising' ? 'promising' : v === 'caution' ? 'caution' : '';

export function TrustChip({trust, compact = false}: {trust: Trust; compact?: boolean}) {
  return (
    <span
      className={'trust-chip ' + tone(trust.verdict)}
      title={`Trust ${trust.score}/100 from ${trust.sample} substantive comments. ${trust.counts.outcome} report it worked, ${trust.counts.complaint} report problems.`}
    >
      <ShieldCheck size={12} />
      <b>{trust.score}</b>
      {!compact && <em>· {VERDICT_LABEL[trust.verdict]}</em>}
    </span>
  );
}

function Bars({trust}: {trust: Trust}) {
  const rows: [string, number][] = [
    ['Worked for', trust.parts.outcome],
    ['Authentic', trust.parts.authenticity],
    ['Positive', trust.parts.sentiment],
  ];
  return (
    <div className="verdict-bars">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <i>
            <b style={{width: Math.round(Math.max(2, value * 100)) + '%'}} />
          </i>
        </div>
      ))}
    </div>
  );
}

export function Verdict({
  analysis,
  byId,
  onExplain,
  onPlay,
}: {
  analysis: Analysis;
  byId: Map<string, Video>;
  onExplain: () => void;
  onPlay: (video: Video) => void;
}) {
  if (analysis.state === 'idle') return null;

  const top = analysis.results.filter((r) => byId.has(r.id)).slice(0, 3);
  const comments = analysis.results.reduce((sum, r) => sum + r.sample, 0);

  return (
    <section className="verdict" aria-label="Comment-verified picks">
      <div className="verdict-head">
        <h3>
          <ShieldCheck size={17} />
          Top picks, verified by comments
        </h3>
        {analysis.state === 'ok' && (
          <p>
            {comments.toLocaleString()} substantive comments read across {analysis.analysed} videos
            {analysis.ms ? ` in ${(analysis.ms / 1000).toFixed(1)}s` : ''}
          </p>
        )}
        <span className="spacer" />
        <button type="button" onClick={onExplain}>
          <Info size={13} />
          How this is scored
        </button>
      </div>

      {analysis.state === 'running' && (
        <div className="analysing">
          <Loader2 className="spin" size={16} />
          Reading comments and filtering bot replies…
        </div>
      )}

      {analysis.state !== 'running' && !top.length && (
        <p className="verdict-empty">
          {analysis.message ||
            'No video in this result set had enough genuine comments to rank. Comment data is available for YouTube results only.'}
        </p>
      )}

      {analysis.state === 'ok' && top.length > 0 && (
        <div className="verdict-grid">
          {top.map((trust, i) => {
            const video = byId.get(trust.id)!;
            const proof = trust.evidence[0];
            return (
              <article className="verdict-card" key={trust.id}>
                <Thumb video={video} eager onPlay={canPlayInPage(video) ? () => onPlay(video) : undefined}>
                  <span className="verdict-rank">#{i + 1}</span>
                </Thumb>
                <div>
                  <h4>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        if (!canPlayInPage(video)) return;
                        e.preventDefault();
                        onPlay(video);
                      }}
                    >
                      {video.title}
                    </a>
                  </h4>
                  <div className="verdict-meta">
                    <TrustChip trust={trust} />
                    <span>{video.creator}</span>
                  </div>
                  <Bars trust={trust} />
                  {proof && (
                    <p className={'quote ' + (proof.kind === 'complaint' ? 'complaint' : '')}>
                      “{proof.text}”
                      <span>
                        {proof.author?.startsWith('@') ? proof.author : 'Viewer comment'} ·{' '}
                        {proof.likes.toLocaleString()} likes
                      </span>
                    </p>
                  )}
                  {trust.flags.length > 0 && (
                    <div className="verdict-flags">
                      {trust.flags.slice(0, 2).map((f) => (
                        <span key={f}>{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
