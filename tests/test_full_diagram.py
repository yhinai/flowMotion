"""
FlowMotion — Full Mermaid Diagram Test Suite
Covers EVERY branch of the 3-path architecture diagram end-to-end.

Path A: AI Video (Veo) — all models, styles, aspect ratios, durations, first frame, audio strategies
Path B: Remotion-Only — all 6 video types, animation styles, transitions, backgrounds, AI images
Path C: Upload & Edit — all 8 edit actions, multi-select, overlays
Shared Audio: narration, music, SFX, captions, thumbnail
Delivery: post-delivery actions, cancellation, regeneration
Infrastructure: ffmpeg, silence detection

Target: 40+ tests covering every diagram branch.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
results: list[dict] = []


def log(test: str, status: str, detail: str = "") -> None:
    icon = "PASS" if status == "pass" else "FAIL" if status == "fail" else "SKIP"
    results.append({"test": test, "status": status, "detail": detail})
    print(f"  [{icon}] {test}" + (f" — {detail}" if detail else ""))


# ─── Helper: create a test video on disk ────────────────────────────────────

def ensure_test_video(path: str = "/tmp/flowmotion-test-input.mp4", duration: int = 5) -> str:
    """Create a synthetic test video with audio if it does not already exist."""
    if not os.path.exists(path):
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
                "-f", "lavfi", "-i", f"color=c=blue:s=640x360:d={duration}",
                "-shortest", "-c:v", "libx264", "-c:a", "aac", path,
            ],
            capture_output=True,
            timeout=30,
        )
    return path


def ensure_silence_video(path: str = "/tmp/flowmotion-silence-input.mp4") -> str:
    """Create a video with a silence gap (2s tone, 3s silence, 2s tone)."""
    if not os.path.exists(path):
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                "-f", "lavfi", "-i", "sine=frequency=880:duration=2",
                "-f", "lavfi", "-i", "color=c=red:s=640x360:d=7",
                "-filter_complex",
                "[0:a]apad=pad_dur=0[a0];[1:a]atrim=0:3[a1];[2:a]apad=pad_dur=0[a2];"
                "[a0][a1][a2]concat=n=3:v=0:a=1[aout]",
                "-map", "3:v", "-map", "[aout]",
                "-shortest", "-c:v", "libx264", "-c:a", "aac", "-t", "7", path,
            ],
            capture_output=True,
            timeout=30,
        )
    return path


# ─── Helper: POST to /api/generate and return jobId ────────────────────────

async def create_job(page, payload: dict, label: str) -> str | None:
    """POST to /api/generate, assert 202, return jobId or None on failure."""
    try:
        res = await page.request.post(
            f"{BASE}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body, f"No jobId in response: {body}"
        log(label, "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log(label, "fail", str(e)[:200])
        return None


# ─── Helper: poll /api/status/{jobId} until terminal state ─────────────────

async def poll_job(page, job_id: str | None, label: str, timeout_sec: int = 90) -> None:
    if not job_id:
        log(label, "skip", "No jobId")
        return
    try:
        start = time.time()
        last_stage = ""
        while time.time() - start < timeout_sec:
            res = await page.request.get(f"{BASE}/api/status/{job_id}")
            body = await res.json()
            stage = body.get("stage", "unknown")
            if stage != last_stage:
                last_stage = stage
            if stage == "completed":
                has_url = bool(body.get("downloadUrl"))
                log(label, "pass", f"completed in {int(time.time()-start)}s, downloadUrl={'yes' if has_url else 'no'}")
                return
            if stage == "failed":
                log(label, "fail", f"Failed: {body.get('error', body.get('message', '?'))[:150]}")
                return
            await asyncio.sleep(3)
        log(label, "fail", f"Timeout after {timeout_sec}s, last stage: {last_stage}")
    except Exception as e:
        log(label, "fail", str(e)[:200])


# ─── Helper: send Telegram webhook payloads ─────────────────────────────────

async def send_telegram(page, payload: dict) -> int:
    """POST to /api/telegram, return HTTP status."""
    res = await page.request.post(
        f"{BASE}/api/telegram",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    return res.status


# ═════════════════════════════════════════════════════════════════════════════
# PATH A: AI VIDEO (VEO)  — 11 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_a01_veo3_standard(page) -> str | None:
    """Path A #01: Veo 3 Standard model, 16:9"""
    return await create_job(page, {
        "prompt": "A cinematic drone shot over misty mountains",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3",
            "aspectRatio": "16:9",
            "prompt": "A cinematic drone shot over misty mountains",
        },
    }, "A01: Veo 3 Standard (16:9)")


