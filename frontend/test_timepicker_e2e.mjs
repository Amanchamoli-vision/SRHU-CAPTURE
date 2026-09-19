import { chromium } from "playwright";
import path from "path";

const ARTIFACT_DIR = "C:/Users/yc993/.gemini/antigravity-ide/brain/0670180e-e5f3-470d-8557-52d623797131";

async function run() {
  console.log("Starting TimePicker E2E Verification...");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });

  try {
    // 1. Log in
    console.log("Logging in as teacher...");
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"], input[name="email"]', "teacher.test@srhu.edu.in");
    await page.fill('input[type="password"], input[name="password"]', "Teacher@123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/teacher/dashboard");

    // 2. Go to Create Event
    console.log("Navigating to Create Event...");
    await page.goto("http://localhost:5173/teacher/create-event");
    await page.waitForSelector("#eventName");

    // Capture initial fresh state screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "new_compact_timepicker_initial.png") });
    console.log("Captured initial state screenshot.");

    // 3. Test Manual Typing in Date Fields
    console.log("Testing manual typing in Start Date and End Date...");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const dateStr = futureDate.toISOString().split("T")[0]; // YYYY-MM-DD
    await page.fill("#eventDate", dateStr);
    await page.fill("#endDate", dateStr);
    console.log("Dates set to:", dateStr);

    // 4. Test Manual Typing in Time Fields
    console.log("Testing manual typing in Start Time (Hour & Minute)...");
    const startHour = page.locator("#startTime-hour");
    const startMinute = page.locator("#startTime-minute");
    const startPeriod = page.locator("#startTime-period");

    await startHour.click();
    await startHour.fill("09");
    await startMinute.click();
    await startMinute.fill("30");
    await startPeriod.selectOption("AM");
    console.log("Start time set to: 09:30 AM");

    console.log("Testing manual typing in End Time (Hour & Minute)...");
    const endHour = page.locator("#endTime-hour");
    const endMinute = page.locator("#endTime-minute");
    const endPeriod = page.locator("#endTime-period");

    await endHour.click();
    await endHour.fill("11");
    await endMinute.click();
    await endMinute.fill("45");
    await endPeriod.selectOption("AM");
    console.log("End time set to: 11:45 AM");

    // 5. Test Stepper Buttons on Start Time
    console.log("Testing micro stepper buttons on Minute...");
    const stepUpMin = page.locator('button[aria-label="Increase minute by 5"]').first();
    await stepUpMin.click();
    const minValAfterStep = await startMinute.inputValue();
    console.log("Minute after step up:", minValAfterStep); // should be 35

    // Capture filled state screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "new_compact_timepicker_filled.png") });
    console.log("Captured filled state screenshot.");

    // Fill other required fields so only time validation is isolated
    await page.fill("#eventName", "Test Symposium on Clean UI");
    const eventTypeSelect = page.locator('select[name="eventType"]');
    if (await eventTypeSelect.count() > 0) {
      await eventTypeSelect.selectOption({ index: 1 });
    }
    await page.fill("#location", "Auditorium Main");
    await page.fill("#department", "Computer Science");
    await page.fill("#organizer", "Dr. Test Faculty");
    await page.fill("#description", "Detailed description for the test event.");

    // 6. Test Validation: End Time before Start Time on same day
    console.log("Testing validation: setting End Time (08:00 AM) before Start Time (09:35 AM)...");
    await endHour.click();
    await endHour.fill("08");
    await endHour.blur();
    await endMinute.click();
    await endMinute.fill("00");
    await endMinute.blur();
    await endPeriod.selectOption("AM");

    // Click next to trigger validation
    await page.click('button:has-text("Next: Photos")');
    await page.waitForTimeout(500);

    const errorMsg = await page.locator(".field-error").allTextContents();
    console.log("Validation errors observed when End < Start:", errorMsg);
    const hasOrderError = errorMsg.some(m => m.includes("end time must be after the start time"));
    console.log("Has end-after-start validation error:", hasOrderError);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "new_compact_timepicker_validation_error.png") });

    if (!hasOrderError) {
      throw new Error("Expected validation error 'end time must be after the start time' but was not found!");
    }

    // 7. Fix End Time so validation passes
    console.log("Fixing End Time to 01:00 PM...");
    await endHour.click();
    await endHour.fill("01");
    await endHour.blur();
    await endMinute.click();
    await endMinute.fill("00");
    await endMinute.blur();
    await endPeriod.selectOption("PM");

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "new_compact_timepicker_fixed.png") });

    // 8. Test mobile responsiveness
    console.log("Testing mobile responsiveness on Step 1...");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "mobile_compact_timepicker.png") });
    console.log("Captured mobile viewport screenshot.");

    // 9. Advance to Step 2
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.click('button:has-text("Next: Photos")');
    await page.waitForSelector('text=Photo Upload', { timeout: 5000 });
    console.log("Successfully advanced to Step 2 (Photos)!");

    console.log("\nALL TIMEPICKER TESTS PASSED SUCCESSFULLY!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
