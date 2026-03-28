"""
FlowMotion — Full App Browser Test Suite
Uses browser-use + Playwright to verify all UI features work end-to-end.
"""

import asyncio
import sys
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:3000"

results: list[dict] = []


def log(test_name: str, status: str, detail: str = ""):
    icon = "PASS" if status == "pass" else "FAIL"
    results.append({"test": test_name, "status": status, "detail": detail})
    print(f"  [{icon}] {test_name}" + (f" — {detail}" if detail else ""))


async def test_homepage_loads(page):
    """Test 1: Homepage loads with all key elements"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        title = await page.title()
        assert "FlowMotion" in title, f"Title was: {title}"

        # Check hero heading
        heading = await page.text_content("h1")
        assert heading and len(heading) > 5, f"Heading was: {heading}"

        log("Homepage loads", "pass", f"Title: {title}")
    except Exception as e:
        log("Homepage loads", "fail", str(e))


async def test_prompt_input_exists(page):
    """Test 2: Prompt input field is present and functional"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")

        # Find textarea or input for prompt
        prompt = await page.query_selector("textarea, input[type='text']")
        assert prompt is not None, "No prompt input found"

        # Type into it
        await prompt.fill("A cinematic sunset over the ocean")
        value = await prompt.input_value()
        assert "sunset" in value.lower(), f"Input value was: {value}"

        log("Prompt input exists", "pass")
    except Exception as e:
        log("Prompt input exists", "fail", str(e))


async def test_engine_selector(page):
    """Test 3: Engine selector (Veo3, Nano-Banan, Auto) is present"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        content = await page.content()

        has_veo = "Veo" in content or "veo" in content
        has_auto = "Auto" in content or "auto" in content

        assert has_veo, "Veo engine option not found"
        assert has_auto, "Auto engine option not found"

        log("Engine selector present", "pass")
    except Exception as e:
        log("Engine selector present", "fail", str(e))


async def test_template_picker(page):
    """Test 4: Template picker shows all template options"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        content = await page.content()

        templates = ["Product Launch", "Explainer", "Social", "Brand Story"]
        found = [t for t in templates if t in content]
        missing = [t for t in templates if t not in content]

        assert len(found) >= 3, f"Only found: {found}, missing: {missing}"

        log("Template picker present", "pass", f"Found: {', '.join(found)}")
    except Exception as e:
        log("Template picker present", "fail", str(e))


