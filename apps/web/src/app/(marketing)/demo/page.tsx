import { redirect } from 'next/navigation';

// Demo page content has been moved to the landing page (/)
// Interactive demo is now at /try
export default function DemoPage() {
  redirect('/');
}
