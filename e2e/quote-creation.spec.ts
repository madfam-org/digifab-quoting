import { test, expect, Page } from '@playwright/test';
import path from 'path';

// Test data
const testUser = {
  email: 'test@cotiza.studio',
  password: 'TestPassword123!',
};

const testFiles = {
  stl: path.join(__dirname, 'fixtures', 'test-part.stl'),
  step: path.join(__dirname, 'fixtures', 'test-assembly.step'),
  dxf: path.join(__dirname, 'fixtures', 'test-drawing.dxf'),
};

// Helper functions
async function login(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[name="email"]', testUser.email);
  await page.fill('[name="password"]', testUser.password);
  await page.click('[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
}

async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for upload to complete
  await expect(page.locator('[data-testid="upload-progress"]')).toHaveAttribute(
    'data-complete',
    'true',
    { timeout: 30000 },
  );
}

test.describe('Quote Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('File Upload', () => {
    test('should navigate to new quote page', async ({ page }) => {
      await page.click('[data-testid="new-quote-button"]');
      await expect(page).toHaveURL('/quote/new');
      await expect(page.locator('h1')).toContainText('Create New Quote');
    });

    test('should upload STL file successfully', async ({ page }) => {
      await page.goto('/quote/new');

      // Upload file
      await uploadFile(page, testFiles.stl);

      // Should show file preview
      await expect(page.locator('[data-testid="file-preview"]')).toBeVisible();
      await expect(page.locator('[data-testid="file-name"]')).toContainText('test-part.stl');

      // Should show 3D viewer
      await expect(page.locator('[data-testid="3d-viewer"]')).toBeVisible();
    });

    test('should upload multiple files', async ({ page }) => {
      await page.goto('/quote/new');

      // Enable multi-file mode
      await page.click('[data-testid="add-more-files"]');

      // Upload multiple files
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([testFiles.stl, testFiles.step]);

      // Should show both files
      await expect(page.locator('[data-testid="file-list"] li')).toHaveCount(2);
    });

    test('should validate file types', async ({ page }) => {
      await page.goto('/quote/new');

      // Try to upload invalid file
      const invalidFile = path.join(__dirname, 'fixtures', 'invalid.txt');
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(invalidFile);

      // Should show error
      await expect(page.locator('.error-message')).toContainText('Invalid file type');
    });

    test('should show upload progress', async ({ page }) => {
      await page.goto('/quote/new');

      // Start upload
      const fileInput = page.locator('input[type="file"]');
      const uploadPromise = fileInput.setInputFiles(testFiles.stl);

      // Should show progress bar
      await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();

      // Wait for completion
      await uploadPromise;

      // Progress should reach 100%
      await expect(page.locator('[data-testid="upload-progress"]')).toHaveAttribute(
        'data-value',
        '100',
      );
    });

    test('should handle upload errors', async ({ page }) => {
      await page.goto('/quote/new');

      // Mock network error
      await page.route('**/files/presign', (route) => route.abort());

      // Try to upload
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFiles.stl);

      // Should show error message
      await expect(page.locator('.error-message')).toContainText('Upload failed');

      // Should show retry button
      await expect(page.locator('[data-testid="retry-upload"]')).toBeVisible();
    });

    test('should extract file metadata', async ({ page }) => {
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);

      // Should display file details
      await expect(page.locator('[data-testid="file-size"]')).toBeVisible();
      await expect(page.locator('[data-testid="bounding-box"]')).toContainText('mm');
      await expect(page.locator('[data-testid="volume"]')).toContainText('cm³');
    });
  });

  test.describe('Configuration', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);
    });

    test('should select manufacturing technology', async ({ page }) => {
      // Click continue to configuration
      await page.click('[data-testid="continue-button"]');

      // Should show technology options
      await expect(page.locator('[data-testid="technology-selector"]')).toBeVisible();

      // Select FFF 3D Printing
      await page.click('[data-value="FFF"]');

      // Should show FFF-specific options
      await expect(page.locator('[data-testid="layer-height"]')).toBeVisible();
      await expect(page.locator('[data-testid="infill-density"]')).toBeVisible();
    });

    test('should select material', async ({ page }) => {
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');

      // Should show material options for FFF
      await expect(page.locator('[data-testid="material-selector"]')).toBeVisible();

      // Select PLA
      await page.click('[data-value="PLA"]');

      // Should show material properties
      await expect(page.locator('[data-testid="material-properties"]')).toContainText('PLA');
      await expect(page.locator('[data-testid="material-color"]')).toBeVisible();
    });

    test('should set quantity', async ({ page }) => {
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');

      // Set quantity
      await page.fill('[name="quantity"]', '25');

      // Should update price
      await expect(page.locator('[data-testid="unit-price"]')).toBeVisible();
      await expect(page.locator('[data-testid="total-price"]')).toContainText('$');

      // Should show quantity discount
      await expect(page.locator('[data-testid="discount-badge"]')).toContainText('10% off');
    });

    test('should configure finishing options', async ({ page }) => {
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="CNC"]');
      await page.click('[data-value="ALUMINUM_6061"]');

      // Should show finishing options
      await expect(page.locator('[data-testid="finish-selector"]')).toBeVisible();

      // Select anodizing
      await page.click('[data-value="ANODIZED"]');

      // Should show color options
      await expect(page.locator('[data-testid="anodize-color"]')).toBeVisible();
      await page.selectOption('[data-testid="anodize-color"]', 'black');
    });

    test('should show lead time', async ({ page }) => {
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');
      await page.fill('[name="quantity"]', '10');

      // Should calculate and show lead time
      await expect(page.locator('[data-testid="lead-time"]')).toBeVisible();
      await expect(page.locator('[data-testid="lead-time"]')).toContainText('days');

      // Should show expedited option
      await expect(page.locator('[data-testid="expedite-option"]')).toBeVisible();
    });

    test('should validate DFM requirements', async ({ page }) => {
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="CNC"]');

      // Should show DFM warnings if applicable
      const dfmWarnings = page.locator('[data-testid="dfm-warnings"]');

      if (await dfmWarnings.isVisible()) {
        await expect(dfmWarnings).toContainText('Warning');

        // Should show suggestions
        await expect(page.locator('[data-testid="dfm-suggestions"]')).toBeVisible();
      }
    });
  });

  test.describe('Pricing', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');
      await page.fill('[name="quantity"]', '10');
    });

    test('should calculate pricing', async ({ page }) => {
      // Click calculate price
      await page.click('[data-testid="calculate-price"]');

      // Should show pricing breakdown
      await expect(page.locator('[data-testid="price-breakdown"]')).toBeVisible();
      await expect(page.locator('[data-testid="material-cost"]')).toContainText('$');
      await expect(page.locator('[data-testid="machine-cost"]')).toContainText('$');
      await expect(page.locator('[data-testid="labor-cost"]')).toContainText('$');
      await expect(page.locator('[data-testid="subtotal"]')).toContainText('$');
    });

    test('should apply quantity discounts', async ({ page }) => {
      // Change to bulk quantity
      await page.fill('[name="quantity"]', '100');
      await page.click('[data-testid="calculate-price"]');

      // Should show discount
      await expect(page.locator('[data-testid="discount-amount"]')).toBeVisible();
      await expect(page.locator('[data-testid="discount-percentage"]')).toContainText('%');
    });

    test('should handle currency conversion', async ({ page }) => {
      // Change currency
      await page.click('[data-testid="currency-selector"]');
      await page.click('[data-value="EUR"]');

      // Recalculate price
      await page.click('[data-testid="calculate-price"]');

      // Should show price in EUR
      await expect(page.locator('[data-testid="total-price"]')).toContainText('€');

      // Should show exchange rate
      await expect(page.locator('[data-testid="exchange-rate"]')).toBeVisible();
    });

    test('should calculate shipping', async ({ page }) => {
      await page.click('[data-testid="calculate-price"]');

      // Enter shipping address
      await page.click('[data-testid="add-shipping"]');
      await page.fill('[name="country"]', 'United States');
      await page.fill('[name="zipCode"]', '10001');

      // Should calculate shipping cost
      await expect(page.locator('[data-testid="shipping-cost"]')).toContainText('$');

      // Should show delivery estimate
      await expect(page.locator('[data-testid="delivery-date"]')).toBeVisible();
    });

    test('should show tax calculation', async ({ page }) => {
      await page.click('[data-testid="calculate-price"]');

      // Should show tax
      await expect(page.locator('[data-testid="tax-amount"]')).toBeVisible();
      await expect(page.locator('[data-testid="tax-rate"]')).toContainText('%');

      // Total should include tax
      await expect(page.locator('[data-testid="grand-total"]')).toBeVisible();
    });
  });

  test.describe('Quote Review', () => {
    test.beforeEach(async ({ page }) => {
      // Complete configuration
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');
      await page.fill('[name="quantity"]', '10');
      await page.click('[data-testid="calculate-price"]');
    });

    test('should show quote summary', async ({ page }) => {
      await page.click('[data-testid="review-quote"]');

      // Should show all details
      await expect(page.locator('[data-testid="quote-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="project-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="item-list"]')).toBeVisible();
      await expect(page.locator('[data-testid="total-price"]')).toBeVisible();
      await expect(page.locator('[data-testid="valid-until"]')).toBeVisible();
    });

    test('should allow editing project details', async ({ page }) => {
      await page.click('[data-testid="review-quote"]');

      // Edit project name
      await page.click('[data-testid="edit-project-name"]');
      await page.fill('[name="projectName"]', 'Custom Bracket Manufacturing');
      await page.click('[data-testid="save-project-name"]');

      // Should update
      await expect(page.locator('[data-testid="project-name"]')).toContainText(
        'Custom Bracket Manufacturing',
      );
    });

    test('should save quote as draft', async ({ page }) => {
      await page.click('[data-testid="review-quote"]');

      // Save as draft
      await page.click('[data-testid="save-draft"]');

      // Should show success message
      await expect(page.locator('.toast')).toContainText('Quote saved as draft');

      // Should redirect to quote detail
      await expect(page).toHaveURL(/\/quote\/[a-z0-9-]+$/);

      // Should show draft status
      await expect(page.locator('[data-testid="quote-status"]')).toContainText('Draft');
    });

    test('should submit quote for approval', async ({ page }) => {
      await page.click('[data-testid="review-quote"]');

      // Add notes
      await page.fill('[name="notes"]', 'Please ensure tight tolerances on holes');

      // Submit quote
      await page.click('[data-testid="submit-quote"]');

      // Should show confirmation dialog
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.click('[data-testid="confirm-submit"]');

      // Should redirect to quote detail
      await expect(page).toHaveURL(/\/quote\/[a-z0-9-]+$/);

      // Should show ready status
      await expect(page.locator('[data-testid="quote-status"]')).toContainText('Ready');
    });

    test('should generate PDF preview', async ({ page }) => {
      await page.click('[data-testid="review-quote"]');

      // Click preview PDF
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-testid="preview-pdf"]'),
      ]);

      // Should download PDF
      expect(download.suggestedFilename()).toContain('.pdf');
    });
  });

  test.describe('Quote Management', () => {
    let quoteId: string;

    test.beforeEach(async ({ page }) => {
      // Create a quote first
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');
      await page.fill('[name="quantity"]', '10');
      await page.click('[data-testid="calculate-price"]');
      await page.click('[data-testid="review-quote"]');
      await page.click('[data-testid="submit-quote"]');
      await page.click('[data-testid="confirm-submit"]');

      // Get quote ID from URL
      const url = page.url();
      quoteId = url.split('/').pop() || '';
    });

    test('should view quote details', async ({ page }) => {
      await page.goto(`/quote/${quoteId}`);

      // Should show all quote information
      await expect(page.locator('[data-testid="quote-id"]')).toContainText(quoteId);
      await expect(page.locator('[data-testid="quote-items"]')).toBeVisible();
      await expect(page.locator('[data-testid="quote-pricing"]')).toBeVisible();
      await expect(page.locator('[data-testid="quote-timeline"]')).toBeVisible();
    });

    test('should duplicate quote', async ({ page }) => {
      await page.goto(`/quote/${quoteId}`);

      // Click duplicate
      await page.click('[data-testid="duplicate-quote"]');

      // Should redirect to new quote with same items
      await expect(page).toHaveURL(/\/quote\/new/);

      // Should prefill with same configuration
      await expect(page.locator('[data-testid="file-list"]')).toBeVisible();
    });

    test('should share quote', async ({ page }) => {
      await page.goto(`/quote/${quoteId}`);

      // Click share
      await page.click('[data-testid="share-quote"]');

      // Should show share dialog
      await expect(page.locator('[data-testid="share-dialog"]')).toBeVisible();

      // Should show share link
      await expect(page.locator('[data-testid="share-link"]')).toContainText(quoteId);

      // Copy link
      await page.click('[data-testid="copy-link"]');

      // Should show success
      await expect(page.locator('.toast')).toContainText('Link copied');
    });

    test('should approve quote', async ({ page }) => {
      await page.goto(`/quote/${quoteId}`);

      // Click approve
      await page.click('[data-testid="approve-quote"]');

      // Should show payment options
      await expect(page.locator('[data-testid="payment-dialog"]')).toBeVisible();

      // Continue to payment
      await page.click('[data-testid="proceed-to-payment"]');

      // Should redirect to checkout
      await expect(page).toHaveURL(/\/checkout/);
    });

    test('should track quote status', async ({ page }) => {
      await page.goto(`/quote/${quoteId}`);

      // Should show status timeline
      await expect(page.locator('[data-testid="status-timeline"]')).toBeVisible();

      // Should show current status
      await expect(page.locator('[data-testid="current-status"]')).toContainText('Ready');

      // Should show next steps
      await expect(page.locator('[data-testid="next-steps"]')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle session timeout', async ({ page, context }) => {
      await page.goto('/quote/new');

      // Clear session
      await context.clearCookies();

      // Try to continue
      await uploadFile(page, testFiles.stl);

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/);

      // Should preserve return URL
      await expect(page).toHaveURL(/returnUrl=/);
    });

    test('should handle API errors gracefully', async ({ page }) => {
      await page.goto('/quote/new');

      // Mock API error
      await page.route('**/quotes/calculate', (route) =>
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Calculation service unavailable' }),
        }),
      );

      await uploadFile(page, testFiles.stl);
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');
      await page.click('[data-value="PLA"]');
      await page.click('[data-testid="calculate-price"]');

      // Should show error message
      await expect(page.locator('.error-message')).toContainText('service unavailable');

      // Should show retry option
      await expect(page.locator('[data-testid="retry-calculation"]')).toBeVisible();
    });

    test('should save progress automatically', async ({ page }) => {
      await page.goto('/quote/new');
      await uploadFile(page, testFiles.stl);
      await page.click('[data-testid="continue-button"]');
      await page.click('[data-value="FFF"]');

      // Refresh page
      await page.reload();

      // Should restore progress
      await expect(page.locator('[data-testid="file-list"]')).toBeVisible();
      await expect(page.locator('[data-value="FFF"][data-selected="true"]')).toBeVisible();
    });
  });
});