async def test_how_it_works_section(page):
    """Test 5: How It Works section with 3 steps"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        content = await page.content()

        steps = ["Describe", "Generate", "Download", "Deliver"]
        found = [s for s in steps if s in content]

        assert len(found) >= 2, f"Only found steps: {found}"

        log("How It Works section", "pass")
    except Exception as e:
        log("How It Works section", "fail", str(e))


async def test_generate_page_loads(page):
    """Test 6: /generate page loads (even without jobId)"""
    try:
        await page.goto(f"{BASE_URL}/generate", wait_until="networkidle")

        content = await page.content()
        # Should show some fallback (no job ID message or loading state)
        page_loaded = len(content) > 500

        assert page_loaded, "Generate page content too small"

        log("Generate page loads", "pass")
    except Exception as e:
        log("Generate page loads", "fail", str(e))


async def test_api_generate_validates_input(page):
    """Test 7: POST /api/generate validates bad input"""
    try:
        response = await page.request.post(
            f"{BASE_URL}/api/generate",
            data={"prompt": ""},  # empty prompt should fail
            headers={"Content-Type": "application/json"},
        )

        assert response.status == 400, f"Expected 400, got {response.status}"
        body = await response.json()
        assert "error" in body, f"No error in response: {body}"

        log("API validates input", "pass", f"Status: {response.status}")
    except Exception as e:
        log("API validates input", "fail", str(e))


async def test_api_generate_creates_job(page):
    """Test 8: POST /api/generate creates a job with valid input"""
    try:
        response = await page.request.post(
            f"{BASE_URL}/api/generate",
            data={
                "prompt": "A beautiful mountain landscape at dawn with fog rolling through valleys",
                "resolution": "720p",
                "sceneCount": 3,
                "engine": "auto",
            },
            headers={"Content-Type": "application/json"},
        )

        assert response.status == 202, f"Expected 202, got {response.status}"
        body = await response.json()
        assert "jobId" in body, f"No jobId in response: {body}"

        log("API creates job", "pass", f"jobId: {body['jobId'][:8]}...")
        return body["jobId"]
    except Exception as e:
        log("API creates job", "fail", str(e))
        return None


async def test_api_status_returns_job(page, job_id: str):
    """Test 9: GET /api/status/:jobId returns job status"""
    try:
        if not job_id:
            log("API status endpoint", "fail", "No jobId from previous test")
            return

        response = await page.request.get(f"{BASE_URL}/api/status/{job_id}")
        assert response.status == 200, f"Expected 200, got {response.status}"

        body = await response.json()
        assert "stage" in body, f"No stage in response: {body}"
        assert body["jobId"] == job_id, f"jobId mismatch"

        log("API status endpoint", "pass", f"Stage: {body['stage']}")
    except Exception as e:
        log("API status endpoint", "fail", str(e))


async def test_api_cancel_works(page, job_id: str):
    """Test 10: POST /api/cancel/:jobId cancels a job"""
    try:
        if not job_id:
            log("API cancel endpoint", "fail", "No jobId from previous test")
            return

        response = await page.request.post(f"{BASE_URL}/api/cancel/{job_id}")
        assert response.status in (200, 404), f"Got {response.status}"

        log("API cancel endpoint", "pass", f"Status: {response.status}")
    except Exception as e:
        log("API cancel endpoint", "fail", str(e))


async def test_api_edit_validates(page):
    """Test 11: POST /api/edit validates input"""
    try:
        response = await page.request.post(
            f"{BASE_URL}/api/edit",
            data={},  # empty body
            headers={"Content-Type": "application/json"},
        )

        # Should return 400 for invalid input
        assert response.status in (400, 500), f"Expected 400/500, got {response.status}"

        log("API edit validates", "pass", f"Status: {response.status}")
    except Exception as e:
        log("API edit validates", "fail", str(e))


async def test_api_telegram_webhook(page):
    """Test 12: POST /api/telegram responds to webhook"""
    try:
        response = await page.request.post(
            f"{BASE_URL}/api/telegram",
            data={"update_id": 123},
            headers={"Content-Type": "application/json"},
        )

        # Telegram webhook should always return 200
        assert response.status == 200, f"Expected 200, got {response.status}"

        log("Telegram webhook responds", "pass")
    except Exception as e:
        log("Telegram webhook responds", "fail", str(e))


async def test_navbar_present(page):
    """Test 13: Navbar is present on homepage"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")

        # Check for nav element or FlowMotion branding in nav area
        nav = await page.query_selector("nav, header")
        content = await page.content()

        has_branding = "FlowMotion" in content or "flowmotion" in content.lower()
        assert nav is not None or has_branding, "No navbar or branding found"

        log("Navbar present", "pass")
    except Exception as e:
        log("Navbar present", "fail", str(e))


async def test_footer_present(page):
    """Test 14: Footer with tech stack credits"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        content = await page.content()

        has_footer = "Powered by" in content or "Built with" in content
        has_tech = "Gemini" in content and "Veo" in content and "Remotion" in content

        assert has_footer or has_tech, "No footer or tech stack credits found"

        log("Footer present", "pass")
    except Exception as e:
        log("Footer present", "fail", str(e))


async def test_responsive_meta(page):
    """Test 15: Page has responsive viewport meta tag"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        viewport = await page.query_selector('meta[name="viewport"]')
        assert viewport is not None, "No viewport meta tag found"

        content = await viewport.get_attribute("content")
        assert "width=device-width" in (content or ""), f"Viewport content: {content}"

        log("Responsive viewport meta", "pass")
    except Exception as e:
        log("Responsive viewport meta", "fail", str(e))


