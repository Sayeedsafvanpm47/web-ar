import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { LoginForm } from './login-form';

export const metadata = { title: 'Staff sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Black Pearl staff</CardTitle>
          <CardDescription>
            Staff access only. Customers reach their book by scanning its QR
            code and never sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm denied={denied === '1'} />
        </CardContent>
      </Card>
    </main>
  );
}
