import { buildTokenTrackSegments } from "./script";
import { referenceTokens, quietMotionPreset } from "./tokens";
import type {
  AssetRole,
  EditorialAsset,
  EditorialBeat,
  EditorialPresetName,
  EditorialVideoSpec,
  NarrativeBeat,
  NarrativeBeatSheet,
  TextPhrase,
} from "./types";

type AssetLibrary = Partial<Record<AssetRole, EditorialAsset>>;
type AssetInput = AssetLibrary | EditorialAsset[];

const DEFAULT_FPS = 60;
const DEFAULT_WIDTH = 3840;
const DEFAULT_HEIGHT = 2160;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toFrames = (seconds: number) => Math.max(1, Math.round(seconds * DEFAULT_FPS));

const assertPhraseDensity = (phrases: string[], beatId: string) => {
  phrases.forEach((phrase) => {
    const wordCount = phrase.split(/\s+/).filter(Boolean).length;
    if (wordCount > 4) {
      throw new Error(`Beat ${beatId} is too dense for editorial copy: "${phrase}"`);
    }
  });
};

const catalogFromAssets = (assets: AssetInput) => {
  if (Array.isArray(assets)) {
    return assets;
  }

  return Object.values(assets).filter((asset): asset is EditorialAsset => Boolean(asset));
};

const libraryFromAssets = (assets: AssetInput): AssetLibrary => {
  if (!Array.isArray(assets)) {
    return assets;
  }

  return assets.reduce<AssetLibrary>((library, asset) => {
    if (!library[asset.role]) {
      library[asset.role] = asset;
    }
    return library;
  }, {});
};

const resolveAsset = (
  assets: AssetInput,
  beat: Pick<NarrativeBeat, "assetId" | "assetRole" | "id">,
): EditorialAsset => {
  const catalog = catalogFromAssets(assets);

  if (beat.assetId) {
    const directAsset = catalog.find((asset) => asset.id === beat.assetId);
    if (directAsset) {
      return directAsset;
    }
    throw new Error(`Missing curated asset ${beat.assetId} in beat ${beat.id}`);
  }

  if (!beat.assetRole) {
    throw new Error(`Beat ${beat.id} requires an asset role`);
  }

  const library = libraryFromAssets(assets);
  const roleAsset = library[beat.assetRole] ?? catalog.find((asset) => asset.role === beat.assetRole);
  if (!roleAsset) {
    throw new Error(`Missing curated asset for role ${beat.assetRole} in beat ${beat.id}`);
  }

  return roleAsset;
};

const textPhrase = (
  id: string,
  text: string,
  x: number,
  y: number,
  tier: TextPhrase["tier"],
  cueFrame: number,
  align: TextPhrase["align"] = "left",
): TextPhrase => ({
  id,
  text,
  x,
  y,
  tier,
  cueFrame,
  align,
});

const buildRevealLayout = (layoutHint: NarrativeBeat["layoutHint"]) => {
  // All layouts ensure text and images occupy separate non-overlapping zones.
  // Canvas: 3840x2160. Safe margins: 220px horizontal, 160px vertical.
  switch (layoutHint) {
    case "hero-top":
      // Text top-left, image right half
      return {
        frameBox: { x: 1960, y: 400, width: 1600, height: 1200 },
        caption: { x: 280, y: 500, width: 1500, align: "left" as const, tier: "editorial" as const },
      };
    case "gallery-left":
      // Image left third, text right two-thirds
      return {
        frameBox: { x: 280, y: 480, width: 1400, height: 1100 },
        caption: { x: 1880, y: 680, width: 1600, align: "left" as const, tier: "editorial" as const },
      };
    case "gallery-right":
      // Text left two-thirds, image right third
      return {
        frameBox: { x: 2160, y: 480, width: 1400, height: 1100 },
        caption: { x: 280, y: 680, width: 1600, align: "left" as const, tier: "editorial" as const },
      };
    case "full-bleed":
      // Image top half, text below
      return {
        frameBox: { x: 480, y: 200, width: 2880, height: 1100 },
        caption: { x: 480, y: 1480, width: 2880, align: "center" as const, tier: "editorial" as const },
      };
    case "contrast-split":
      // No image, text only — centered
      return {
        frameBox: { x: 1400, y: 700, width: 1040, height: 800 },
        caption: { x: 1920, y: 480, width: 2000, align: "center" as const, tier: "editorial" as const },
      };
    default:
      // Text left, image right (clean two-column)
      return {
        frameBox: { x: 2000, y: 500, width: 1500, height: 1100 },
        caption: { x: 280, y: 700, width: 1500, align: "left" as const, tier: "editorial" as const },
      };
  }
};

