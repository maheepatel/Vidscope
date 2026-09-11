'use client';
import {useCallback, useEffect, useState} from 'react';

export type Step = {target: string; title: string; body: string};

const KEY = 'vidscope.tour.v1';
const PAD = 8;

export function tourWasSeen() {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return true; // Storage blocked: treat the tour as seen rather than nagging every visit.
  }
}

export function Tour({steps, open, onClose}: {steps: Step[]; open: boolean; onClose: () => void}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);

  // Only steps whose target is actually on the page: the verdict panel and the
  // platform tabs do not exist before the first search.
  const live = steps.filter((s) => (typeof document === 'undefined' ? true : document.querySelector(s.target)));
  const step = live[Math.min(index, live.length - 1)];

  const place = useCallback(() => {
    if (!step) return;
    const node = document.querySelector(step.target);
    setBox(node ? node.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!open || !step) return;
    document.querySelector(step.target)?.scrollIntoView({block: 'center', behavior: 'smooth'});
    const timer = setTimeout(place, 320);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, step, place]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(KEY, 'done');
    } catch {}
    setIndex(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setIndex((n) => Math.min(n + 1, live.length - 1));
      if (e.key === 'ArrowLeft') setIndex((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, finish, live.length]);

  if (!open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(330, vw - 32);
  const below = !box || box.bottom + 190 < vh;
  const top = box ? (below ? box.bottom + 14 : Math.max(16, box.top - 190)) : vh / 2 - 90;
  const left = box ? Math.min(Math.max(16, box.left), vw - width - 16) : (vw - width) / 2;
  const last = index >= live.length - 1;

  return (
    <>
      <div className="tour-backdrop" onClick={finish} />
      {box && (
        <div
          className="tour-spot"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
          }}
        />
      )}
      <div className="tour-card" role="dialog" aria-label={step.title} style={{top, left, width}}>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-foot">
          <small>
            {index + 1} / {live.length}
          </small>
          <button type="button" onClick={finish}>
            {last ? 'Close' : 'Skip'}
          </button>
          {!last && (
            <button type="button" className="primary" onClick={() => setIndex((n) => n + 1)}>
              Next
            </button>
          )}
          {last && (
            <button type="button" className="primary" onClick={finish}>
              Got it
            </button>
          )}
        </div>
      </div>
    </>
  );
}