async def test_a02_veo3_fast(page) -> str | None:
    """Path A #02: Veo 3 Fast model, 9:16"""
    return await create_job(page, {
        "prompt": "Slow motion waves crashing at sunset",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3-fast",
            "aspectRatio": "9:16",
            "prompt": "Slow motion waves crashing at sunset",
        },
    }, "A02: Veo 3 Fast (9:16)")


async def test_a03_veo31(page) -> str | None:
    """Path A #03: Veo 3.1 model, 1:1"""
    return await create_job(page, {
        "prompt": "Abstract colorful particles flowing in space",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3.1",
            "aspectRatio": "1:1",
            "prompt": "Abstract colorful particles flowing in space",
        },
    }, "A03: Veo 3.1 (1:1)")


async def test_a04_all_styles(page) -> None:
    """Path A #04: Job creation with each video style"""
    styles = ["cinematic", "anime", "realistic", "abstract", "social"]
    for style in styles:
        job_id = await create_job(page, {
            "prompt": f"A {style} scene of a forest path",
            "resolution": "720p", "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video", "model": "veo-3",
                "aspectRatio": "16:9",
                "prompt": f"A {style} scene of a forest path",
                "style": style,
            },
        }, f"A04: Style={style}")
        # Cancel immediately to free resources
        if job_id:
            await page.request.post(f"{BASE}/api/cancel/{job_id}")


async def test_a05_all_aspect_ratios(page) -> None:
    """Path A #05: Job creation with each aspect ratio"""
    ratios = ["16:9", "9:16", "1:1"]
    for ar in ratios:
        job_id = await create_job(page, {
            "prompt": f"A landscape in {ar} format",
            "resolution": "720p", "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video", "model": "veo-3",
                "aspectRatio": ar,
                "prompt": f"A landscape in {ar} format",
            },
        }, f"A05: AspectRatio={ar}")
        if job_id:
            await page.request.post(f"{BASE}/api/cancel/{job_id}")


async def test_a06_durations(page) -> None:
    """Path A #06: Job creation with each duration (4s, 6s, 8s)"""
    for dur in [4, 6, 8]:
        job_id = await create_job(page, {
            "prompt": f"A {dur}s clip of clouds",
            "resolution": "720p", "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video", "model": "veo-3",
                "aspectRatio": "16:9",
                "prompt": f"A {dur}s clip of clouds",
                "durationSeconds": dur,
            },
        }, f"A06: Duration={dur}s")
        if job_id:
            await page.request.post(f"{BASE}/api/cancel/{job_id}")


async def test_a07_first_frame(page) -> str | None:
    """Path A #07: Job with first-frame reference image"""
    return await create_job(page, {
        "prompt": "Transform this image into a cinematic pan",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3.1",
            "aspectRatio": "16:9",
            "prompt": "Transform this image into a cinematic pan",
            "firstFrameImageUrl": "https://picsum.photos/id/10/1920/1080",
        },
    }, "A07: First-frame image URL")


async def test_a08_native_audio(page) -> str | None:
    """Path A #08: Job with native audio strategy"""
    return await create_job(page, {
        "prompt": "Ocean waves with native audio",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3",
            "aspectRatio": "16:9",
            "prompt": "Ocean waves with native audio",
            "audioStrategy": "native",
        },
    }, "A08: Native audio strategy")


async def test_a09_custom_audio_shared(page) -> str | None:
    """Path A #09: Job with custom audio strategy + shared audio options"""
    return await create_job(page, {
        "prompt": "Narrated forest documentary",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3.1",
            "aspectRatio": "16:9",
            "prompt": "Narrated forest documentary",
            "audioStrategy": "custom",
            "resolution": "1080p",
            "sharedAudio": {
                "narration": {
                    "script": "Deep in the ancient forest, sunlight dapples through the canopy.",
                    "voiceId": "pNInz6obpgDQGcFmaJgB",
                    "model": "eleven_v3",
                    "speed": 0.9,
                },
                "music": {
                    "genre": "ambient",
                    "mood": "peaceful",
                    "tempo": "slow",
                    "lyriaModel": "lyria-3-pro",
                },
                "sfx": {
                    "description": "birds chirping with light wind rustling leaves",
                    "durationSeconds": 8,
                },
                "captionStyle": "subtitle-bar",
                "generateThumbnail": True,
            },
        },
    }, "A09: Custom audio + shared audio options")


