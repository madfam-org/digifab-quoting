#!/usr/bin/env node

if (process.env.LOCAL_DB !== 'yes') {
  console.error(
    'Refusing database command without explicit local/safe target. ' +
      'Re-run with LOCAL_DB=yes after confirming DATABASE_URL is not production or tenant data.'
  );
  process.exit(1);
}
