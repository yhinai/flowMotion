"""
FlowMotion — Local Real-Time Browser Test with browser-use
Runs a VISIBLE browser on your machine so you can watch the AI agent test the app.
"""

import asyncio
import os
import sys

from browser_use.agent.service import Agent
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession
from browser_use.llm.google.chat import ChatGoogle

GEMINI_KEY = os.environ["GEMINI_API_KEY"]
APP_URL = "http://localhost:3000"


async def run_test(name: str, task: str):
    """Run a single browser-use test with a visible browser."""
    print(f"\n{'='*60}")
    print(f"  TEST: {name}")
    print(f"{'='*60}\n")

    llm = ChatGoogle(
        model="gemini-2.5-flash",
        api_key=GEMINI_KEY,
    )

    browser_profile = BrowserProfile(
        headless=False,
        disable_security=True,
    )
    browser_session = BrowserSession(browser_profile=browser_profile)

    agent = Agent(
        task=task,
        llm=llm,
        browser_session=browser_session,
        max_actions_per_step=4,
    )

    try:
        result = await agent.run(max_steps=20)
        final = result.final_result()
        print(f"\n  Result: {final[:500] if final else '(no output)'}")
        print(f"  Status: DONE")
    except Exception as e:
        print(f"\n  Error: {e}")
    finally:
        await browser_session.stop()


async def main():
    print("\n" + "=" * 60)
    print("  FlowMotion — Live Browser Testing")
    print(f"  Target: {APP_URL}")
    print("  A browser window will open — watch the AI agent test your app!")
    print("=" * 60)

    test = sys.argv[1] if len(sys.argv) > 1 else "all"

    if test in ("all", "explore"):
        await run_test(
            "Homepage Exploration",
            f"Go to {APP_URL}. Explore the FlowMotion app homepage thoroughly. "
            "1) Read the main heading and describe it. "
            "2) Find the text input area and describe it. "
            "3) List all the template options you see. "
            "4) List all the engine/model options. "
            "5) Find the 'How It Works' section and list the steps. "
            "6) Check the footer for tech credits. "
            "Report everything you found."
        )

    if test in ("all", "generate"):
        await run_test(
            "Full Generate Flow",
            f"Go to {APP_URL}. Complete this user journey: "
            "1) Click on the text input area (textarea). "
            "2) Type this prompt: 'A breathtaking cinematic drone shot soaring over misty green mountains at golden hour sunrise with rays of light piercing through clouds and a river winding below through the valley'. "
            "3) Find and click the 'Product Launch' template option. "
            "4) Find and click the 'Veo 3' engine option. "
            "5) Click the 'Generate Video' button. "
            "6) If the page navigates to /generate, describe what you see — progress bar, job ID, loading state. "
            "7) Wait 10 seconds and report the current status. "
            "Report each step as you complete it."
        )

    if test in ("all", "templates"):
        await run_test(
            "Template & Engine Switching",
            f"Go to {APP_URL}. Test all interactive elements: "
            "1) Click each template option one by one: Product Launch, Explainer, Social, Brand Story. "
            "   After each click, check if it visually highlights/selects. "
            "2) Click each engine option: Veo 3, Nano Banan, Auto. "
            "   After each click, check if it visually highlights/selects. "
            "3) Type something in the prompt area. "
            "4) Check if the Generate button becomes enabled. "
            "Report which elements are interactive and which aren't."
        )

    if test == "caption":
        await run_test(
            "Generate Page Check",
            f"Go to {APP_URL}/generate. "
            "Describe what you see on this page. "
            "Is there a message about no job ID? A loading state? "
            f"Then go back to {APP_URL} and report the navigation."
        )

    print("\n" + "=" * 60)
    print("  All tests complete!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
