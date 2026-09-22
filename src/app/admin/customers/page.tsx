import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { CustomerForm } from './customer-form';

export const metadata = { title: 'Customers' };

type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export default async function CustomersPage() {
  await requireStaff();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const customers = (data ?? []) as CustomerRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Customers</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm />
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-red-600">Could not load customers: {error.message}</p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No customers yet.
              </TableCell>
            </TableRow>
          ) : (
            customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.full_name}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>{c.phone ?? '—'}</TableCell>
                <TableCell>
                  {new Date(c.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </main>
  );
}
