import { drawToJpeg } from '@/lib/media/downscale';

/**
 * Frame extraction for the video path (P2, stretch). The video itself is
 * never uploaded — only the extracted JPEG frames, which then flow through
 * the exact same pipeline as the photo path.
 */

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
const FRAME_COUNT = 6;

/** Thrown when the video itself is fine but exceeds the length cap. Distinct
 * from a generic extraction failure so the caller can show a specific message
 * instead of falling back to the photo uploader. */
export class VideoTooLongError extends Error {}

function waitFor(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      reject(new Error('Could not read that video.'));
    };
    video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
  });
}

/**
 * Seeks to 6 evenly spaced timestamps and draws each to a canvas. Rejects
 * with VideoTooLongError if the clip exceeds MAX_VIDEO_SECONDS; rejects with
 * a plain Error for anything else (unreadable file, decode failure, no
 * canvas support) so the caller can fall back to the photo uploader.
 */
export async function extractFramesFromVideo(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const metadataLoaded = waitFor(video, 'loadedmetadata');
    video.src = url;
    await metadataLoaded;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not read that video.');
    }
    if (duration > MAX_VIDEO_SECONDS) {
      throw new VideoTooLongError(
        `That video is ${Math.round(duration)}s long — max is ${MAX_VIDEO_SECONDS}s.`,
      );
    }

    // Best-effort decode nudge; some mobile browsers won't seek reliably
    // until playback has started at least once. Safe to ignore if blocked.
    try {
      await video.play();
      video.pause();
    } catch {
      // ignore — proceed to seek regardless
    }

    const frames: string[] = [];
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const seeked = waitFor(video, 'seeked');
      video.currentTime = (duration * (i + 0.5)) / FRAME_COUNT;
      await seeked;
      frames.push(drawToJpeg(video, video.videoWidth, video.videoHeight));
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