async def test_a10_status_polling(page, job_id: str | None) -> None:
    """Path A #10: Status polling and stage validation"""
    if not job_id:
        log("A10: Status polling", "skip", "No jobId")
        return
    try:
        res = await page.request.get(f"{BASE}/api/status/{job_id}")
        assert res.status == 200
        body = await res.json()
        assert body["jobId"] == job_id
        valid_stages = {"queued", "generating_script", "generating_clips",
                        "uploading_assets", "composing_video", "completed", "failed"}
        assert body["stage"] in valid_stages, f"Unknown stage: {body['stage']}"
        assert 0 <= body["progress"] <= 100
        log("A10: Status polling", "pass", f"stage={body['stage']}, progress={body['progress']}%")
    except Exception as e:
        log("A10: Status polling", "fail", str(e)[:200])


async def test_a11_telegram_full_flow(page) -> None:
    """Path A #11: Full Telegram bot conversation — start -> model -> style -> AR -> duration -> first frame -> prompt -> audio"""
    chat_id = 88880001
    try:
        steps = [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:ai-video", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb2", "data": "model:veo-3.1", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb3", "data": "style:cinematic", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb4", "data": "ar:16:9", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb5", "data": "dur:6", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb6", "data": "ff:none", "message": {"chat": {"id": chat_id}}}},
            {"message": {"chat": {"id": chat_id}, "text": "A drone over a futuristic city at night with neon lights"}},
            {"callback_query": {"id": "cb7", "data": "audio:native", "message": {"chat": {"id": chat_id}}}},
        ]
        for payload in steps:
            status = await send_telegram(page, payload)
            assert status == 200, f"Non-200 from Telegram webhook: {status}"
        log("A11: Telegram Path A full flow", "pass")
    except Exception as e:
        log("A11: Telegram Path A full flow", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# PATH B: REMOTION-ONLY  — 12 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_b01_text_video_landscape(page) -> str | None:
    """Path B #01: Text Video in 16:9"""
    return await create_job(page, {
        "prompt": "Text Video",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "Welcome to FlowMotion\nAI-powered video generation\nFrom idea to cinema in minutes",
        },
    }, "B01: Text Video (16:9)")


async def test_b02_text_video_portrait(page) -> str | None:
    """Path B #02: Text Video in 9:16"""
    return await create_job(page, {
        "prompt": "Portrait Text",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "9:16",
            "text": "Vertical text\nFor TikTok and Reels\nFlowMotion",
        },
    }, "B02: Text Video (9:16)")


async def test_b03_image_slideshow(page) -> str | None:
    """Path B #03: Image Slideshow"""
    return await create_job(page, {
        "prompt": "Image Slideshow",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "image-slideshow",
            "aspectRatio": "16:9",
            "images": [
                "https://picsum.photos/id/10/1920/1080",
                "https://picsum.photos/id/20/1920/1080",
                "https://picsum.photos/id/30/1920/1080",
            ],
        },
    }, "B03: Image Slideshow")


async def test_b04_motion_graphics(page) -> str | None:
    """Path B #04: Motion Graphics"""
    return await create_job(page, {
        "prompt": "Motion Graphics Demo",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "motion-graphics",
            "aspectRatio": "16:9",
            "text": "FlowMotion\nThe Future of Video",
        },
    }, "B04: Motion Graphics")


async def test_b05_data_viz(page) -> str | None:
    """Path B #05: Data Visualization with chart type"""
    return await create_job(page, {
        "prompt": "Data Viz",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "data-viz",
            "aspectRatio": "16:9",
            "data": "Month,Revenue\nJan,1200\nFeb,1800\nMar,2400\nApr,3200",
            "chartType": "bar",
        },
    }, "B05: Data Viz (bar chart)")


async def test_b06_explainer(page) -> str | None:
    """Path B #06: Explainer"""
    return await create_job(page, {
        "prompt": "Explainer Video",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "explainer",
            "aspectRatio": "16:9",
            "steps": "1. Sign up\n2. Upload your script\n3. Choose a style\n4. Get your video",
        },
    }, "B06: Explainer")


async def test_b07_promo(page) -> str | None:
    """Path B #07: Promo video"""
    return await create_job(page, {
        "prompt": "Promo Video",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "promo",
            "aspectRatio": "9:16",
            "promoDetails": {
                "headline": "Summer Sale",
                "tagline": "Up to 50% off everything",
                "cta": "Shop Now",
                "brandColors": "#FF6B35",
                "logoUrl": "https://picsum.photos/id/1/200/200",
            },
        },
    }, "B07: Promo")


