import { test, expect } from "@playwright/test"
import path from "path"

test.describe("Argon High Live Operational User Journey", () => {
  test("authenticates, loads backend workspaces, uploads real MP4, analyzes speech, renders vertical cut, and denies cross-workspace access", async ({
    page,
    request,
  }) => {
    page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()))
    page.on("pageerror", (err) => console.log("BROWSER ERROR:", err))

    // 1. Load application at baseURL
    await page.goto("http://localhost:8443")

    // Check header
    await expect(page.locator("text=ARGON HIGH")).toBeVisible()
    await expect(page.locator("text=v2.5")).toBeVisible()

    // 2. Verify workspace switcher has loaded verified backend workspaces
    const workspaceSelect = page.locator('select[aria-label="Workspace Switcher"]')
    await expect(workspaceSelect).toBeVisible()

    // Wait for session and backend workspaces to populate
    await expect(
      page.locator('select[aria-label="Workspace Switcher"] option[value="ws-argon-core"]')
    ).toHaveText("Argon Syndicate Core Desk")

    await expect(
      page.locator('select[aria-label="Workspace Switcher"] option[value="ws-syndicate-beta"]')
    ).toHaveText("Beta Clipping Syndicate")

    // Ensure stale/fictional workspaces do NOT exist
    const northstarOption = page.locator(
      'select[aria-label="Workspace Switcher"] option[value="ws-northstar"]'
    )
    expect(await northstarOption.count()).toBe(0)

    // 3. Navigate to Clip Studio
    const clipStudioNavBtn = page.locator('nav button:has-text("Clip Studio")')
    await clipStudioNavBtn.click()

    // Check Live Engine Verified status indicator
    const liveEnginePill = page.locator('button:has-text("LIVE FFMPEG (VERIFIED)")')
    await expect(liveEnginePill).toBeVisible({ timeout: 10000 })

    // Verify campaign selector contains real backend campaigns
    const campaignSelect = page.locator('select[aria-label="Select Campaign"]')
    await expect(campaignSelect).toBeVisible()
    const campaignOptions = await campaignSelect.locator("option").allTextContents()
    expect(campaignOptions.some((opt) => opt.includes("Meridian FX"))).toBe(true)

    // 4. Open Add Source Modal and Upload real MP4
    const addSourceBtn = page.locator('button:has-text("Add Source")')
    await addSourceBtn.click()

    await expect(
      page.locator("text=Add Authorized Long-Form Source Asset")
    ).toBeVisible()

    // Set file input with the real test MP4 fixture
    const fixturePath = path.resolve(
      process.cwd(),
      "backend/tests/fixtures/test_speech_video.mp4"
    )
    const fileInput = page.locator("#source-file-upload-input")
    await fileInput.setInputFiles(fixturePath)

    // Set title and creator
    const titleInput = page.locator('input[placeholder*="Latent Space"]')
    await titleInput.fill("Live Browser Speech Verification Clip")

    const creatorInput = page.locator('input[placeholder*="Aris Thorne"]')
    await creatorInput.fill("Elena Rostova")

    // Submit upload
    const uploadSubmitBtn = page.locator('button:has-text("Upload & Inspect")')
    await uploadSubmitBtn.click()

    // Wait for modal to close upon successful FFprobe inspection
    await expect(
      page.locator("text=Add Authorized Long-Form Source Asset")
    ).not.toBeVisible({ timeout: 15000 })

    // Verify active source shows the newly uploaded video
    const sourceSelect = page.locator('select[aria-label="Select Source Asset"]')
    await expect(sourceSelect).toBeVisible()
    const activeSourceText = await sourceSelect.locator("option:checked").textContent()
    expect(activeSourceText).toContain("Live Browser Speech Verification Clip")

    // 5. Trigger AI Speech Transcription & Acoustic Ranking
    const analyzeBtn = page.locator('button:has-text("AI Transcribe & Rank")')
    await expect(analyzeBtn).toBeVisible()
    await analyzeBtn.click()

    // Button should enter processing state
    await expect(page.locator('button:has-text("Analyzing Hooks...")')).toBeVisible()

    // Wait for transcription & candidate generation to complete (up to 45s for faster-whisper)
    await expect(
      page.locator('button:has-text("AI Transcribe & Rank")')
    ).toBeVisible({ timeout: 60000 })

    // Verify candidate cuts are populated
    await expect(page.locator("text=Candidate Cuts (3):")).toBeVisible()
    const candidate2Btn = page.locator('button:has-text("#2")')
    await expect(candidate2Btn).toBeVisible()

    // Verify real transcript segments appear in the transcript panel
    const transcriptPanel = page.locator("text=Click segment to seek")
    await expect(transcriptPanel).toBeVisible()
    const transcriptSegments = page.locator('div[class*="cursor-pointer rounded-md border"]')
    expect(await transcriptSegments.count()).toBeGreaterThan(0)

    // 6. Select Candidate #2
    await candidate2Btn.click()

    // 7. Render 9:16 Vertical Cut with FFmpeg
    const renderBtn = page.locator('button:has-text("Render 9:16 (FFmpeg)")')
    await expect(renderBtn).toBeVisible()
    await renderBtn.click()

    // Wait for FFmpeg rendering to complete and preview to switch to verified MP4
    const verifiedMp4Badge = page.locator("text=1080x1920 MP4 VERIFIED (FFMPEG)")
    await expect(verifiedMp4Badge).toBeVisible({ timeout: 45000 })

    // Verify HTML5 video element is mounted and has valid stream src
    const renderedVideo = page.locator("video")
    await expect(renderedVideo).toBeVisible()
    const videoSrc = await renderedVideo.getAttribute("src")
    expect(videoSrc).toBeTruthy()
    expect(videoSrc).toContain("/api/v1/render/output/")

    // 8. Cross-Workspace Isolation & Authorization Verification
    // Direct API call attempting to access an unauthorized workspace with our operator token
    const crossWsResponse = await request.get(
      "http://localhost:8000/api/v1/auth/session",
      {
        headers: {
          Authorization: "Bearer argon_dev_token_syndicate_2026",
          "X-Workspace-Id": "ws-partner-meridian",
        },
      }
    )
    expect(crossWsResponse.status()).toBe(403)
    const errBody = await crossWsResponse.json()
    expect(errBody.detail).toContain("is not a member of requested workspace")

    // Unauthenticated request verification
    const unauthResponse = await request.get(
      "http://localhost:8000/api/v1/auth/session"
    )
    expect(unauthResponse.status()).toBe(401)
  })
})
