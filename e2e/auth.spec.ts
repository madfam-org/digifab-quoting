import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'test@cotiza.studio',
  password: 'TestPassword123!',
  name: 'Test User',
  company: 'Test Company',
};

const newUser = {
  email: `user${Date.now()}@cotiza.studio`,
  password: 'NewPassword123!',
  name: 'New Test User',
  company: 'New Company',
};

// Helper functions
async function fillLoginForm(page: Page, email: string, password: string) {
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('[type="submit"]');
}

async function fillRegistrationForm(page: Page, user: typeof newUser) {
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.fill('[name="confirmPassword"]', user.password);
  await page.fill('[name="name"]', user.name);
  await page.fill('[name="company"]', user.company);
  await page.check('[name="acceptTerms"]');
  await page.click('[type="submit"]');
}

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Login', () => {
    test('should navigate to login page', async ({ page }) => {
      await page.click('text=Login');
      await expect(page).toHaveURL('/auth/login');
      await expect(page.locator('h1')).toContainText('Sign In');
    });

    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, testUser.password);

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('h1')).toContainText('Dashboard');

      // Should show user info
      await expect(page.locator('[data-testid="user-menu"]')).toContainText(testUser.name);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, 'wrongpassword');

      // Should stay on login page
      await expect(page).toHaveURL('/auth/login');

      // Should show error message
      await expect(page.locator('.error-message')).toContainText('Invalid credentials');
    });

    test('should show validation errors for invalid input', async ({ page }) => {
      await page.goto('/auth/login');

      // Submit empty form
      await page.click('[type="submit"]');

      // Should show validation errors
      await expect(page.locator('[data-error="email"]')).toContainText('Email is required');
      await expect(page.locator('[data-error="password"]')).toContainText('Password is required');
    });

    test('should handle rate limiting', async ({ page }) => {
      await page.goto('/auth/login');

      // Try to login multiple times with wrong password
      for (let i = 0; i < 6; i++) {
        await fillLoginForm(page, testUser.email, 'wrongpassword');
        await page.waitForTimeout(100);
      }

      // Should show rate limit error
      await expect(page.locator('.error-message')).toContainText('Too many attempts');
    });

    test('should remember user with "Remember me" checked', async ({ page, context }) => {
      await page.goto('/auth/login');

      // Check remember me
      await page.check('[name="rememberMe"]');
      await fillLoginForm(page, testUser.email, testUser.password);

      // Should set persistent cookie
      const cookies = await context.cookies();
      const authCookie = cookies.find((c) => c.name === 'auth-token');
      expect(authCookie).toBeDefined();
      expect(authCookie?.expires).toBeGreaterThan(Date.now() / 1000 + 7 * 24 * 60 * 60);
    });

    test('should redirect to requested page after login', async ({ page }) => {
      // Try to access protected page
      await page.goto('/quote/new');

      // Should redirect to login with return URL
      await expect(page).toHaveURL('/auth/login?returnUrl=%2Fquote%2Fnew');

      // Login
      await fillLoginForm(page, testUser.email, testUser.password);

      // Should redirect to originally requested page
      await expect(page).toHaveURL('/quote/new');
    });
  });

  test.describe('Registration', () => {
    test('should navigate to registration page', async ({ page }) => {
      await page.click('text=Sign Up');
      await expect(page).toHaveURL('/auth/register');
      await expect(page.locator('h1')).toContainText('Create Account');
    });

    test('should register new user', async ({ page }) => {
      await page.goto('/auth/register');
      await fillRegistrationForm(page, newUser);

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard');

      // Should show welcome message
      await expect(page.locator('.toast')).toContainText('Welcome to Cotiza Studio');
    });

    test('should show error for duplicate email', async ({ page }) => {
      await page.goto('/auth/register');
      await fillRegistrationForm(page, testUser); // Use existing user

      // Should stay on register page
      await expect(page).toHaveURL('/auth/register');

      // Should show error
      await expect(page.locator('.error-message')).toContainText('Email already exists');
    });

    test('should validate password strength', async ({ page }) => {
      await page.goto('/auth/register');

      // Weak password
      await page.fill('[name="password"]', '12345');
      await page.click('[type="submit"]');

      // Should show password requirements
      await expect(page.locator('[data-error="password"]')).toContainText('at least 8 characters');
      await expect(page.locator('[data-error="password"]')).toContainText('uppercase');
      await expect(page.locator('[data-error="password"]')).toContainText('number');
    });

    test('should validate password confirmation', async ({ page }) => {
      await page.goto('/auth/register');

      await page.fill('[name="password"]', 'ValidPassword123!');
      await page.fill('[name="confirmPassword"]', 'DifferentPassword123!');
      await page.click('[type="submit"]');

      // Should show mismatch error
      await expect(page.locator('[data-error="confirmPassword"]')).toContainText(
        'Passwords do not match',
      );
    });

    test('should require terms acceptance', async ({ page }) => {
      await page.goto('/auth/register');

      // Fill form without accepting terms
      await page.fill('[name="email"]', newUser.email);
      await page.fill('[name="password"]', newUser.password);
      await page.fill('[name="confirmPassword"]', newUser.password);
      await page.fill('[name="name"]', newUser.name);
      await page.click('[type="submit"]');

      // Should show error
      await expect(page.locator('[data-error="acceptTerms"]')).toContainText(
        'You must accept the terms',
      );
    });

    test('should send verification email', async ({ page }) => {
      await page.goto('/auth/register');
      await fillRegistrationForm(page, {
        ...newUser,
        email: `verify${Date.now()}@cotiza.studio`,
      });

      // Should show verification message
      await expect(page.locator('.info-message')).toContainText('verification email');
    });
  });

  test.describe('Logout', () => {
    test.beforeEach(async ({ page }) => {
      // Login first
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, testUser.password);
      await expect(page).toHaveURL('/dashboard');
    });

    test('should logout successfully', async ({ page }) => {
      // Click user menu
      await page.click('[data-testid="user-menu"]');

      // Click logout
      await page.click('text=Logout');

      // Should redirect to home
      await expect(page).toHaveURL('/');

      // Should not show user menu
      await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
    });

    test('should clear session on logout', async ({ page, context }) => {
      await page.click('[data-testid="user-menu"]');
      await page.click('text=Logout');

      // Should clear auth cookie
      const cookies = await context.cookies();
      const authCookie = cookies.find((c) => c.name === 'auth-token');
      expect(authCookie).toBeUndefined();
    });

    test('should redirect to login when accessing protected page after logout', async ({
      page,
    }) => {
      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('text=Logout');

      // Try to access protected page
      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL('/auth/login');
    });
  });

  test.describe('Password Reset', () => {
    test('should navigate to password reset page', async ({ page }) => {
      await page.goto('/auth/login');
      await page.click('text=Forgot Password?');

      await expect(page).toHaveURL('/auth/reset-password');
      await expect(page.locator('h1')).toContainText('Reset Password');
    });

    test('should send password reset email', async ({ page }) => {
      await page.goto('/auth/reset-password');

      await page.fill('[name="email"]', testUser.email);
      await page.click('[type="submit"]');

      // Should show success message
      await expect(page.locator('.success-message')).toContainText('reset link has been sent');
    });

    test('should handle non-existent email gracefully', async ({ page }) => {
      await page.goto('/auth/reset-password');

      await page.fill('[name="email"]', 'nonexistent@example.com');
      await page.click('[type="submit"]');

      // Should still show success (security best practice)
      await expect(page.locator('.success-message')).toContainText('If an account exists');
    });

    test('should reset password with valid token', async ({ page }) => {
      // Simulate clicking reset link with token
      const resetToken = 'valid-reset-token-123';
      await page.goto(`/auth/reset-password/${resetToken}`);

      // Fill new password
      await page.fill('[name="newPassword"]', 'NewSecurePassword123!');
      await page.fill('[name="confirmPassword"]', 'NewSecurePassword123!');
      await page.click('[type="submit"]');

      // Should redirect to login
      await expect(page).toHaveURL('/auth/login');

      // Should show success message
      await expect(page.locator('.success-message')).toContainText('Password has been reset');
    });

    test('should handle expired reset token', async ({ page }) => {
      const expiredToken = 'expired-token-123';
      await page.goto(`/auth/reset-password/${expiredToken}`);

      await expect(page.locator('.error-message')).toContainText('expired or invalid');
    });
  });

  test.describe('Session Management', () => {
    test('should refresh token automatically', async ({ page }) => {
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, testUser.password);

      // Wait for token to near expiry (mock scenario)
      await page.waitForTimeout(14 * 60 * 1000); // 14 minutes

      // Make an API call that should trigger refresh
      await page.goto('/dashboard');

      // Should still be logged in
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should handle session expiry', async ({ page, context }) => {
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, testUser.password);

      // Manually expire the session (clear cookies)
      await context.clearCookies();

      // Navigate to protected page
      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL('/auth/login');

      // Should show session expired message
      await expect(page.locator('.info-message')).toContainText('Session expired');
    });

    test('should prevent concurrent sessions when configured', async ({ browser }) => {
      // Login in first browser context
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await page1.goto('/auth/login');
      await fillLoginForm(page1, testUser.email, testUser.password);
      await expect(page1).toHaveURL('/dashboard');

      // Login in second browser context
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await page2.goto('/auth/login');
      await fillLoginForm(page2, testUser.email, testUser.password);
      await expect(page2).toHaveURL('/dashboard');

      // First session should be invalidated
      await page1.reload();
      await expect(page1).toHaveURL('/auth/login');
      await expect(page1.locator('.info-message')).toContainText('logged in from another device');

      // Cleanup
      await context1.close();
      await context2.close();
    });
  });

  test.describe('Social Authentication', () => {
    test('should show social login options', async ({ page }) => {
      await page.goto('/auth/login');

      await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();
      await expect(page.locator('button:has-text("Continue with Microsoft")')).toBeVisible();
    });

    test('should initiate Google OAuth flow', async ({ page }) => {
      await page.goto('/auth/login');

      // Click Google button
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.click('button:has-text("Continue with Google")'),
      ]);

      // Should open Google OAuth page
      await expect(popup).toHaveURL(/accounts\.google\.com/);

      await popup.close();
    });
  });

  test.describe('Security', () => {
    test('should prevent XSS in login form', async ({ page }) => {
      await page.goto('/auth/login');

      const xssPayload = '<script>alert("XSS")</script>';
      await page.fill('[name="email"]', xssPayload);
      await page.fill('[name="password"]', 'password');
      await page.click('[type="submit"]');

      // Should sanitize and show validation error
      await expect(page.locator('.error-message')).toContainText('Invalid email');

      // Script should not execute
      await expect(page.locator('script:has-text("alert")')).not.toBeVisible();
    });

    test('should use secure cookies', async ({ page, context }) => {
      await page.goto('/auth/login');
      await fillLoginForm(page, testUser.email, testUser.password);

      const cookies = await context.cookies();
      const authCookie = cookies.find((c) => c.name === 'auth-token');

      expect(authCookie?.secure).toBe(true);
      expect(authCookie?.httpOnly).toBe(true);
      expect(authCookie?.sameSite).toBe('Strict');
    });

    test('should implement CSRF protection', async ({ page }) => {
      await page.goto('/auth/login');

      // Check for CSRF token
      const csrfToken = await page.getAttribute('meta[name="csrf-token"]', 'content');
      expect(csrfToken).toBeTruthy();

      // Verify token is sent with form
      await page.fill('[name="email"]', testUser.email);
      await page.fill('[name="password"]', testUser.password);

      const [request] = await Promise.all([
        page.waitForRequest((req) => req.url().includes('/auth/login')),
        page.click('[type="submit"]'),
      ]);

      const headers = request.headers();
      expect(headers['x-csrf-token']).toBe(csrfToken);
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/auth/login');

      // Tab through form fields
      await page.keyboard.press('Tab'); // Focus email
      await page.keyboard.type(testUser.email);

      await page.keyboard.press('Tab'); // Focus password
      await page.keyboard.type(testUser.password);

      await page.keyboard.press('Tab'); // Focus remember me
      await page.keyboard.press('Space'); // Check it

      await page.keyboard.press('Tab'); // Focus submit
      await page.keyboard.press('Enter'); // Submit

      // Should login successfully
      await expect(page).toHaveURL('/dashboard');
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/auth/login');

      // Check form inputs have labels
      await expect(page.locator('input[name="email"]')).toHaveAttribute(
        'aria-label',
        'Email address',
      );
      await expect(page.locator('input[name="password"]')).toHaveAttribute(
        'aria-label',
        'Password',
      );

      // Check error messages are announced
      await page.click('[type="submit"]'); // Submit empty form
      await expect(page.locator('[role="alert"]')).toBeVisible();
    });

    test('should support screen readers', async ({ page }) => {
      await page.goto('/auth/login');

      // Check for skip links
      await expect(page.locator('a:has-text("Skip to main content")')).toHaveAttribute(
        'href',
        '#main',
      );

      // Check form has proper structure
      const form = page.locator('form');
      await expect(form).toHaveAttribute('role', 'form');
      await expect(form).toHaveAttribute('aria-labelledby', 'login-heading');
    });
  });
});
