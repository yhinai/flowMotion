"""
FlowMotion — Comprehensive 3-Path Feature Test Suite
Tests every skeleton feature end-to-end via API + Telegram bot simulation.

Path A: AI Video (Veo) — model selection, aspect ratio, prompt, generate
Path B: Remotion-Only — Text Video + Image Slideshow, aspect ratio, duration
Path C: Upload & Edit — Add Captions + Remove Silence
Shared: Lyria background music
"""

import asyncio
import json
import sys
import time
import subprocess
import os
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
results: list[dict] = []


def log(test: str, status: str, detail: str = ""):
    icon = "PASS" if status == "pass" else "FAIL" if status == "fail" else "SKIP"
    results.append({"test": test, "status": status, "detail": detail})
    print(f"  [{icon}] {test}" + (f" — {detail}" if detail else ""))


# ═════════════════════════════════════════════════════════════════════════════
# PATH A: AI VIDEO (VEO)
# ═════════════════════════════════════════════════════════════════════════════

async def test_path_a_job_creation(page):
    """Path A: Create a Veo generation job via API with path config"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "A cinematic drone shot over misty mountains at golden hour sunrise",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video",
                "model": "veo-3.1",
                "aspectRatio": "16:9",
                "prompt": "A cinematic drone shot over misty mountains at golden hour sunrise"
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body, f"No jobId: {body}"
        log("Path A: Job creation (Veo 3.1, 16:9)", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path A: Job creation (Veo 3.1, 16:9)", "fail", str(e)[:200])
        return None


async def test_path_a_model_veo3(page):
    """Path A: Create job with Veo 3 model"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "A slow motion shot of ocean waves crashing on rocks at sunset",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-a",
            "pathConfig": {
                "path": "ai-video",
                "model": "veo-3",
                "aspectRatio": "9:16",
                "prompt": "A slow motion shot of ocean waves crashing on rocks at sunset"
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body
        log("Path A: Job creation (Veo 3, 9:16)", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path A: Job creation (Veo 3, 9:16)", "fail", str(e)[:200])
        return None


async def test_path_a_status_polling(page, job_id):
    """Path A: Poll job status and verify stage progression"""
    if not job_id:
        log("Path A: Status polling", "skip", "No jobId")
        return
    try:
        res = await page.request.get(f"{BASE}/api/status/{job_id}")
        assert res.status == 200
        body = await res.json()
        assert body["jobId"] == job_id
        assert body["stage"] in ("queued", "generating_script", "generating_clips",
                                  "uploading_assets", "composing_video", "completed", "failed")
        log("Path A: Status polling", "pass", f"stage={body['stage']}, progress={body['progress']}%")
    except Exception as e:
        log("Path A: Status polling", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# PATH B: REMOTION-ONLY (TEXT VIDEO + IMAGE SLIDESHOW)
# ═════════════════════════════════════════════════════════════════════════════

async def test_path_b_text_video(page):
    """Path B: Create a Text Video job"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Text Video",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-b",
            "pathConfig": {
                "path": "remotion-only",
                "type": "text-video",
                "aspectRatio": "16:9",
                "text": "Welcome to FlowMotion\nAI-powered video generation\nFrom idea to cinema in minutes\nTry it now"
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body
        log("Path B: Text Video (16:9)", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path B: Text Video (16:9)", "fail", str(e)[:200])
        return None


async def test_path_b_text_video_portrait(page):
    """Path B: Text Video in portrait (9:16)"""
    try:
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Text Video Portrait",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-b",
            "pathConfig": {
                "path": "remotion-only",
                "type": "text-video",
                "aspectRatio": "9:16",
                "text": "Vertical text video\nFor TikTok and Reels\nFlowMotion"
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202
        body = await res.json()
        log("Path B: Text Video (9:16 portrait)", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path B: Text Video (9:16 portrait)", "fail", str(e)[:200])
        return None


async def test_path_b_image_slideshow(page):
    """Path B: Create an Image Slideshow job"""
    try:
        # Use publicly accessible test images
        test_images = [
            "https://picsum.photos/id/10/1920/1080",
            "https://picsum.photos/id/20/1920/1080",
            "https://picsum.photos/id/30/1920/1080",
        ]
        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Image Slideshow",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-b",
            "pathConfig": {
                "path": "remotion-only",
                "type": "image-slideshow",
                "aspectRatio": "16:9",
                "images": test_images
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body
        log("Path B: Image Slideshow (3 images)", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path B: Image Slideshow (3 images)", "fail", str(e)[:200])
        return None


async def test_path_b_status_and_render(page, job_id, label):
    """Path B: Poll a Remotion job until completion or timeout (60s)"""
    if not job_id:
        log(f"Path B: {label} render", "skip", "No jobId")
        return
    try:
        start = time.time()
        last_stage = ""
        while time.time() - start < 90:
            res = await page.request.get(f"{BASE}/api/status/{job_id}")
            body = await res.json()
            stage = body.get("stage", "unknown")

            if stage != last_stage:
                last_stage = stage

            if stage == "completed":
                has_url = bool(body.get("downloadUrl"))
                log(f"Path B: {label} render", "pass",
                    f"completed in {int(time.time()-start)}s, downloadUrl={'yes' if has_url else 'no'}")
                return
            if stage == "failed":
                log(f"Path B: {label} render", "fail", f"Failed: {body.get('error','?')[:100]}")
                return

            await asyncio.sleep(3)

        log(f"Path B: {label} render", "fail", f"Timeout after 90s, last stage: {last_stage}")
    except Exception as e:
        log(f"Path B: {label} render", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# PATH C: UPLOAD & EDIT
# ═════════════════════════════════════════════════════════════════════════════

async def test_path_c_captions(page):
    """Path C: Create an Add Captions job (tests transcription + job pipeline)"""
    try:
        # Create a test video with synthetic speech-like audio
        test_video = "/tmp/test-caption-input.mp4"
        if not os.path.exists(test_video):
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "sine=frequency=440:duration=5",
                "-f", "lavfi", "-i",
                "color=c=blue:s=640x360:d=5",
                "-shortest", "-c:v", "libx264", "-c:a", "aac",
                test_video
            ], capture_output=True, timeout=30)

        assert os.path.exists(test_video), "Failed to create test video"

        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Upload Edit Captions",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-c",
            "pathConfig": {
                "path": "upload-edit",
                "action": "add-captions",
                "videoUrl": test_video,
                "videoLocalPath": test_video
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body
        log("Path C: Add Captions job creation", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path C: Add Captions job creation", "fail", str(e)[:200])
        return None


async def test_path_c_silence(page):
    """Path C: Create a Remove Silence job"""
    try:
        # Create a test video with silence gaps
        test_video = "/tmp/test-silence-input.mp4"
        if not os.path.exists(test_video):
            # 2s tone, 3s silence, 2s tone
            subprocess.run([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i",
                "sine=frequency=440:duration=2",
                "-f", "lavfi", "-i",
                "anullsrc=r=44100:cl=stereo",
                "-f", "lavfi", "-i",
                "sine=frequency=880:duration=2",
                "-f", "lavfi", "-i",
                "color=c=red:s=640x360:d=7",
                "-filter_complex",
                "[0:a]apad=pad_dur=0[a0];[1:a]atrim=0:3[a1];[2:a]apad=pad_dur=0[a2];[a0][a1][a2]concat=n=3:v=0:a=1[aout]",
                "-map", "3:v", "-map", "[aout]",
                "-shortest", "-c:v", "libx264", "-c:a", "aac",
                "-t", "7", test_video
            ], capture_output=True, timeout=30)

        assert os.path.exists(test_video), "Failed to create test video"

        res = await page.request.post(f"{BASE}/api/generate", data={
            "prompt": "Upload Edit",
            "resolution": "720p",
            "sceneCount": 1,
            "pathType": "path-c",
            "pathConfig": {
                "path": "upload-edit",
                "action": "remove-silence",
                "videoUrl": f"file://{test_video}",
                "videoLocalPath": test_video
            }
        }, headers={"Content-Type": "application/json"})

        assert res.status == 202, f"Expected 202, got {res.status}"
        body = await res.json()
        assert "jobId" in body
        log("Path C: Remove Silence job creation", "pass", f"jobId={body['jobId'][:8]}")
        return body["jobId"]
    except Exception as e:
        log("Path C: Remove Silence job creation", "fail", str(e)[:200])
        return None


async def test_path_c_status(page, job_id, label):
    """Path C: Poll an edit job until completion or timeout"""
    if not job_id:
        log(f"Path C: {label} processing", "skip", "No jobId")
        return
    try:
        start = time.time()
        last_stage = ""
        while time.time() - start < 120:
            res = await page.request.get(f"{BASE}/api/status/{job_id}")
            body = await res.json()
            stage = body.get("stage", "unknown")

            if stage != last_stage:
                last_stage = stage

            if stage == "completed":
                has_url = bool(body.get("downloadUrl"))
                log(f"Path C: {label} processing", "pass",
                    f"completed in {int(time.time()-start)}s, downloadUrl={'yes' if has_url else 'no'}")
                return
            if stage == "failed":
                error = body.get("error", body.get("message", "?"))
                log(f"Path C: {label} processing", "fail", f"Failed: {str(error)[:150]}")
                return

            await asyncio.sleep(3)

        log(f"Path C: {label} processing", "fail", f"Timeout after 120s, last stage: {last_stage}")
    except Exception as e:
        log(f"Path C: {label} processing", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# TELEGRAM BOT STATE MACHINE
# ═════════════════════════════════════════════════════════════════════════════

async def test_telegram_bot_path_a_flow(page):
    """Telegram: Simulate full Path A conversation flow via webhook"""
    chat_id = 99990001
    try:
        # Step 1: Send /start
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "message": {"chat": {"id": chat_id}, "text": "/start"}
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        # Step 2: Select AI Video path
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {
                "id": "cb1", "data": "path:ai-video",
                "message": {"chat": {"id": chat_id}}
            }
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        # Step 3: Select model
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {
                "id": "cb2", "data": "model:veo-3.1",
                "message": {"chat": {"id": chat_id}}
            }
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        # Step 4: Select aspect ratio
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {
                "id": "cb3", "data": "ar:16:9",
                "message": {"chat": {"id": chat_id}}
            }
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        # Step 5: Send prompt
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "message": {"chat": {"id": chat_id},
                        "text": "A drone flying over a futuristic city at night"}
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        log("Telegram: Path A flow (start→model→AR→prompt)", "pass")
    except Exception as e:
        log("Telegram: Path A flow (start→model→AR→prompt)", "fail", str(e)[:200])


async def test_telegram_bot_path_b_text_flow(page):
    """Telegram: Simulate Path B Text Video conversation"""
    chat_id = 99990002
    try:
        # /start → remotion-only → text-video → 16:9 → text
        for payload in [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:remotion-only", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb2", "data": "rtype:text-video", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb3", "data": "ar:16:9", "message": {"chat": {"id": chat_id}}}},
            {"message": {"chat": {"id": chat_id}, "text": "Hello World\nThis is FlowMotion\nAI Video Generator"}},
        ]:
            res = await page.request.post(f"{BASE}/api/telegram", data=payload,
                                          headers={"Content-Type": "application/json"})
            assert res.status == 200

        log("Telegram: Path B Text Video flow", "pass")
    except Exception as e:
        log("Telegram: Path B Text Video flow", "fail", str(e)[:200])


async def test_telegram_bot_path_b_slideshow_flow(page):
    """Telegram: Simulate Path B Image Slideshow conversation"""
    chat_id = 99990003
    try:
        # /start → remotion-only → image-slideshow → 16:9
        for payload in [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:remotion-only", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb2", "data": "rtype:image-slideshow", "message": {"chat": {"id": chat_id}}}},
            {"callback_query": {"id": "cb3", "data": "ar:9:16", "message": {"chat": {"id": chat_id}}}},
        ]:
            res = await page.request.post(f"{BASE}/api/telegram", data=payload,
                                          headers={"Content-Type": "application/json"})
            assert res.status == 200

        # Images done (with 0 images should prompt for at least one)
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {"id": "cb4", "data": "images:done", "message": {"chat": {"id": chat_id}}}
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200

        log("Telegram: Path B Slideshow flow", "pass")
    except Exception as e:
        log("Telegram: Path B Slideshow flow", "fail", str(e)[:200])


async def test_telegram_bot_path_c_flow(page):
    """Telegram: Simulate Path C Upload & Edit conversation"""
    chat_id = 99990004
    try:
        # /start → upload-edit
        for payload in [
            {"message": {"chat": {"id": chat_id}, "text": "/start"}},
            {"callback_query": {"id": "cb1", "data": "path:upload-edit", "message": {"chat": {"id": chat_id}}}},
        ]:
            res = await page.request.post(f"{BASE}/api/telegram", data=payload,
                                          headers={"Content-Type": "application/json"})
            assert res.status == 200

        log("Telegram: Path C Upload & Edit flow", "pass")
    except Exception as e:
        log("Telegram: Path C Upload & Edit flow", "fail", str(e)[:200])


async def test_telegram_invalid_callbacks(page):
    """Telegram: Invalid callback data is safely rejected"""
    chat_id = 99990005
    try:
        # Start fresh
        await page.request.post(f"{BASE}/api/telegram", data={
            "message": {"chat": {"id": chat_id}, "text": "/start"}
        }, headers={"Content-Type": "application/json"})

        # Select AI Video path
        await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {"id": "cb1", "data": "path:ai-video", "message": {"chat": {"id": chat_id}}}
        }, headers={"Content-Type": "application/json"})

        # Send invalid model — should be silently ignored
        res = await page.request.post(f"{BASE}/api/telegram", data={
            "callback_query": {"id": "cb2", "data": "model:veo-99-invalid",
                              "message": {"chat": {"id": chat_id}}}
        }, headers={"Content-Type": "application/json"})
        assert res.status == 200  # should not crash

        log("Telegram: Invalid callback handled safely", "pass")
    except Exception as e:
        log("Telegram: Invalid callback handled safely", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# SHARED: TOOLS & INFRASTRUCTURE
# ═════════════════════════════════════════════════════════════════════════════

async def test_ffmpeg_available(page):
    """Infra: ffmpeg and ffprobe are available"""
    try:
        r1 = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        r2 = subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=5)
        assert r1.returncode == 0, "ffmpeg not found"
        assert r2.returncode == 0, "ffprobe not found"
        log("Infra: ffmpeg + ffprobe available", "pass")
    except Exception as e:
        log("Infra: ffmpeg + ffprobe available", "fail", str(e)[:200])


async def test_silence_detection(page):
    """Infra: ffmpeg silencedetect works on test file"""
    try:
        test_video = "/tmp/test-silence-input.mp4"
        if not os.path.exists(test_video):
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                "-f", "lavfi", "-i", "sine=frequency=880:duration=2",
                "-f", "lavfi", "-i", "color=c=red:s=640x360:d=7",
                "-filter_complex",
                "[0:a]apad=pad_dur=0[a0];[1:a]atrim=0:3[a1];[2:a]apad=pad_dur=0[a2];[a0][a1][a2]concat=n=3:v=0:a=1[aout]",
                "-map", "3:v", "-map", "[aout]", "-shortest",
                "-c:v", "libx264", "-c:a", "aac", "-t", "7", test_video
            ], capture_output=True, timeout=30)

        r = subprocess.run([
            "ffmpeg", "-hide_banner", "-dn", "-vn", "-i", test_video,
            "-af", "silencedetect=n=-40dB:d=0.75", "-f", "null", "/dev/null"
        ], capture_output=True, text=True, timeout=30)

        stderr = r.stderr
        has_silence = "silence_start" in stderr
        log("Infra: Silence detection", "pass" if has_silence else "fail",
            f"{'Silence detected' if has_silence else 'No silence found in test file'}")
    except Exception as e:
        log("Infra: Silence detection", "fail", str(e)[:200])


async def test_api_cancel(page, job_id):
    """API: Cancel a running job"""
    if not job_id:
        log("API: Cancel job", "skip", "No jobId")
        return
    try:
        res = await page.request.post(f"{BASE}/api/cancel/{job_id}")
        # 200 = cancelled, 404 = already finished/not found — both acceptable
        assert res.status in (200, 404), f"Unexpected status: {res.status}"
        log("API: Cancel job", "pass", f"status={res.status}")
    except Exception as e:
        log("API: Cancel job", "fail", str(e)[:200])


# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════

async def main():
    print()
    print("=" * 70)
    print("  FlowMotion — Comprehensive 3-Path Feature Test Suite")
    print("=" * 70)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()

        # ── Infrastructure ──
        print("\n  INFRASTRUCTURE")
        print("  " + "-" * 40)
        await test_ffmpeg_available(page)
        await test_silence_detection(page)

        # ── Path A: AI Video (Veo) ──
        print("\n  PATH A: AI VIDEO (VEO)")
        print("  " + "-" * 40)
        job_a1 = await test_path_a_job_creation(page)
        job_a2 = await test_path_a_model_veo3(page)
        await test_path_a_status_polling(page, job_a1)

        # ── Path B: Remotion-Only ──
        print("\n  PATH B: REMOTION-ONLY")
        print("  " + "-" * 40)
        job_b_text = await test_path_b_text_video(page)
        job_b_text_p = await test_path_b_text_video_portrait(page)
        job_b_slide = await test_path_b_image_slideshow(page)

        # Wait for text video renders (these are fast — Remotion only, no API calls)
        await test_path_b_status_and_render(page, job_b_text, "Text Video 16:9")
        await test_path_b_status_and_render(page, job_b_text_p, "Text Video 9:16")
        await test_path_b_status_and_render(page, job_b_slide, "Image Slideshow")

        # ── Path C: Upload & Edit ──
        print("\n  PATH C: UPLOAD & EDIT")
        print("  " + "-" * 40)
        job_c_cap = await test_path_c_captions(page)
        job_c_sil = await test_path_c_silence(page)
        await test_path_c_status(page, job_c_cap, "Add Captions")
        await test_path_c_status(page, job_c_sil, "Remove Silence")

        # ── Telegram Bot State Machine ──
        print("\n  TELEGRAM BOT STATE MACHINE")
        print("  " + "-" * 40)
        await test_telegram_bot_path_a_flow(page)
        await test_telegram_bot_path_b_text_flow(page)
        await test_telegram_bot_path_b_slideshow_flow(page)
        await test_telegram_bot_path_c_flow(page)
        await test_telegram_invalid_callbacks(page)

        # ── Cleanup: cancel Veo jobs (they take minutes) ──
        print("\n  CLEANUP")
        print("  " + "-" * 40)
        await test_api_cancel(page, job_a1)
        await test_api_cancel(page, job_a2)

        await browser.close()

    # ── Summary ──
    print("\n" + "=" * 70)
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = sum(1 for r in results if r["status"] == "fail")
    skipped = sum(1 for r in results if r["status"] == "skip")
    total = len(results)
    print(f"  Results: {passed} passed, {failed} failed, {skipped} skipped / {total} total")
    print("=" * 70)

    if failed > 0:
        print("\n  FAILURES:")
        for r in results:
            if r["status"] == "fail":
                print(f"    - {r['test']}: {r['detail']}")

    print()
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