const transitionMotion = (hint: NarrativeBeat["transitionHint"]) => {
  switch (hint) {
    case "crisp":
      return {
        ...quietMotionPreset,
        fadeInFrames: 12,
        fadeOutFrames: 10,
        driftY: 0,
        scaleTo: 1.01,
      };
    case "glide":
      return {
        ...quietMotionPreset,
        fadeInFrames: 18,
        fadeOutFrames: 14,
        driftX: 10,
        driftY: 6,
        scaleTo: 1.018,
      };
    case "lift":
      return {
        ...quietMotionPreset,
        fadeInFrames: 16,
        fadeOutFrames: 14,
        driftY: -8,
        scaleTo: 1.012,
      };
    default:
      return quietMotionPreset;
  }
};

const scaleDurations = (beats: NarrativeBeat[], targetFrames: number) => {
  const totalFrames = beats.reduce((total, beat) => total + toFrames(beat.durationSec), 0);
  const ratio = targetFrames / totalFrames;

  return beats.map((beat) => ({
    ...beat,
    scaledFrames: Math.max(60, Math.round(toFrames(beat.durationSec) * ratio)),
  }));
};

const normalizeTimeline = (
  beats: Array<NarrativeBeat & { scaledFrames: number }>,
  targetFrames: number,
) => {
  const normalized = beats.map((beat) => ({ ...beat }));
  const assigned = normalized.reduce((total, beat) => total + beat.scaledFrames, 0);
  const delta = targetFrames - assigned;

  if (delta !== 0 && normalized.length > 0) {
    const lastBeat = normalized[normalized.length - 1];
    lastBeat.scaledFrames += delta;
  }

  return normalized;
};

const compileBeat = (
  beat: NarrativeBeat & { scaledFrames: number },
  startFrame: number,
  assets: AssetInput,
  index: number,
  total: number,
): EditorialBeat => {
  assertPhraseDensity(beat.copyFragments, beat.id);
  const durationInFrames = beat.scaledFrames;

  if (beat.rhythm === "blank" && index === total - 1) {
    return {
      id: beat.id,
      kind: "end-fade",
      startFrame,
      durationInFrames,
    };
  }

  if (beat.rhythm === "blank") {
    return {
      id: beat.id,
      kind: "blank-hold",
      startFrame,
      durationInFrames,
    };
  }

  if (beat.rhythm === "whisper") {
    return {
      id: beat.id,
      kind: "text-track",
      startFrame,
      durationInFrames,
      motion: transitionMotion(beat.transitionHint),
      segments: buildTokenTrackSegments({
        beatId: beat.id,
        fragments: beat.copyFragments,
        granularity: beat.granularity ?? "word",
        durationInFrames,
        fontSize: beat.granularity === "letter" ? 56 : 64,
        fontWeight: 520,
        layout: "scatter",
        centerX: 1920,
        baselineY: 1080,
        cueStart: 10,
        cueStep: beat.granularity === "letter" ? 4 : 12,
        holdEnd: Math.max(42, durationInFrames - 24),
        scatterOffsets: [
          { x: -520, y: -300 },
          { x: -170, y: -420 },
          { x: 30, y: 240 },
          { x: 190, y: -120 },
          { x: -120, y: 380 },
          { x: 310, y: -250 },
          { x: -340, y: 110 },
          { x: 470, y: 220 },
          { x: 110, y: -360 },
          { x: -470, y: -80 },
          { x: 390, y: 60 },
          { x: -70, y: 320 },
        ],
      }),
    };
  }

  if (beat.rhythm === "reveal") {
    const asset = resolveAsset(assets, beat);
    const layout = buildRevealLayout(beat.layoutHint);
    const captionText = beat.copyFragments[1] ?? beat.copyFragments[0] ?? "";
    const kickerText =
      beat.sectionTitle && beat.sectionTitle !== beat.copyFragments[0]
        ? beat.sectionTitle
        : beat.copyFragments.length > 1
          ? beat.copyFragments[0]
          : undefined;
    return {
      id: beat.id,
      kind: "image-card",
      startFrame,
      durationInFrames,
      assetId: asset.id,
      motion: transitionMotion(beat.transitionHint),
      frameBox: layout.frameBox,
      kicker: kickerText
        ? textPhrase(
            `${beat.id}-kicker`,
            kickerText,
            layout.caption.x,
            layout.caption.y - 80,
            "micro",
            4,
            layout.caption.align,
          )
        : undefined,
      caption: textPhrase(
        `${beat.id}-caption`,
        captionText,
        layout.caption.x,
        layout.caption.y,
        layout.caption.tier,
        6,
        layout.caption.align,
      ),
    };
  }

  if (beat.rhythm === "contrast") {
    const asset = resolveAsset(assets, beat);
    return {
      id: beat.id,
      kind: "split-word-object",
      startFrame,
      durationInFrames,
      motion: transitionMotion(beat.transitionHint),
      assetId: asset.id,
      frameBox: {
        x: 1520,
        y: 580,
        width: 800,
        height: 1000,
      },
      leftPhrase: textPhrase(`${beat.id}-left`, beat.copyFragments[0] ?? "others", 500, 1080, "editorial", 8, "center"),
      rightPhrase: textPhrase(`${beat.id}-right`, beat.copyFragments[1] ?? "don't", 3340, 1080, "editorial", 12, "center"),
    };
  }

  const asset = resolveAsset(assets, beat);
  const layout = buildRevealLayout(beat.layoutHint);
  const captionText = beat.copyFragments[1] ?? beat.copyFragments[0] ?? "";
  const kickerText =
    beat.sectionTitle && beat.sectionTitle !== beat.copyFragments[0]
      ? beat.sectionTitle
      : beat.copyFragments.length > 1
        ? beat.copyFragments[0]
        : undefined;
  return {
    id: beat.id,
    kind: index === total - 2 ? "soft-pan-still" : "image-card",
    startFrame,
    durationInFrames,
    motion: transitionMotion(beat.transitionHint),
    assetId: asset.id,
    frameBox:
      index === total - 2 && beat.layoutHint !== "gallery-left" && beat.layoutHint !== "gallery-right"
        ? {
            x: 480,
            y: 200,
            width: 2880,
            height: 1100,
          }
        : layout.frameBox,
    kicker: kickerText
      ? textPhrase(
          `${beat.id}-kicker`,
          kickerText,
          layout.caption.x,
          layout.caption.y - 80,
          "micro",
          6,
          layout.caption.align,
        )
      : undefined,
    caption: captionText
      ? textPhrase(
          `${beat.id}-caption`,
          captionText,
          layout.caption.x,
          layout.caption.y,
          layout.caption.tier,
          8,
          layout.caption.align,
        )
      : undefined,
    hazeOpacity: 0.12,
  };
};

