import React from "react";
import { Composition, registerRoot } from "remotion";
import { z } from "zod";
import { AIVideo, type AIVideoProps } from "./compositions/AIVideo";
import { type GeneratedScript, DEFAULT_STYLE } from "../lib/types";
import { CompositionStyleSchema } from "../lib/schemas";
import { ProductLaunch } from "./templates/product-launch/ProductLaunch";
import { ProductLaunchSchema } from "./templates/product-launch/schema";
import { Explainer } from "./templates/explainer/Explainer";
import { ExplainerSchema } from "./templates/explainer/schema";
import { SocialPromo } from "./templates/social-promo/SocialPromo";
import { SocialPromoSchema } from "./templates/social-promo/schema";
import { BrandStory } from "./templates/brand-story/BrandStory";
import { BrandStorySchema } from "./templates/brand-story/schema";
import { EditorialVideo } from "./compositions/EditorialVideo";
import { TextVideo } from "./compositions/TextVideo";
import { ImageSlideshow } from "./compositions/ImageSlideshow";
import { TextVideoSchema, ImageSlideshowSchema, CaptionedVideoSchema, StubCompositionSchema } from "./compositions/schemas";
import { CaptionedVideo } from "./compositions/CaptionedVideo";
import { MotionGraphics } from "./compositions/MotionGraphics";
import { DataVisualization } from "./compositions/DataVisualization";
import { ExplainerVideo as ExplainerVideoComp } from "./compositions/ExplainerVideo";
import { PromoVideo } from "./compositions/PromoVideo";

const sceneSchema = z.object({
  scene_number: z.number(),
  title: z.string(),
  visual_description: z.string(),
  narration_text: z.string(),
  duration_seconds: z.number(),
  camera_direction: z.string(),
  mood: z.string(),
  transition: z.enum(["cut", "fade", "dissolve", "wipe"]),
  videoUrl: z.string(),
  videoLocalPath: z.string().optional(),
});

const scriptSchema = z.object({
  title: z.string(),
  theme: z.string(),
  target_audience: z.string(),
  music_prompt: z.string(),
  scenes: z.array(sceneSchema),
  total_duration_seconds: z.number(),
  musicUrl: z.string().optional(),
});

const propsSchema = z.object({
  script: scriptSchema,
  compositionStyle: CompositionStyleSchema.optional(),
});

const FPS = 30;
const INTRO_OUTRO_SECONDS = 6; // 3s intro + 3s outro

const defaultScript: GeneratedScript = {
  title: "Sample AI Video",
  theme: "technology",
  target_audience: "general",
  music_prompt: "upbeat electronic background music",
  total_duration_seconds: 10,
  scenes: [
    {
      scene_number: 1,
      title: "Introduction",
      visual_description: "A futuristic cityscape at sunset",
      narration_text: "Welcome to the future of AI-generated video.",
      duration_seconds: 5,
      camera_direction: "slow zoom in",
      mood: "inspiring",
      transition: "fade",
      videoUrl: "https://example.com/placeholder.mp4",
    },
    {
      scene_number: 2,
      title: "Conclusion",
      visual_description: "A montage of technology innovations",
      narration_text: "The possibilities are endless.",
      duration_seconds: 5,
      camera_direction: "pan right",
      mood: "hopeful",
      transition: "cut",
      videoUrl: "https://example.com/placeholder2.mp4",
    },
  ],
};