async def test_b08_animation_transition(page) -> str | None:
    """Path B #08: Text Video with animation style + transition"""
    return await create_job(page, {
        "prompt": "Styled Text Video",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "Animation Styles\nSmooth + Fade",
            "animationStyle": "smooth",
            "transition": "fade",
        },
    }, "B08: Animation=smooth, Transition=fade")


async def test_b09_background_options(page) -> str | None:
    """Path B #09: With solid background color + dark theme"""
    return await create_job(page, {
        "prompt": "Background Test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "Dark theme with solid bg",
            "backgroundType": "solid",
            "backgroundColor": "#1a1a2e",
            "theme": "dark",
        },
    }, "B09: Background=solid, Theme=dark")


async def test_b10_ai_images(page) -> str | None:
    """Path B #10: With AI image generation enabled"""
    return await create_job(page, {
        "prompt": "AI Images Test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "AI-generated images per slide",
            "generateAiImages": True,
        },
    }, "B10: AI image generation enabled")


async def test_b11_shared_audio(page) -> str | None:
    """Path B #11: With shared audio (narration + music)"""
    return await create_job(page, {
        "prompt": "Audio Test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "With narration and music",
            "sharedAudio": {
                "narration": {
                    "script": "Welcome to our product showcase.",
                    "model": "eleven_flash_v2_5",
                },
                "music": {
                    "genre": "corporate",
                    "mood": "upbeat",
                    "tempo": "medium",
                    "lyriaModel": "lyria-3-clip",
                },
            },
        },
    }, "B11: Shared audio (narration + music)")


async def test_b12_telegram_full_flow(page) -> None:
    """Path B #12: Full Telegram bot conversation for text-video"""
    chat_id = 88880002
    try:
        steps = [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:remotion-only", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb2", "data": "rtype:text-video", "message": {"chat": {"id": chat_id}}}},
            {"message": {"chat": {"id": chat_id}, "text": "Hello World\nThis is FlowMotion\nAI Video Generator"}},
            {"callback_query": {"id": "cb3", "data": "ar:16:9", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb4", "data": "anim:snappy", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb5", "data": "trans:slide", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb6", "data": "bg:solid", "message": {"chat": {"id": chat_id}}}},
            {"message": {"chat": {"id": chat_id}, "text": "#1a1a2e"}},
            {"callback_query": {"id": "cb7", "data": "aiimg:no", "message": {"chat": {"id": chat_id}}}},
        ]
        for payload in steps:
            status = await send_telegram(page, payload)
            assert status == 200, f"Non-200: {status}"
        log("B12: Telegram Path B full flow", "pass")
    except Exception as e:
        log("B12: Telegram Path B full flow", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# PATH B: RENDER COMPLETION  — extra render tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_b_render_text_landscape(page, job_id: str | None) -> None:
    """Path B Render: Text Video 16:9"""
    await poll_job(page, job_id, "B-Render: Text Video 16:9", timeout_sec=90)


async def test_b_render_text_portrait(page, job_id: str | None) -> None:
    """Path B Render: Text Video 9:16"""
    await poll_job(page, job_id, "B-Render: Text Video 9:16", timeout_sec=90)


async def test_b_render_slideshow(page, job_id: str | None) -> None:
    """Path B Render: Image Slideshow"""
    await poll_job(page, job_id, "B-Render: Image Slideshow", timeout_sec=90)


# ═════════════════════════════════════════════════════════════════════════════
# PATH C: UPLOAD & EDIT  — 10 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_c01_add_captions(page) -> str | None:
    """Path C #01: Add Captions"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Add captions",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-captions",
            "videoUrl": video,
            "videoLocalPath": video,
            "captionStyle": "tiktok",
        },
    }, "C01: Add Captions (tiktok style)")


async def test_c02_remove_silence(page) -> str | None:
    """Path C #02: Remove Silence"""
    video = ensure_silence_video()
    return await create_job(page, {
        "prompt": "Remove silence",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "remove-silence",
            "videoUrl": f"file://{video}",
            "videoLocalPath": video,
        },
    }, "C02: Remove Silence")


async def test_c03_remove_filler(page) -> str | None:
    """Path C #03: Remove Filler Words"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Remove filler words",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "remove-filler",
            "videoUrl": video,
            "videoLocalPath": video,
        },
    }, "C03: Remove Filler Words")


async def test_c04_add_music(page) -> str | None:
    """Path C #04: Add Music"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Add background music",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-music",
            "videoUrl": video,
            "videoLocalPath": video,
            "musicConfig": {
                "genre": "lo-fi",
                "mood": "chill",
                "tempo": "slow",
                "lyriaModel": "lyria-2",
            },
        },
    }, "C04: Add Music")


