import type { MediaAnalysis, MediaFinding } from '@/lib/types';

/**
 * PERSON C OWNS THIS FILE — replace the body of analyzeFrames() with the real
 * vision call. The route (app/api/analyze-media/route.ts) already handles
 * request validation, the error contract, and the response envelope, so
 * nothing outside this file needs to change.
 *
 * Contract to keep:
 *  - frameCount must equal frames.length
 *  - every finding's frameIndex must be a valid index into frames
 *  - disclaimer must be non-empty; it is rendered next to every finding
 *  - throw on failure; the route maps that to UPSTREAM_DOWN
 */

export const MEDIA_DISCLAIMER =
  'Automated review of renter-submitted photos. This is not a professional inspection, it cannot confirm or rule out any condition, and it carries no legal weight. Findings point to things worth asking about in person.';

/** Stub findings, cycled across whatever frames were submitted. */
const STUB_FINDINGS: Omit<MediaFinding, 'id' | 'frameIndex'>[] = [
  {
    label: 'Possible water staining on ceiling',
    category: 'plumbing',
    confidence: 'medium',
    note: 'Discoloration consistent with a past or active leak from the unit above. Ask when it was last repaired and whether the source was found.',
  },
  {
    label: 'Peeling paint on wall surface',
    category: 'structural',
    confidence: 'medium',
    note: 'In a building built before 1960, peeling paint raises a lead-paint question. Ask for the most recent lead inspection record.',
  },
  {
    label: 'Radiator present, condition unclear',
    category: 'heat_hot_water',
    confidence: 'low',
    note: 'A radiator is visible but the image cannot show whether it heats. Ask to test it during the walkthrough, out of season if necessary.',
  },
  {
    label: 'No smoke detector visible in frame',
    category: 'safety',
    confidence: 'low',
    note: 'A detector may simply be out of frame. Confirm working smoke and carbon monoxide detectors in every required location.',
  },
  {
    label: 'Gap at baseboard',
    category: 'pests',
    confidence: 'low',
    note: 'Openings at the baseboard are a common pest entry point. Ask about recent extermination visits and whether gaps were sealed.',
  },
];

/**
 * STUB — deterministic, no model call. Returns one finding per frame, cycling
 * the canned list, so the frontend gets realistic shapes and valid indices for
 * any frame count.
 */
export async function analyzeFrames(frames: string[]): Promise<MediaAnalysis> {
  const findings: MediaFinding[] = frames.map((_, frameIndex) => {
    const template = STUB_FINDINGS[frameIndex % STUB_FINDINGS.length];
    return {
      id: `stub-${frameIndex + 1}`,
      label: template.label,
      category: template.category,
      confidence: template.confidence,
      frameIndex,
      note: template.note,
    };
  });

  return {
    frameCount: frames.length,
    findings,
    disclaimer: MEDIA_DISCLAIMER,
  };
}
