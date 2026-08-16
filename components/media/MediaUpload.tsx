'use client';

import { useRef, useState } from 'react';
import type { BuildingReport, Category, CategoryStat, ErrorCode, MediaAnalysis, MediaFinding } from '@/lib/types';
import { SEVERITY_CHIP, SEVERITY_LABEL, humanizeCategory } from '@/components/report/reportFormat';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';
import { downscaleImageFile } from '@/lib/media/downscale';
import { extractFramesFromVideo, MAX_VIDEO_BYTES, VideoTooLongError } from '@/lib/media/videoFrames';

interface MediaUploadProps {
  report: BuildingReport;
}

interface PendingFrame {
  id: string;
  dataUrl: string;
}

type Status = 'idle' | 'loading' | 'results' | 'error';

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ERROR_COPY: Record<ErrorCode, { title: string; message: string }> = {
  RATE_LIMITED: {
    title: 'Too many requests right now',
    message: 'Wait a moment and try analyzing again.',
  },
  UPSTREAM_DOWN: {
    title: "Photo review isn't responding",
    message: 'This is on our end, not yours. It usually clears up quickly — try again.',
  },
  BAD_INPUT: {
    title: "Something's off with those photos",
    message: 'Try removing one and analyzing again.',
  },
  NOT_FOUND: {
    title: 'Something went wrong',
    message: 'Try again.',
  },
};

function isMediaAnalysis(value: unknown): value is MediaAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as MediaAnalysis;
  return (
    typeof candidate.frameCount === 'number' &&
    Array.isArray(candidate.findings) &&
    typeof candidate.disclaimer === 'string'
  );
}

function categoryLabel(key: Category, categories: CategoryStat[]): string {
  return categories.find((c) => c.key === key)?.label ?? humanizeCategory(key);
}

/** The demo moment: a finding whose category the city record also flags heavily. */
function highCountStat(key: Category, categories: CategoryStat[]): CategoryStat | null {
  const stat = categories.find((c) => c.key === key);
  return stat && stat.severity === 'high' ? stat : null;
}

function demoMomentMessage(stat: CategoryStat): string {
  if (stat.count24mo > 0) {
    return `This building has ${stat.count24mo} ${stat.label.toLowerCase()} complaint${
      stat.count24mo === 1 ? '' : 's'
    } in the last 24 months.`;
  }
  return `This building has ${stat.openCount} open ${stat.label.toLowerCase()} violation${
    stat.openCount === 1 ? '' : 's'
  }.`;
}

interface FindingGroup {
  category: Category;
  items: MediaFinding[];
  stat: CategoryStat | null;
}

function groupFindings(findings: MediaFinding[], categories: CategoryStat[]): FindingGroup[] {
  const order: Category[] = [];
  const byCategory = new Map<Category, MediaFinding[]>();

  for (const finding of findings) {
    if (!byCategory.has(finding.category)) {
      order.push(finding.category);
      byCategory.set(finding.category, []);
    }
    byCategory.get(finding.category)!.push(finding);
  }

  const groups = order.map((category) => ({
    category,
    items: byCategory.get(category)!,
    stat: highCountStat(category, categories),
  }));

  // Categories that line up with the city record float to the top — that link is the point.
  return groups.sort((a, b) => Number(b.stat !== null) - Number(a.stat !== null));
}

/**
 * The public-record fallback shown before any photo is uploaded. Skipping
 * upload is a valid path, not a degraded one.
 */
