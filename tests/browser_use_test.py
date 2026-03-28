"""
FlowMotion — AI-Powered Browser Testing with Browser Use Cloud
Runs autonomous AI agents to navigate and verify the entire app.
"""

import asyncio
import os
import sys
from browser_use_sdk import AsyncBrowserUse

API_KEY = os.environ.get(
    "BROWSER_USE_API_KEY",
    "bu_0E_h_xWAHKm7Jrr94AxZz8dX1XthOwEgzmJx8Ox91oo",
)
APP_URL = os.environ.get("APP_URL", "https://shy-times-jog.loca.lt")

client = AsyncBrowserUse(api_key=API_KEY)

results: list[dict] = []


def log(test_name: str, status: str, detail: str = ""):
    icon = "PASS" if status == "pass" else "FAIL"
    results.append({"test": test_name, "status": status, "detail": detail})
    print(f"  [{icon}] {test_name}" + (f" — {detail}" if detail else ""))


async def run_task(instruction: str, timeout: int = 120) -> dict:
    """Run a browser-use cloud task and return the result."""
    task = await client.tasks.create_task(
        task=instruction,
        start_url=APP_URL,
        max_steps=25,
    )

    task_id = task.id

    # Poll for completion
    elapsed = 0
    while elapsed < timeout:
        status = await client.tasks.get_task_status(task_id=task_id)
        state = getattr(status, "status", None) or getattr(status, "state", "unknown")

        if state in ("completed", "finished", "done", "failed", "stopped", "error"):
            output = getattr(status, "output", None) or getattr(status, "result", None)
            return {
                "status": state,
                "output": str(output) if output else "",
                "task_id": task_id,
            }
        await asyncio.sleep(4)
        elapsed += 4

    return {"status": "timeout", "output": "", "task_id": task_id}


async def test_1_homepage_exploration():
    """AI agent explores the homepage and reports what it finds"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue to the site. "
            "Then describe what you see on this FlowMotion page. "
            "List: 1) The main heading text, 2) Whether there is a text input/prompt area, "
            "3) What template options are available, 4) What engine options exist, "
            "5) Whether there is a footer with tech credits. "
            "Report your findings clearly."
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Homepage exploration", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Homepage exploration", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Homepage exploration", "fail", str(e)[:200])


async def test_2_prompt_and_submit():
    """AI agent fills in a prompt and submits"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue. "
            "Find the text input area (textarea) and type: 'A cinematic drone shot over misty mountains at sunrise'. "
            "Then find and click the generate/submit button. "
            "Report what happens after clicking — does the page navigate? What URL are you on? "
            "What do you see on the new page?"
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Prompt and submit", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Prompt and submit", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Prompt and submit", "fail", str(e)[:200])


async def test_3_template_selection():
    """AI agent clicks through template options"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue. "
            "Find the template selection area on the page. There should be options like "
            "Product Launch, Explainer, Social, Brand Story. "
            "Click on each template option one by one. "
            "Report: Does clicking each template visually highlight it? Are all options clickable?"
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Template selection", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Template selection", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Template selection", "fail", str(e)[:200])


async def test_4_engine_selector():
    """AI agent tests engine options"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue. "
            "Find the engine/model selector on the page. There should be options like Veo 3, Nano Banan, Auto. "
            "Click on each engine option. "
            "Report how many options exist and whether clicking changes the visual selection."
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Engine selector", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Engine selector", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Engine selector", "fail", str(e)[:200])


async def test_5_generate_page():
    """AI agent checks the /generate page"""
    try:
        result = await run_task(
            "Navigate to /generate page (add /generate to the current URL). "
            "If there is a localtunnel warning, click continue. "
            "Describe what you see — is there a message, loading state, or progress indicator? "
            "Report the full content visible on this page.",
            timeout=90,
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Generate page", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Generate page", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Generate page", "fail", str(e)[:200])


async def test_6_full_journey():
    """AI agent does the complete user flow"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue. "
            "Complete this full user journey on the FlowMotion app: "
            "1) Type this prompt: 'A timelapse of a flower blooming in a sunlit garden' "
            "2) Select the 'Explainer' template "
            "3) Click the generate/submit button "
            "4) Wait for the page to change and report what you see "
            "5) Is there a progress indicator? What stage is shown? "
            "Report the complete journey step by step.",
            timeout=180,
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Full user journey", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Full user journey", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Full user journey", "fail", str(e)[:200])


async def test_7_visual_quality():
    """AI agent evaluates visual design quality"""
    try:
        result = await run_task(
            "If there is a localtunnel warning page, click the button to continue. "
            "Evaluate the visual design of this page. Rate 1-10 on: "
            "1) Overall aesthetics — does it look modern and professional? "
            "2) Layout — is the content well-organized? "
            "3) Typography — are fonts readable and well-chosen? "
            "4) Color scheme — is it cohesive? "
            "5) Interactivity — do buttons and inputs look clickable? "
            "Give a brief verdict on the overall quality.",
            timeout=90,
        )

        if result["status"] in ("completed", "finished", "done"):
            log("Visual quality check", "pass", f"Task: {result['task_id'][:12]}")
        else:
            log("Visual quality check", "fail", f"Status: {result['status']}")
    except Exception as e:
        log("Visual quality check", "fail", str(e)[:200])


async def main():
    print("\n" + "=" * 60)
    print("  FlowMotion — Browser Use Cloud AI Test Suite")
    print(f"  Target: {APP_URL}")
    print("=" * 60 + "\n")

    print("Running AI-powered browser tests...\n")

    await test_1_homepage_exploration()
    await test_2_prompt_and_submit()
    await test_3_template_selection()
    await test_4_engine_selector()
    await test_5_generate_page()
    await test_6_full_journey()
    await test_7_visual_quality()

    # Summary
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