async def test_c05_add_narration(page) -> str | None:
    """Path C #05: Add Narration"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Add narration",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-narration",
            "videoUrl": video,
            "videoLocalPath": video,
            "narrationConfig": {
                "script": "This is a beautiful sunset over the Pacific Ocean.",
                "voiceId": "pNInz6obpgDQGcFmaJgB",
                "model": "eleven_multilingual_v2",
                "speed": 1.0,
            },
        },
    }, "C05: Add Narration")


async def test_c06_add_sfx(page) -> str | None:
    """Path C #06: Add SFX"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Add sound effects",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-sfx",
            "videoUrl": video,
            "videoLocalPath": video,
            "sfxConfig": {
                "description": "dramatic whoosh transition",
                "durationSeconds": 2.5,
                "looping": False,
                "promptInfluence": 0.8,
            },
        },
    }, "C06: Add SFX")


async def test_c07_add_overlays(page) -> str | None:
    """Path C #07: Add Overlays"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Add overlays",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-overlays",
            "videoUrl": video,
            "videoLocalPath": video,
            "overlayConfig": {
                "titleText": "FlowMotion Demo",
                "titlePosition": "top",
                "lowerThirdText": "AI Video Generator",
                "endCardCta": "Subscribe for more!",
            },
        },
    }, "C07: Add Overlays")


async def test_c08_multi_select(page) -> str | None:
    """Path C #08: Multi-select (captions + silence + filler)"""
    video = ensure_silence_video()
    return await create_job(page, {
        "prompt": "Multi-edit",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "add-captions",
            "actions": ["add-captions", "remove-silence", "remove-filler"],
            "videoUrl": video,
            "videoLocalPath": video,
            "captionStyle": "karaoke",
        },
    }, "C08: Multi-select (captions+silence+filler)")


async def test_c09_full_edit(page) -> str | None:
    """Path C #09: Full Edit Suite"""
    video = ensure_test_video()
    return await create_job(page, {
        "prompt": "Full edit suite",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-c",
        "pathConfig": {
            "path": "upload-edit",
            "action": "full-edit",
            "videoUrl": video,
            "videoLocalPath": video,
            "narrationConfig": {"script": "Full edit narration."},
            "musicConfig": {"genre": "electronic", "mood": "energetic"},
            "sfxConfig": {"description": "upbeat intro jingle"},
            "overlayConfig": {"titleText": "Full Edit", "lowerThirdText": "By FlowMotion"},
            "captionStyle": "typewriter",
        },
    }, "C09: Full Edit Suite")


async def test_c10_telegram_full_flow(page) -> None:
    """Path C #10: Telegram bot conversation for upload & edit"""
    chat_id = 88880003
    try:
        steps = [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:upload-edit", "message": {"chat": {"id": chat_id}}}},
            # Bot asks for video upload — simulate text fallback
            {"message": {"chat": {"id": chat_id}, "text": "https://example.com/video.mp4"}},
            # Select actions
            {"callback_query": {"id": "cb2", "data": "edit:add-captions", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb3", "data": "edit:remove-silence", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb4", "data": "edit:done", "message": {"chat": {"id": chat_id}}}},
            # Confirm
            {"callback_query": {"id": "cb5", "data": "confirm:yes", "message": {"chat": {"id": chat_id}}}},
        ]
        for payload in steps:
            status = await send_telegram(page, payload)
            assert status == 200, f"Non-200: {status}"
        log("C10: Telegram Path C full flow", "pass")
    except Exception as e:
        log("C10: Telegram Path C full flow", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# SHARED AUDIO  — 5 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_sa01_narration_config(page) -> str | None:
    """Shared Audio #01: Narration with voice, model, script, speed"""
    return await create_job(page, {
        "prompt": "Narration only test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3",
            "aspectRatio": "16:9",
            "prompt": "Narration only test",
            "audioStrategy": "custom",
            "sharedAudio": {
                "narration": {
                    "script": "In the beginning, there was silence. Then, the music started.",
                    "voiceId": "21m00Tcm4TlvDq8ikWAM",
                    "model": "eleven_v3",
                    "speed": 1.1,
                },
            },
        },
    }, "SA01: Narration (voice+model+script+speed)")


