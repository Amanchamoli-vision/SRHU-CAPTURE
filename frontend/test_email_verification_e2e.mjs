import { chromium } from "playwright";
import path from "path";

const ARTIFACT_DIR = "C:/Users/yc993/.gemini/antigravity-ide/brain/0670180e-e5f3-470d-8557-52d623797131";

async function run() {
  console.log("Starting Playwright Email Verification E2E Tests...");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  
  try {
    // -------------------------------------------------------------
    // Scenario 1: Fresh Token -> Auto Verify -> Auto Login -> Teacher Dashboard
    // -------------------------------------------------------------
    console.log("\n--- Testing Scenario 1: Fresh Token Auto-Verify & Redirect ---");
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page1 = await context1.newPage();
    
    // Listen for console logs and network
    page1.on("console", msg => console.log(`[Browser 1] ${msg.type()}: ${msg.text()}`));
    page1.on("pageerror", err => console.log(`[Browser 1 Error] ${err.message}`));
    page1.on("requestfailed", req => console.log(`[Browser 1 Req Failed] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`));
    page1.on("response", res => {
      if (res.url().includes("/auth/")) {
        console.log(`[Browser 1 Res] ${res.status()} ${res.url()}`);
      }
    });

    console.log("Navigating to verify-email with fresh token...");
    await page1.goto("http://localhost:5173/verify-email?token=fresh_valid_token_1234567890abcdef");

    console.log("Waiting for auto-verification and redirect to dashboard...");
    await page1.waitForURL("**/teacher/dashboard", { timeout: 15000 });
    console.log("Successfully redirected to:", page1.url());

    await page1.waitForSelector('a:has-text("Create New Event")', { timeout: 10000 });
    console.log("Teacher dashboard UI loaded completely!");

    // Verify localStorage has valid session
    const sessionData = await page1.evaluate(() => {
      return localStorage.getItem("cc_auth_session");
    });
    console.log("Stored session exists:", !!sessionData);
    if (!sessionData) {
      throw new Error("No session stored in localStorage after auto-verification!");
    }
    const parsed = JSON.parse(sessionData);
    console.log("Logged in user:", parsed?.user?.email, "Role:", parsed?.user?.role);
    if (parsed?.user?.email !== "teacher.fresh.verify@srhu.edu.in" || parsed?.user?.role !== "teacher") {
      throw new Error(`Unexpected user in session: ${JSON.stringify(parsed?.user)}`);
    }

    await page1.screenshot({ path: path.join(ARTIFACT_DIR, "verify_flow_1_success.png") });
    console.log("Scenario 1 PASSED!");
    await context1.close();

    // -------------------------------------------------------------
    // Scenario 2: Already Verified Token
    // -------------------------------------------------------------
    console.log("\n--- Testing Scenario 2: Already Verified Token ---");
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();
    page2.on("console", msg => console.log(`[Browser 2] ${msg.type()}: ${msg.text()}`));

    console.log("Navigating to verify-email with already-verified token...");
    await page2.goto("http://localhost:5173/verify-email?token=already_verified_token_1234567890");

    // Check message
    await page2.waitForSelector("text=Your email is already verified", { timeout: 10000 });
    console.log("Found message: Your email is already verified");

    // Wait for redirect to login or dashboard
    await page2.waitForTimeout(2500);
    console.log("Current URL after wait:", page2.url());
    await page2.screenshot({ path: path.join(ARTIFACT_DIR, "verify_flow_2_already_verified.png") });
    console.log("Scenario 2 PASSED!");
    await context2.close();

    // -------------------------------------------------------------
    // Scenario 3: Expired Token
    // -------------------------------------------------------------
    console.log("\n--- Testing Scenario 3: Expired Token Link ---");
    const context3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page3 = await context3.newPage();
    page3.on("console", msg => console.log(`[Browser 3] ${msg.type()}: ${msg.text()}`));

    console.log("Navigating to verify-email with expired token...");
    await page3.goto("http://localhost:5173/verify-email?token=expired_token_1234567890abcdef");

    await page3.waitForSelector("text=This verification link has expired", { timeout: 10000 });
    console.log("Found message: This verification link has expired");

    // Verify resend form is visible
    const resendBtn = await page3.waitForSelector('button:has-text("Send a new verification email")', { timeout: 5000 });
    console.log("Send a new verification email button is present:", !!resendBtn);

    await page3.screenshot({ path: path.join(ARTIFACT_DIR, "verify_flow_3_expired.png") });
    console.log("Scenario 3 PASSED!");
    await context3.close();

    // -------------------------------------------------------------
    // Scenario 4: Invalid / Tampered Token
    // -------------------------------------------------------------
    console.log("\n--- Testing Scenario 4: Invalid Token Link ---");
    const context4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page4 = await context4.newPage();
    page4.on("console", msg => console.log(`[Browser 4] ${msg.type()}: ${msg.text()}`));

    console.log("Navigating to verify-email with invalid token...");
    await page4.goto("http://localhost:5173/verify-email?token=invalid_tampered_token_99999");

    await page4.waitForSelector("text=This verification link is invalid", { timeout: 10000 });
    console.log("Found message: This verification link is invalid");

    const invalidResendBtn = await page4.waitForSelector('button:has-text("Send a new verification email")', { timeout: 5000 });
    console.log("Resend button is present in invalid state:", !!invalidResendBtn);

    await page4.screenshot({ path: path.join(ARTIFACT_DIR, "verify_flow_4_invalid.png") });
    console.log("Scenario 4 PASSED!");
    await context4.close();

    console.log("\nALL 4 E2E VERIFICATION SCENARIOS COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("E2E Test failed:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
