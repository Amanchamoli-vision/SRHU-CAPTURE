import { chromium } from "playwright";
import path from "path";

const ARTIFACT_DIR = "C:/Users/yc993/.gemini/antigravity-ide/brain/0670180e-e5f3-470d-8557-52d623797131";
const POSTER_PATH = path.join(ARTIFACT_DIR, "scratch/test_poster.jpg");
const AGENDA_PATH = path.join(ARTIFACT_DIR, "scratch/test_agenda.pdf");

async function run() {
  console.log("Starting Playwright E2E verification...");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Log in as teacher
    console.log("Step 1: Logging in as teacher...");
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"], input[name="email"]', "teacher.test@srhu.edu.in");
    await page.fill('input[type="password"], input[name="password"]', "Teacher@123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/teacher/dashboard", { timeout: 10000 });
    console.log("Logged in successfully!");

    // 2. Go to Create Event
    console.log("Step 2: Navigating to Create Event wizard...");
    await page.goto("http://localhost:5173/teacher/create-event");
    await page.waitForSelector("#eventName");

    // Fill Step 1 details
    // Fill Step 1 details
    await page.fill("#eventName", "National Symposium on AI");
    // Pick future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = futureDate.toISOString().split("T")[0];
    await page.fill("#eventDate", dateStr);
    await page.fill("#endDate", dateStr);

    // Event type
    const eventTypeSelect = page.locator('select[name="eventType"]');
    await eventTypeSelect.selectOption({ index: 1 });

    // Times via TimePicker12h components
    await page.fill("#startTime-hour", "10");
    await page.fill("#startTime-minute", "00");
    await page.selectOption("#startTime-period", "AM");

    await page.fill("#endTime-hour", "04");
    await page.fill("#endTime-minute", "00");
    await page.selectOption("#endTime-period", "PM");

    await page.fill("#location", "Main Auditorium, Campus Block A");
    await page.fill("#department", "Computer Science & Engineering");
    await page.fill("#organizer", "Prof. Test Teacher");
    await page.fill("#description", "A national level symposium discussing recent advances in Artificial Intelligence and Machine Learning.");

    // 3. Test Save Draft without any uploads (should succeed)
    console.log("Step 3: Testing Save Draft without any uploads...");
    await page.click('button:has-text("Save Draft")');
    await page.waitForSelector('text=Your event is saved as a draft', { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "create_event_draft_saved.png") });
    console.log("Draft saved successfully without uploads! Captured create_event_draft_saved.png");
    await page.click('button:has-text("Keep editing")');
    await page.waitForTimeout(500);

    // 4. Navigate directly to Step 4 (Documents) with 0 uploads
    console.log("Step 4: Navigating to Step 4 without uploading anything...");
    // Click step 4 in rail or Next
    await page.click('button:has-text("Next")'); // to step 2
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")'); // to step 3
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")'); // to step 4
    await page.waitForTimeout(500);

    // 5. Attempt Submit for Approval without any photos or documents
    console.log("Step 5: Testing Submit for Approval without any uploads (should fail)...");
    await page.click('button[type="submit"]:has-text("Submit for Approval")');
    await page.waitForTimeout(1000);

    // Check that we were redirected to Step 2 with error banner
    await page.waitForSelector('text=Photo and Document uploads are both mandatory');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "create_event_submit_no_uploads_blocked.png") });
    console.log("Submission blocked when photos and documents missing! Captured create_event_submit_no_uploads_blocked.png");

    // 6. Upload 1 photo in Step 2
    console.log("Step 6: Uploading 1 photo in Step 2...");
    const photoInput = page.locator('input[type="file"]');
    await photoInput.setInputFiles(POSTER_PATH);
    await page.waitForSelector('text=Photo requirement met', { timeout: 15000 });
    console.log("Photo uploaded and requirement met indicator visible!");

    // 7. Advance to Step 4 without uploading documents (Step 3 Videos stays 0)
    console.log("Step 7: Advancing to Step 4 without uploading documents (video stays 0)...");
    await page.click('button:has-text("Next")'); // to Step 3 Videos
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")'); // to Step 4 Documents
    await page.waitForTimeout(500);

    // 8. Attempt Submit for Approval without documents
    console.log("Step 8: Testing Submit for Approval without document (should fail)...");
    await page.click('button[type="submit"]:has-text("Submit for Approval")');
    await page.waitForTimeout(1000);

    await page.waitForSelector('text=Document upload is mandatory');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "create_event_submit_no_doc_blocked.png") });
    console.log("Submission blocked when document missing! Captured create_event_submit_no_doc_blocked.png");

    // 9. Upload 1 document in Step 4
    console.log("Step 9: Uploading 1 document in Step 4...");
    const docInput = page.locator('input[type="file"]');
    await docInput.setInputFiles(AGENDA_PATH);
    await page.waitForSelector('text=Document requirement met', { timeout: 15000 });
    console.log("Document uploaded and requirement met indicator visible!");

    // 10. Submit for Approval with 1 photo, 1 document, and 0 videos (should succeed)
    console.log("Step 10: Submitting event with 1 photo, 1 doc, 0 videos...");
    await page.click('button[type="submit"]:has-text("Submit for Approval")');
    await page.waitForSelector('text=Are you sure you want to submit this event?', { timeout: 5000 });

    // Confirm modal
    await page.click('button:has-text("Confirm and submit")');
    await page.waitForSelector('text=Event submitted successfully!', { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "create_event_submit_success.png") });
    console.log("Event submitted successfully with 0 videos! Captured create_event_submit_success.png");

    // Click Go to My Events
    await page.click('button:has-text("Go to My Events")');
    await page.waitForURL("**/teacher/my-events**", { timeout: 10000 });
    console.log("Redirected to My Events!");

    // 11. Test Edit Event flow
    console.log("Step 11: Testing Edit Event flow...");
    const editLink = page.locator('a[title="Edit event"]').first();
    const editHref = await editLink.getAttribute("href");
    console.log("Navigating to edit URL:", editHref);
    await page.goto("http://localhost:5173" + editHref);
    await page.waitForSelector("#eventName");
    console.log("Opened event in Edit mode!");

    // Go to Step 2 (Photos)
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1000);
    // Remove the photo
    console.log("Removing the photo in Edit mode...");
    const deletePhotoBtn = page.locator('button[title="Remove"]').first();
    await deletePhotoBtn.click();
    await page.waitForTimeout(1500);

    // Go to Step 4 (Documents)
    await page.click('button:has-text("Next")'); // to Step 3
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")'); // to Step 4
    await page.waitForTimeout(500);

    // Attempt to Update & Resubmit without photo
    console.log("Attempting to Resubmit/Update event without photo...");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    await page.waitForSelector('text=Photo upload is mandatory');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "edit_event_submit_no_photo_blocked.png") });
    console.log("Edit update blocked when photo removed! Captured edit_event_submit_no_photo_blocked.png");

    // Re-upload photo in Step 2
    console.log("Re-uploading photo in Step 2...");
    await page.click('button:has-text("Photos"), button:has-text("Photo Upload")');
    await page.waitForTimeout(500);
    const rePhotoInput = page.locator('input[type="file"]');
    await rePhotoInput.setInputFiles(POSTER_PATH);
    await page.waitForSelector('text=Photo requirement met', { timeout: 15000 });

    // Go to Step 4 and remove document to test Edit without document
    console.log("Testing Edit without document...");
    await page.click('button:has-text("Next")'); // to Step 3
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")'); // to Step 4
    await page.waitForTimeout(500);

    // Remove document
    const removeDocBtn = page.locator('button:has-text("Remove")').first();
    await removeDocBtn.click();
    await page.waitForTimeout(1500);

    // Attempt Submit without document
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await page.waitForSelector('text=Document upload is mandatory');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "edit_event_submit_no_doc_blocked.png") });
    console.log("Edit update blocked when document removed! Captured edit_event_submit_no_doc_blocked.png");

    // Re-upload document in Step 4
    console.log("Re-uploading document in Step 4...");
    const reDocInput = page.locator('input[type="file"]');
    await reDocInput.setInputFiles(AGENDA_PATH);
    await page.waitForSelector('text=Document requirement met', { timeout: 15000 });

    // Submit update (1 photo, 1 document, 0 videos)
    console.log("Submitting update in Edit mode (1 photo, 1 doc, 0 videos)...");
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Are you sure you want to resubmit this event?', { timeout: 5000 });
    await page.click('button:has-text("Confirm and resubmit")');
    await page.waitForSelector('text=Event resubmitted successfully!', { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "edit_event_resubmit_success.png") });
    console.log("Edit update succeeded! Captured edit_event_resubmit_success.png");

    console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("Test error:", err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e_error_state.png") });
    throw err;
  } finally {
    await browser.close();
  }
}

run();
