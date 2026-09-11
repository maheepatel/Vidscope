'use client';
import {useState} from 'react';
import {Play} from 'lucide-react';
import {type Video, posterSeed, derivedThumbnail} from '@/lib/videos';

// Instagram and TikTok links arrive from the web index with no image. Where a poster
// can be derived from the URL we try it, and every row that still has no usable image
// gets a generated tile instead of an empty grey box.
export function Thumb({
  video,
  eager = false,
  children,
  className = 'thumbnail',
  onPlay,
}: {
  video: Video;
  eager?: boolean;
  children?: React.ReactNode;
  className?: string;
  // When the platform offers an embeddable player, clicking opens it in place.
  // Without this the thumbnail stays an ordinary link out to the source.
  onPlay?: () => void;
}) {
  const sources = [video.thumbnail, derivedThumbnail(video.url)].filter(Boolean) as string[];
  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];
  const {hue, initials} = posterSeed(video);

  return (
    <a
      className={className}
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={(onPlay ? 'Play ' : 'Watch ') + video.title}
      onClick={
        onPlay
          ? (e) => {
              // Leave modified clicks alone so "open in new tab" still works.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onPlay();
            }
          : undefined
      }
    >
      <div className="poster" style={{['--h' as string]: hue}} aria-hidden="true">
        <b>{initials}</b>
        <small>{video.platform}</small>
      </div>
      {src ? (
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          referrerPolicy="no-referrer"
          onError={() => setAttempt((n) => n + 1)}
        />
      ) : null}
      <span className="play-overlay">
        <Play size={24} fill="white" />
      </span>
      {children}
    </a>
  );
}