function NoMediaPanel({ report }: { report: BuildingReport }) {
  const questions = report.narrative?.questionsToAsk.slice(0, 5) ?? [];

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-900">Here&rsquo;s what the public record shows</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        No photos yet, and that&rsquo;s fine — the report above already reflects the city&rsquo;s
        records for this building.
      </p>
      {questions.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {questions.map((question) => (
            <li key={question} className="flex gap-2 text-xs leading-relaxed text-slate-700">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400">
                &#9744;
              </span>
              <span>{question}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs font-medium text-blue-700">
        Bring your phone to the viewing — a few photos there can connect what you see to what the
        city has on file.
      </p>
    </div>
  );
}

function FindingsResults({
  analysis,
  frames,
  categories,
  onStartOver,
}: {
  analysis: MediaAnalysis;
  frames: PendingFrame[];
  categories: CategoryStat[];
  onStartOver: () => void;
}) {
  const groups = groupFindings(analysis.findings, categories);

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <div className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
          Nothing stood out in these photos. That&rsquo;s an honest result, not a clean bill of
          health — it only means these {frames.length} photo{frames.length === 1 ? '' : 's'} didn&rsquo;t
          show anything worth flagging.
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.category} className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {categoryLabel(group.category, categories)}
              </h3>
              <ul className="space-y-2">
                {group.items.map((finding) => (
                  <li
                    key={finding.id}
                    className={cn(
                      'rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-200',
                      group.stat && 'border-l-4 border-l-blue-700',
                    )}
                  >
                    <div className="flex gap-3">
                      {frames[finding.frameIndex] ? (
                        <div className="shrink-0 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={frames[finding.frameIndex].dataUrl}
                            alt={`Source photo ${finding.frameIndex + 1}`}
                            className="h-14 w-14 rounded-lg object-cover ring-1 ring-inset ring-slate-200"
                          />
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            Photo {finding.frameIndex + 1}
                          </span>
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{finding.label}</p>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                              SEVERITY_CHIP[finding.confidence],
                            )}
                          >
                            {SEVERITY_LABEL[finding.confidence]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">{finding.note}</p>
                      </div>
                    </div>
                    {group.stat ? (
                      <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-medium leading-relaxed text-blue-900">
                        You spotted {finding.label.toLowerCase()} — {demoMomentMessage(group.stat)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">{analysis.disclaimer}</p>

      <Button type="button" variant="secondary" onClick={onStartOver}>
        Start over
      </Button>
    </div>
  );
}

/**
 * Photo (and stretch: video) upload for a building's media review. Everything
 * client-side is downscaled before it ever reaches our server — see
 * lib/media/downscale.ts and lib/media/videoFrames.ts.
 */
export function MediaUpload({ report }: MediaUploadProps) {
  const [frames, setFrames] = useState<PendingFrame[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode>('UPSTREAM_DOWN');
  const [notice, setNotice] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const nextFrameId = useRef(0);

  function makeFrameId(prefix: string): string {
    nextFrameId.current += 1;
    return `${prefix}-${nextFrameId.current}`;
  }

  async function addPhotoFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    const room = MAX_PHOTOS - frames.length;
    if (room <= 0) {
      setNotice(`Up to ${MAX_PHOTOS} photos at a time — remove one to add another.`);
      return;
    }

    const oversized = images.filter((f) => f.size > MAX_PHOTO_BYTES);
    const usable = images.filter((f) => f.size <= MAX_PHOTO_BYTES);
    const accepted = usable.slice(0, room);
    const skippedForRoom = usable.length - accepted.length;

    if (accepted.length === 0) {
      setNotice(oversized.length > 0 ? 'Each photo must be 8MB or smaller.' : null);
      return;
    }

    // allSettled, not all: one corrupt file in a multi-select shouldn't drop
    // the photos that decoded fine alongside it.
    const outcomes = await Promise.allSettled(accepted.map(downscaleImageFile));
    const dataUrls = outcomes
      .filter((o): o is PromiseFulfilledResult<string> => o.status === 'fulfilled')
      .map((o) => o.value);
    const failedCount = outcomes.length - dataUrls.length;

    if (dataUrls.length > 0) {
      setFrames((prev) => [
        ...prev,
        ...dataUrls.map((dataUrl) => ({ id: makeFrameId('photo'), dataUrl })),
      ]);
      setStatus('idle');
      setAnalysis(null);
    }

    const notices: string[] = [];
    if (failedCount > 0) {
      notices.push(`${failedCount} photo${failedCount === 1 ? '' : 's'} couldn't be read`);
    }
    if (oversized.length > 0) {
      notices.push(`${oversized.length} photo${oversized.length === 1 ? '' : 's'} over 8MB skipped`);
    }
    if (skippedForRoom > 0) {
      notices.push(`${skippedForRoom} skipped — ${MAX_PHOTOS} photo max`);
    }
    setNotice(notices.length > 0 ? `${notices.join('; ')}.` : null);
  }

  async function handleVideoFile(file: File) {
    setNotice(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setNotice(`That video is ${Math.round(file.size / 1e6)}MB — max is 50MB.`);
      return;
    }
    if (frames.length >= MAX_PHOTOS) {
      setNotice(`Up to ${MAX_PHOTOS} photos at a time — remove some first, then upload a video.`);
      return;
    }

    setVideoBusy(true);
    try {
      const extracted = await extractFramesFromVideo(file);
      const room = MAX_PHOTOS - frames.length;
      const kept = extracted.slice(0, room);
      setFrames((prev) => [...prev, ...kept.map((dataUrl) => ({ id: makeFrameId('video'), dataUrl }))]);
      setStatus('idle');
      setAnalysis(null);
      if (kept.length < extracted.length) {
        setNotice(`Kept ${kept.length} of ${extracted.length} extracted frames — ${MAX_PHOTOS} photo max.`);
      }
    } catch (error) {
      if (error instanceof VideoTooLongError) {
        setNotice(error.message);
      } else {
        setNotice("Couldn't process that video — try uploading a few photos instead.");
      }
    } finally {
      setVideoBusy(false);
    }
  }

  function removeFrame(id: string) {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  }

  function startOver() {
    setFrames([]);
    setStatus('idle');
    setAnalysis(null);
    setNotice(null);
  }

  async function analyze() {
    if (frames.length === 0) return;
    setStatus('loading');
    setNotice(null);

    try {
      const response = await fetch('/api/analyze-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: frames.map((f) => f.dataUrl) }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (payload && typeof payload === 'object' && 'error' in payload) {
        const err = (payload as { error: { code?: string } }).error;
        const code = typeof err?.code === 'string' ? err.code : 'UPSTREAM_DOWN';
        setErrorCode(code in ERROR_COPY ? (code as ErrorCode) : 'UPSTREAM_DOWN');
        setStatus('error');
        return;
      }
      if (!response.ok || typeof payload !== 'object' || payload === null) {
        setErrorCode('UPSTREAM_DOWN');
        setStatus('error');
        return;
      }
      const result = (payload as { analysis?: unknown }).analysis;
      if (!isMediaAnalysis(result)) {
        setErrorCode('UPSTREAM_DOWN');
        setStatus('error');
        return;
      }
      setAnalysis(result);
      setStatus('results');
    } catch {
      setErrorCode('UPSTREAM_DOWN');
      setStatus('error');
    }
  }

  const canAddMore = frames.length < MAX_PHOTOS && status !== 'loading' && !videoBusy;

  return (
    <div className="space-y-4">
      {canAddMore ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void addPhotoFiles(Array.from(event.dataTransfer.files ?? []));
          }}
          className={cn(
            'rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white',
          )}
        >
          <p className="text-sm text-slate-600">
            Drag photos here, or
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="mx-1 font-semibold text-blue-700 underline underline-offset-2"
            >
              choose files
            </button>
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="secondary" onClick={() => cameraInputRef.current?.click()}>
              Take a photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={videoBusy}
              onClick={() => videoInputRef.current?.click()}
            >
              {videoBusy ? 'Reading video…' : 'Upload a video (beta)'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Up to {MAX_PHOTOS} photos, 8MB each. Video: max 60s, 50MB — only the extracted frames
            are uploaded, never the video itself.
          </p>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void addPhotoFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void addPhotoFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleVideoFile(file);
              event.target.value = '';
            }}
          />
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="text-xs text-amber-800">
          {notice}
        </p>
      ) : null}

      {frames.length > 0 && status !== 'results' ? (
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            {frames.map((frame) => (
              <li key={frame.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frame.dataUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-inset ring-slate-200"
                />
                {status !== 'loading' ? (
                  <button
                    type="button"
                    onClick={() => removeFrame(frame.id)}
                    aria-label="Remove photo"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white shadow"
                  >
                    &times;
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {status === 'loading' ? (
            <div className="space-y-2" role="status" aria-label="Analyzing photos">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <p className="text-xs text-slate-500">Looking through {frames.length} photo{frames.length === 1 ? '' : 's'}…</p>
            </div>
          ) : (
            <Button type="button" onClick={() => void analyze()}>
              Analyze {frames.length} photo{frames.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">{ERROR_COPY[errorCode].title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{ERROR_COPY[errorCode].message}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void analyze()}>
            Try again
          </Button>
        </div>
      ) : null}

      {status === 'results' && analysis ? (
        <FindingsResults
          analysis={analysis}
          frames={frames}
          categories={report.categories}
          onStartOver={startOver}
        />
      ) : null}

      {frames.length === 0 && status !== 'loading' ? <NoMediaPanel report={report} /> : null}
    </div>
  );
}