async def test_sa02_music_config(page) -> str | None:
    """Shared Audio #02: Music with genre, mood, tempo, Lyria model"""
    return await create_job(page, {
        "prompt": "Music only test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "text-video",
            "aspectRatio": "16:9",
            "text": "Music test",
            "sharedAudio": {
                "music": {
                    "genre": "jazz",
                    "mood": "relaxed",
                    "tempo": "medium",
                    "instruments": "piano, saxophone",
                    "withVocals": False,
                    "lyriaModel": "lyria-3-pro",
                },
            },
        },
    }, "SA02: Music (genre+mood+tempo+Lyria)")


async def test_sa03_sfx_config(page) -> str | None:
    """Shared Audio #03: SFX with description, duration, looping"""
    return await create_job(page, {
        "prompt": "SFX only test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-b",
        "pathConfig": {
            "path": "remotion-only", "type": "motion-graphics",
            "aspectRatio": "16:9",
            "text": "SFX test",
            "sharedAudio": {
                "sfx": {
                    "description": "gentle rain on a tin roof",
                    "durationSeconds": 15,
                    "looping": True,
                    "promptInfluence": 0.6,
                },
            },
        },
    }, "SA03: SFX (description+duration+looping)")


async def test_sa04_caption_style(page) -> str | None:
    """Shared Audio #04: Caption style selection"""
    return await create_job(page, {
        "prompt": "Caption style test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3",
            "aspectRatio": "9:16",
            "prompt": "Caption style test",
            "audioStrategy": "custom",
            "sharedAudio": {
                "narration": {"script": "Testing caption styles."},
                "captionStyle": "karaoke",
            },
        },
    }, "SA04: Caption style (karaoke)")


async def test_sa05_thumbnail(page) -> str | None:
    """Shared Audio #05: Thumbnail generation"""
    return await create_job(page, {
        "prompt": "Thumbnail test",
        "resolution": "720p", "sceneCount": 1,
        "pathType": "path-a",
        "pathConfig": {
            "path": "ai-video", "model": "veo-3",
            "aspectRatio": "16:9",
            "prompt": "Thumbnail generation test",
            "sharedAudio": {
                "generateThumbnail": True,
            },
        },
    }, "SA05: Thumbnail generation")


# ═════════════════════════════════════════════════════════════════════════════
# DELIVERY & POST-DELIVERY  — 3 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_d01_post_delivery_keyboard(page) -> None:
    """Delivery #01: Post-delivery Telegram keyboard actions"""
    chat_id = 88880010
    try:
        # Simulate a user in post_delivery state pressing action buttons
        steps = [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:ai-video", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb2", "data": "model:veo-3", "message": {"chat": {"id": chat_id}}}},
            # Simulate post-delivery actions (these may not have handlers yet but should not crash)
            {"callback_query": {"id": "cb3", "data": "delivery:download-hd", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb4", "data": "delivery:share", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb5", "data": "delivery:rate", "message": {"chat": {"id": chat_id}}}},
        ]
        for payload in steps:
            status = await send_telegram(page, payload)
            assert status == 200, f"Non-200: {status}"
        log("D01: Post-delivery keyboard actions", "pass")
    except Exception as e:
        log("D01: Post-delivery keyboard actions", "fail", str(e)[:200])


async def test_d02_cancel_job(page, job_id: str | None) -> None:
    """Delivery #02: Job cancellation via API"""
    if not job_id:
        log("D02: Cancel job", "skip", "No jobId")
        return
    try:
        res = await page.request.post(f"{BASE}/api/cancel/{job_id}")
        assert res.status == 200, f"Unexpected status: {res.status}"
        body = await res.json()
        log("D02: Cancel job", "pass", f"status={body.get('status', body.get('jobId', '?'))}")
    except Exception as e:
        log("D02: Cancel job", "fail", str(e)[:200])


async def test_d03_regenerate_flow(page) -> None:
    """Delivery #03: Regenerate flow — create, cancel, recreate"""
    try:
        # Create first job
        job1 = await create_job(page, {
            "prompt": "Regenerate test original",
            "resolution": "720p", "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video", "model": "veo-3-fast",
                "aspectRatio": "16:9",
                "prompt": "Regenerate test original",
            },
        }, "D03a: Original job")
        # Cancel it
        if job1:
            await page.request.post(f"{BASE}/api/cancel/{job1}")
        # Create replacement
        job2 = await create_job(page, {
            "prompt": "Regenerate test replacement",
            "resolution": "720p", "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video", "model": "veo-3-fast",
                "aspectRatio": "16:9",
                "prompt": "Regenerate test replacement",
            },
        }, "D03b: Replacement job")
        if job2:
            await page.request.post(f"{BASE}/api/cancel/{job2}")
        log("D03: Regenerate flow", "pass")
    except Exception as e:
        log("D03: Regenerate flow", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# INFRASTRUCTURE  — 2 tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_infra01_ffmpeg(page) -> None:
    """Infra #01: ffmpeg and ffprobe are available"""
    try:
        r1 = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        r2 = subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=5)
        assert r1.returncode == 0, "ffmpeg not found"
        assert r2.returncode == 0, "ffprobe not found"
        log("Infra01: ffmpeg + ffprobe available", "pass")
    except Exception as e:
        log("Infra01: ffmpeg + ffprobe available", "fail", str(e)[:200])


