'use client';
import {useCallback, useEffect, useState} from 'react';

export type Step = {target: string; title: string; body: string};

const KEY = 'vidscope.tour.v1';
const PAD = 8;
// Approximate rendered card height, used only to decide above-or-below placement.
const CARD_H = 190;

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

  // Measure once synchronously so the spotlight is correct the moment a step opens,
  // then follow the target while the smooth scroll settles. Scroll events from the
  // page's scrolling element do not reliably reach a window listener here, so tracking
  // is driven by a frame loop, backed by timers because requestAnimationFrame is
  // suspended entirely while the tab is in the background.
  useEffect(() => {
    if (!open || !step) return;
    let last = '';
    const measure = () => {
      const node = document.querySelector(step.target);
      const rect = node ? node.getBoundingClientRect() : null;
      const key = rect ? `${rect.top}|${rect.left}|${rect.width}|${rect.height}` : 'none';
      if (key === last) return;
      last = key;
      setBox(rect);
    };
    measure();
    document.querySelector(step.target)?.scrollIntoView({block: 'center', behavior: 'smooth'});
    measure();

    let frame = 0;
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Catches the scroll settling when frames are not being served.
    const timers = [60, 200, 400, 700].map((ms) => setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', measure);
    };
  }, [open, step]);

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
  // Prefer sitting under the target, flip above when there is no room, and clamp to the
  // viewport either way so the card is never pushed off-screen by a tall target.
  const clamp = (value: number, max: number) => Math.max(16, Math.min(value, Math.max(16, max)));
  const below = !box || box.bottom + CARD_H + 16 < vh;
  const top = box
    ? clamp(below ? box.bottom + 14 : box.top - CARD_H - 14, vh - CARD_H - 16)
    : Math.max(16, vh / 2 - CARD_H / 2);
  const left = box ? clamp(box.left, vw - width - 16) : Math.max(16, (vw - width) / 2);
  const last = index >= live.length - 1;

  return (
    <>
      <div className="tour-backdrop" onClick={finish} />
      {box && (
        <div
          className="tour-spot"
          data-target={step.target}
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
