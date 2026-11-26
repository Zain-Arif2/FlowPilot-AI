import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md p-6 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">404 – Page Not Found</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <p className="text-gray-600 text-center">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link href="/" passHref>
            <Button variant="primary" className="w-full">
              Go to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