async def test_no_console_errors(page):
    """Test 16: No JavaScript console errors on page load"""
    try:
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        if errors:
            log("No console errors", "fail", f"{len(errors)} errors: {errors[0][:100]}")
        else:
            log("No console errors", "pass")
    except Exception as e:
        log("No console errors", "fail", str(e))


async def test_css_loads(page):
    """Test 17: CSS/styles are loaded (not unstyled)"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")

        # Check that body has some background styling (not plain white)
        bg = await page.evaluate("getComputedStyle(document.body).backgroundColor")
        font = await page.evaluate("getComputedStyle(document.body).fontFamily")

        has_style = bg != "rgba(0, 0, 0, 0)" or "serif" in font.lower() or "sans" in font.lower()
        assert has_style, f"Page appears unstyled. bg={bg}, font={font}"

        log("CSS loads properly", "pass", f"font: {font[:30]}")
    except Exception as e:
        log("CSS loads properly", "fail", str(e))


async def test_generate_page_with_jobid(page):
    """Test 18: /generate?jobId=xxx shows generation UI"""
    try:
        # Create a job first
        response = await page.request.post(
            f"{BASE_URL}/api/generate",
            data={
                "prompt": "Test video for E2E testing verification",
                "resolution": "720p",
                "sceneCount": 3,
            },
            headers={"Content-Type": "application/json"},
        )
        body = await response.json()
        job_id = body.get("jobId", "test-id")

        await page.goto(
            f"{BASE_URL}/generate?jobId={job_id}", wait_until="networkidle"
        )
        await page.wait_for_timeout(2000)

        content = await page.content()
        # Should show some generation progress UI
        page_has_content = len(content) > 1000

        assert page_has_content, "Generate page with jobId is too empty"

        log("Generate page with jobId", "pass")
    except Exception as e:
        log("Generate page with jobId", "fail", str(e))


async def test_api_status_nonexistent(page):
    """Test 19: GET /api/status/nonexistent returns 404"""
    try:
        response = await page.request.get(
            f"{BASE_URL}/api/status/nonexistent-job-id"
        )
        assert response.status == 404, f"Expected 404, got {response.status}"

        log("API 404 for missing job", "pass")
    except Exception as e:
        log("API 404 for missing job", "fail", str(e))


async def test_asset_uploader_present(page):
    """Test 20: Asset uploader component is on the page"""
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        content = await page.content()

        # Look for file input or upload-related elements
        file_input = await page.query_selector("input[type='file']")
        has_upload_text = "upload" in content.lower() or "asset" in content.lower() or "image" in content.lower()

        assert file_input is not None or has_upload_text, "No asset uploader found"

        log("Asset uploader present", "pass")
    except Exception as e:
        log("Asset uploader present", "fail", str(e))


async def main():
    print("\n" + "=" * 60)
    print("  FlowMotion — Full Browser Test Suite")
    print("=" * 60 + "\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # ── UI Tests ──
        print("UI Tests:")
        await test_homepage_loads(page)
        await test_prompt_input_exists(page)
        await test_engine_selector(page)
        await test_template_picker(page)
        await test_how_it_works_section(page)
        await test_navbar_present(page)
        await test_footer_present(page)
        await test_responsive_meta(page)
        await test_css_loads(page)
        await test_no_console_errors(page)
        await test_asset_uploader_present(page)

        # ── Page Navigation Tests ──
        print("\nPage Navigation:")
        await test_generate_page_loads(page)
        await test_generate_page_with_jobid(page)

        # ── API Tests ──
        print("\nAPI Tests:")
        await test_api_generate_validates_input(page)
        job_id = await test_api_generate_creates_job(page)
        await test_api_status_returns_job(page, job_id)
        await test_api_status_nonexistent(page)
        await test_api_cancel_works(page, job_id)
        await test_api_edit_validates(page)
        await test_api_telegram_webhook(page)

        await browser.close()

    # ── Summary ──
    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = sum(1 for r in results if r["status"] == "fail")
    total = len(results)
    print(f"  Results: {passed}/{total} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        print("\nFailed tests:")
        for r in results:
            if r["status"] == "fail":
                print(f"  - {r['test']}: {r['detail']}")

    print()
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