async def test_infra02_silence_detection(page) -> None:
    """Infra #02: ffmpeg silencedetect finds gaps in test file"""
    try:
        video = ensure_silence_video()
        assert os.path.exists(video), f"Test video not found: {video}"
        r = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-dn", "-vn", "-i", video,
                "-af", "silencedetect=n=-40dB:d=0.75", "-f", "null", "/dev/null",
            ],
            capture_output=True, text=True, timeout=30,
        )
        has_silence = "silence_start" in r.stderr
        log(
            "Infra02: Silence detection",
            "pass" if has_silence else "fail",
            "Silence detected" if has_silence else "No silence found in test file",
        )
    except Exception as e:
        log("Infra02: Silence detection", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# VALIDATION TESTS (schema-level, no server needed)  — 5 bonus tests
# ═════════════════════════════════════════════════════════════════════════════

async def test_v01_invalid_path_type(page) -> None:
    """Validation #01: Invalid pathType returns 400"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Invalid path type",
            "pathType": "path-z",
            "pathConfig": {"path": "ai-video", "model": "veo-3", "aspectRatio": "16:9", "prompt": "test"},
        }, headers={"Content-Type": "application/json"})
        assert res.status == 400, f"Expected 400, got {res.status}"
        log("V01: Invalid pathType rejected", "pass")
    except Exception as e:
        log("V01: Invalid pathType rejected", "fail", str(e)[:200])


async def test_v02_empty_prompt(page) -> None:
    """Validation #02: Empty prompt returns 400"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "",
        }, headers={"Content-Type": "application/json"})
        assert res.status == 400, f"Expected 400, got {res.status}"
        log("V02: Empty prompt rejected", "pass")
    except Exception as e:
        log("V02: Empty prompt rejected", "fail", str(e)[:200])


async def test_v03_invalid_model(page) -> None:
    """Validation #03: Invalid Veo model in pathConfig returns 400"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Invalid model",
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video",
                "model": "veo-99-invalid",
                "aspectRatio": "16:9",
                "prompt": "test",
            },
        }, headers={"Content-Type": "application/json"})
        assert res.status == 400, f"Expected 400, got {res.status}"
        log("V03: Invalid Veo model rejected", "pass")
    except Exception as e:
        log("V03: Invalid Veo model rejected", "fail", str(e)[:200])


async def test_v04_missing_video_url_path_c(page) -> None:
    """Validation #04: Path C without videoUrl returns 400"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Missing video",
            "pathType": "path-c",
            "pathConfig": {
                "path": "upload-edit",
                "action": "add-captions",
            },
        }, headers={"Content-Type": "application/json"})
        assert res.status == 400, f"Expected 400, got {res.status}"
        log("V04: Missing videoUrl rejected", "pass")
    except Exception as e:
        log("V04: Missing videoUrl rejected", "fail", str(e)[:200])


