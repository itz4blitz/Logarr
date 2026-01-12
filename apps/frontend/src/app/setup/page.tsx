'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod/v3';

const setupSchema = z
  .object({
    setupToken: z.string().min(1, 'Setup token is required'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type SetupFormValues = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const router = useRouter();
  const { setup, setupRequired, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      setupToken: '',
      username: 'admin',
      password: '',
      confirmPassword: '',
    },
  });

  // Redirect if setup is not required
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (setupRequired === false) {
    router.push('/');
    return null;
  }

  const onSubmit = async (values: SetupFormValues) => {
    setIsSubmitting(true);
    try {
      await setup(values.setupToken, values.username, values.password);
      toast.success('Setup completed successfully!', {
        description: 'Your admin account has been created.',
      });
      router.push('/');
    } catch (error) {
      toast.error('Setup failed', {
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Initial Setup</CardTitle>
          <CardDescription>
            Enter the setup token from your server logs and create your admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="setupToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Setup Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter the 64-character setup token"
                        autoComplete="one-time-code"
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <FormDescription>
                      The setup token was displayed in your server logs when you started Logarr.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="admin" autoComplete="username" />
                    </FormControl>
                    <FormDescription>
                      Your admin username for logging into Logarr.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter a secure password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormDescription>
                      Must be at least 12 characters long. Use a strong, unique password.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm your password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Complete Setup'}
              </Button>
            </form>
          </Form>

          <div className="mt-6 rounded-md bg-muted p-4">
            <p className="text-sm font-medium">Where do I find the setup token?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Check your server logs where you run Logarr. Look for a message that says
              &quot;INITIAL SETUP REQUIRED&quot; with a 64-character token. You can also find it in
              Docker container logs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