const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Legacy AIVideo composition */}
      <Composition<typeof propsSchema, AIVideoProps>
        id="AIVideo"
        component={AIVideo}
        fps={FPS}
        width={1920}
        height={1080}
        schema={propsSchema}
        defaultProps={{ script: defaultScript, compositionStyle: DEFAULT_STYLE }}
        calculateMetadata={({ props }) => {
          return {
            durationInFrames: Math.round(
              (props.script.total_duration_seconds + INTRO_OUTRO_SECONDS) * FPS
            ),
          };
        }}
      />

      {/* Product Launch template */}
      <Composition
        id="ProductLaunch"
        component={ProductLaunch}
        fps={FPS}
        width={1920}
        height={1080}
        schema={ProductLaunchSchema}
        defaultProps={{
          brandName: "Product",
          tagline: "Your tagline here",
          productImages: [],
          features: ["Feature 1", "Feature 2"],
          brandColor: "#1a1a2e",
        }}
        calculateMetadata={({ props }) => {
          // Intro(4s) + Features(8s) + Showcase(6s * min(images,2)) + Reveal(5s)
          const showcaseCount = Math.min(props.productImages.length, 2);
          const totalSeconds = 4 + 8 + showcaseCount * 6 + 5;
          return { durationInFrames: totalSeconds * FPS };
        }}
      />

      {/* Explainer template */}
      <Composition
        id="Explainer"
        component={Explainer}
        fps={FPS}
        width={1920}
        height={1080}
        schema={ExplainerSchema}
        defaultProps={{
          title: "How It Works",
          steps: [
            { title: "Step 1", description: "First step description" },
            { title: "Step 2", description: "Second step description" },
          ],
          conclusion: "Now you understand!",
        }}
        calculateMetadata={({ props }) => {
          // Intro(7s) + Steps(12s each) + Summary(9s)
          const totalSeconds = 7 + props.steps.length * 12 + 9;
          return { durationInFrames: totalSeconds * FPS };
        }}
      />

      {/* Social Media Promo template */}
      <Composition
        id="SocialPromo"
        component={SocialPromo}
        fps={FPS}
        width={1920}
        height={1080}
        schema={SocialPromoSchema}
        defaultProps={{
          hook: "You need this!",
          productImage: "",
          features: ["Fast", "Easy"],
          cta: "Try Now",
          aspectRatio: "16:9" as const,
        }}
        calculateMetadata={({ props }) => {
          // Hook(2s) + ProductFlash(3s) + FeatureBurst(1s * features) + CTA(3s)
          const totalSeconds = 2 + 3 + props.features.length + 3;
          return { durationInFrames: totalSeconds * FPS };
        }}
      />

      {/* Brand Story template */}
      <Composition
        id="BrandStory"
        component={BrandStory}
        fps={FPS}
        width={1920}
        height={1080}
        schema={BrandStorySchema}
        defaultProps={{
          companyName: "Company",
          mission: "Our mission statement",
          teamPhotos: [],
          milestones: [
            { year: "2020", event: "Founded" },
            { year: "2024", event: "Milestone reached" },
          ],
          vision: "Our vision for the future",
        }}
        calculateMetadata={({ props }) => {
          // Opening(5s) + Milestones(max(4s, milestones*2s)) + Team(4s) + Vision(5s)
          const milestoneDuration = Math.max(4, props.milestones.length * 2);
          const totalSeconds = 5 + milestoneDuration + 4 + 5;
          return { durationInFrames: totalSeconds * FPS };
        }}
      />
      {/* Text Video — animated text on gradient backgrounds */}
      <Composition
        id="TextVideo"
        component={TextVideo}
        fps={FPS}
        width={1920}
        height={1080}
        schema={TextVideoSchema}
        defaultProps={{
          lines: ["Hello World", "This is a text video", "Created with FlowMotion"],
          durationPerSlide: 3,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.lines.length * props.durationPerSlide * FPS,
        })}
      />

      {/* Image Slideshow — images with crossfade transitions */}
      <Composition
        id="ImageSlideshow"
        component={ImageSlideshow}
        fps={FPS}
        width={1920}
        height={1080}
        schema={ImageSlideshowSchema}
        defaultProps={{
          images: [],
          durationPerSlide: 4,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, props.images.length) * props.durationPerSlide * FPS,
        })}
      />

      {/* Captioned Video — overlay captions on user-uploaded video */}
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo}
        fps={FPS}
        width={1920}
        height={1080}
        schema={CaptionedVideoSchema}
        defaultProps={{
          videoSrc: "",
          captions: [],
        }}
        calculateMetadata={({ props }) => {
          // Duration based on last caption end time, or default 30s
          const lastCaption = props.captions[props.captions.length - 1];
          const durationMs = lastCaption ? lastCaption.endMs + 1000 : 30000;
          return {
            durationInFrames: Math.round((durationMs / 1000) * FPS),
          };
        }}
      />

      {/* Motion Graphics — animated gradient title card */}
      <Composition
        id="MotionGraphics"
        component={MotionGraphics}
        schema={StubCompositionSchema}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={5 * FPS}
        defaultProps={{
          title: "Motion Graphics",
          subtitle: "Animated title card",
        }}
      />

      {/* Data Visualization — bar chart stub */}
      <Composition
        id="DataVisualization"
        component={DataVisualization}
        schema={StubCompositionSchema}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={5 * FPS}
        defaultProps={{
          title: "Data Overview",
          subtitle: "Quarterly performance",
        }}
      />

      {/* Explainer Video — step-by-step text reveal */}
      <Composition
        id="ExplainerVideoStub"
        component={ExplainerVideoComp}
        schema={StubCompositionSchema}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={12 * FPS}
        defaultProps={{
          title: "How It Works",
          subtitle: "A step-by-step guide",
        }}
      />

      {/* Promo Video — product headline + CTA card */}
      <Composition
        id="PromoVideo"
        component={PromoVideo}
        schema={StubCompositionSchema}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={5 * FPS}
        defaultProps={{
          title: "Introducing FlowMotion",
          subtitle: "Try It Free",
        }}
      />

      {/* Editorial Video — polished beat-driven motion graphics (4K coordinate space) */}
      <Composition
        id="EditorialVideo"
        component={EditorialVideo}
        fps={30}
        width={3840}
        height={2160}
        defaultProps={{
          spec: {
            meta: {
              title: "Editorial Preview",
              fps: 30,
              width: 1920,
              height: 1080,
              durationInFrames: 900,
              durationSec: 30,
              audioMode: "silent",
              preset: "editorial-generator",
              background: "#f4ede4",
              ink: "#15120f",
              fontFamily: "Manrope, SF Pro Display, system-ui, sans-serif",
            },
            assets: [],
            beats: [],
            anchors: [],
          },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.spec.meta.durationInFrames,
          fps: props.spec.meta.fps,
          width: props.spec.meta.width,
          height: props.spec.meta.height,
        })}
      />
    </>
  );
};

registerRoot(RemotionRoot);