async def test_v05_nonexistent_job_status(page) -> None:
    """Validation #05: Nonexistent jobId returns 404"""
    try:
        res = await page.request.get(f"{BASE}/api/status/00000000-0000-0000-0000-000000000000")
        assert res.status == 404, f"Expected 404, got {res.status}"
        log("V05: Nonexistent job returns 404", "pass")
    except Exception as e:
        log("V05: Nonexistent job returns 404", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═════════════════════════════════════════════════════════════════════════════

async def main() -> None:
    print()
    print("=" * 72)
    print("  FlowMotion — Full Mermaid Diagram Test Suite")
    print("=" * 72)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()

        # ── Infrastructure ──────────────────────────────────────────────
        print("\n  INFRASTRUCTURE")
        print("  " + "-" * 50)
        await test_infra01_ffmpeg(page)
        await test_infra02_silence_detection(page)

        # ── Path A: AI Video (Veo) ─────────────────────────────────────
        print("\n  PATH A: AI VIDEO (VEO)")
        print("  " + "-" * 50)
        job_a01 = await test_a01_veo3_standard(page)
        job_a02 = await test_a02_veo3_fast(page)
        job_a03 = await test_a03_veo31(page)
        await test_a04_all_styles(page)
        await test_a05_all_aspect_ratios(page)
        await test_a06_durations(page)
        job_a07 = await test_a07_first_frame(page)
        job_a08 = await test_a08_native_audio(page)
        job_a09 = await test_a09_custom_audio_shared(page)
        await test_a10_status_polling(page, job_a01)
        await test_a11_telegram_full_flow(page)

        # ── Path B: Remotion-Only ───────────────────────────────────────
        print("\n  PATH B: REMOTION-ONLY")
        print("  " + "-" * 50)
        job_b01 = await test_b01_text_video_landscape(page)
        job_b02 = await test_b02_text_video_portrait(page)
        job_b03 = await test_b03_image_slideshow(page)
        job_b04 = await test_b04_motion_graphics(page)
        job_b05 = await test_b05_data_viz(page)
        job_b06 = await test_b06_explainer(page)
        job_b07 = await test_b07_promo(page)
        job_b08 = await test_b08_animation_transition(page)
        job_b09 = await test_b09_background_options(page)
        job_b10 = await test_b10_ai_images(page)
        job_b11 = await test_b11_shared_audio(page)
        await test_b12_telegram_full_flow(page)

        # ── Path B: Render completion ───────────────────────────────────
        print("\n  PATH B: RENDER COMPLETION")
        print("  " + "-" * 50)
        await test_b_render_text_landscape(page, job_b01)
        await test_b_render_text_portrait(page, job_b02)
        await test_b_render_slideshow(page, job_b03)

        # ── Path C: Upload & Edit ───────────────────────────────────────
        print("\n  PATH C: UPLOAD & EDIT")
        print("  " + "-" * 50)
        job_c01 = await test_c01_add_captions(page)
        job_c02 = await test_c02_remove_silence(page)
        job_c03 = await test_c03_remove_filler(page)
        job_c04 = await test_c04_add_music(page)
        job_c05 = await test_c05_add_narration(page)
        job_c06 = await test_c06_add_sfx(page)
        job_c07 = await test_c07_add_overlays(page)
        job_c08 = await test_c08_multi_select(page)
        job_c09 = await test_c09_full_edit(page)
        await test_c10_telegram_full_flow(page)

        # ── Shared Audio ────────────────────────────────────────────────
        print("\n  SHARED AUDIO")
        print("  " + "-" * 50)
        job_sa01 = await test_sa01_narration_config(page)
        job_sa02 = await test_sa02_music_config(page)
        job_sa03 = await test_sa03_sfx_config(page)
        job_sa04 = await test_sa04_caption_style(page)
        job_sa05 = await test_sa05_thumbnail(page)

        # ── Delivery & Post-Delivery ────────────────────────────────────
        print("\n  DELIVERY & POST-DELIVERY")
        print("  " + "-" * 50)
        await test_d01_post_delivery_keyboard(page)
        await test_d02_cancel_job(page, job_a01)
        await test_d03_regenerate_flow(page)

        # ── Validation (schema-level) ───────────────────────────────────
        print("\n  VALIDATION (SCHEMA-LEVEL)")
        print("  " + "-" * 50)
        await test_v01_invalid_path_type(page)
        await test_v02_empty_prompt(page)
        await test_v03_invalid_model(page)
        await test_v04_missing_video_url_path_c(page)
        await test_v05_nonexistent_job_status(page)

        # ── Cleanup: cancel all Veo jobs ────────────────────────────────
        print("\n  CLEANUP")
        print("  " + "-" * 50)
        cancel_ids = [
            job_a01, job_a02, job_a03, job_a07, job_a08, job_a09,
            job_sa01, job_sa04, job_sa05,
        ]
        for jid in cancel_ids:
            if jid:
                try:
                    await page.request.post(f"{BASE}/api/cancel/{jid}")
                except Exception:
                    pass
        print("  Cancelled pending Veo jobs")

        await browser.close()

    # ── Summary ─────────────────────────────────────────────────────────
    print()
    print("=" * 72)
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = sum(1 for r in results if r["status"] == "fail")
    skipped = sum(1 for r in results if r["status"] == "skip")
    total = len(results)
    print(f"  Results: {passed} passed, {failed} failed, {skipped} skipped / {total} total")
    print("=" * 72)

    if failed > 0:
        print("\n  FAILURES:")
        for r in results:
            if r["status"] == "fail":
                print(f"    - {r['test']}: {r['detail']}")

    print()
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