export const compileBeatSheetToSpec = (
  beatSheet: NarrativeBeatSheet,
  assets: AssetInput,
  preset: EditorialPresetName = "editorial-generator",
): EditorialVideoSpec => {
  if (beatSheet.beats.length < 5 || beatSheet.beats.length > 8) {
    throw new Error(`Editorial beat sheets must contain 5-8 beats, received ${beatSheet.beats.length}`);
  }

  const targetDurationSec = clamp(beatSheet.durationSec, 30, 45);
  const targetFrames = toFrames(targetDurationSec);
  const scaled = normalizeTimeline(scaleDurations(beatSheet.beats, targetFrames), targetFrames);
  const catalog = catalogFromAssets(assets);

  let cursor = 0;
  const beats = scaled.map((beat, index) => {
    const compiled = compileBeat(beat, cursor, assets, index, scaled.length);
    cursor += beat.scaledFrames;
    return compiled;
  });

  const dominantImageCounts = beats.map((beat) => {
    switch (beat.kind) {
      case "image-card":
      case "soft-pan-still":
      case "split-word-object":
        return 1;
      default:
        return 0;
    }
  });

  if (dominantImageCounts.some((count) => count > 1)) {
    throw new Error("A beat may not contain more than one dominant image");
  }

  const usedAssetIds = new Set(
    beats.flatMap((beat) => {
      switch (beat.kind) {
        case "image-card":
        case "soft-pan-still":
        case "split-word-object":
          return [beat.assetId];
        default:
          return [];
      }
    }),
  );

  return {
    meta: {
      title: "Editorial Generator",
      fps: DEFAULT_FPS,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      durationInFrames: targetFrames,
      durationSec: targetFrames / DEFAULT_FPS,
      audioMode: "silent",
      preset,
      background: referenceTokens.background,
      ink: referenceTokens.ink,
      fontFamily: referenceTokens.fontFamily,
    },
    assets: catalog.filter((asset) => usedAssetIds.has(asset.id)),
    beats: beats.map((beat) => ({
      ...beat,
      motion: beat.motion ?? quietMotionPreset,
    })),
    anchors: [],
  };
};
