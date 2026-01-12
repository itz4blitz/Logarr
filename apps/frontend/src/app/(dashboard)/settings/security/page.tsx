'use client';

import { Check, Loader2, Shield, Key, AlertCircle, Info } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v3';

import { useAuth } from '@/components/auth-provider';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useSecuritySettings, useUpdateSecuritySettings, useUpdatePassword } from '@/hooks/use-api';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

function formatMilliseconds(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useSecuritySettings();
  const updateSettingsMutation = useUpdateSecuritySettings();
  const updatePasswordMutation = useUpdatePassword();

  // Local state for security settings (for unsaved changes handling)
  const [localSettings, setLocalSettings] = useState({
    jwtExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days default
    sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes default
  });

  // Sync local state with server settings
  const settingsRef = useRef(settings);
  if (settings && settings !== settingsRef.current) {
    settingsRef.current = settings;
    setLocalSettings({
      jwtExpirationMs: settings.jwtExpirationMs,
      sessionTimeoutMs: settings.sessionTimeoutMs,
    });
  }

  // State for password visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password form
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    try {
      await updatePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password updated successfully');
      passwordForm.reset();
    } catch (error) {
      toast.error('Failed to update password', {
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateSettingsMutation.mutateAsync(localSettings);
      toast.success('Security settings updated');
    } catch (error) {
      toast.error('Failed to update settings', {
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  // Check for unsaved changes
  const hasUnsavedChanges =
    settings &&
    (localSettings.jwtExpirationMs !== settings.jwtExpirationMs ||
      localSettings.sessionTimeoutMs !== settings.sessionTimeoutMs);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
          <p className="text-muted-foreground text-sm">
            Manage your admin credentials and security preferences
          </p>
        </div>
        {user && (
          <div className="text-right text-sm">
            <div className="text-muted-foreground">Logged in as</div>
            <div className="font-medium">{user.username}</div>
          </div>
        )}
      </div>

      {/* Session Settings & Change Password side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Session Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Session Settings
              </div>
              {hasUnsavedChanges && (
                <Button
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleSaveSettings}
                  disabled={updateSettingsMutation.isPending}
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-2.5 w-2.5" />
                  )}
                  Save
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settingsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : settingsError ? (
              <Alert variant="destructive" className="py-3">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription className="text-xs">Failed to load settings</AlertDescription>
              </Alert>
            ) : settings ? (
              <>
                {/* Session Duration */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Session Duration</Label>
                    <span className="text-muted-foreground text-xs">
                      {formatMilliseconds(localSettings.jwtExpirationMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[localSettings.jwtExpirationMs / (24 * 60 * 60 * 1000)]}
                      min={1}
                      max={30}
                      step={1}
                      disabled={updateSettingsMutation.isPending}
                      onValueChange={([days]) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          jwtExpirationMs: days * 24 * 60 * 60 * 1000,
                        }))
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={Math.round(localSettings.jwtExpirationMs / (24 * 60 * 60 * 1000))}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(30, parseInt(e.target.value) || 1));
                        setLocalSettings((prev) => ({
                          ...prev,
                          jwtExpirationMs: value * 24 * 60 * 60 * 1000,
                        }));
                      }}
                      disabled={updateSettingsMutation.isPending}
                      className="h-6 w-16 text-center text-xs"
                    />
                  </div>
                </div>

                {/* Session Timeout */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Idle Timeout</Label>
                    <span className="text-muted-foreground text-xs">
                      {formatMilliseconds(localSettings.sessionTimeoutMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[localSettings.sessionTimeoutMs / (60 * 1000)]}
                      min={5}
                      max={240}
                      step={5}
                      disabled={updateSettingsMutation.isPending}
                      onValueChange={([minutes]) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          sessionTimeoutMs: minutes * 60 * 1000,
                        }))
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={Math.round(localSettings.sessionTimeoutMs / (60 * 1000))}
                      onChange={(e) => {
                        const value = Math.max(5, Math.min(240, parseInt(e.target.value) || 5));
                        setLocalSettings((prev) => ({
                          ...prev,
                          sessionTimeoutMs: value * 60 * 1000,
                        }));
                      }}
                      disabled={updateSettingsMutation.isPending}
                      className="h-6 w-16 text-center text-xs"
                    />
                  </div>
                </div>

                <Alert className="py-2">
                  <Info className="h-3 w-3" />
                  <AlertDescription className="text-[10px]">
                    Changes apply on next login
                  </AlertDescription>
                </Alert>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-3">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Current Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type={showCurrentPassword ? 'text' : 'password'}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                          disabled={updatePasswordMutation.isPending}
                          className="h-8"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">New Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          disabled={updatePasswordMutation.isPending}
                          className="h-8"
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Must be at least 12 characters
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          disabled={updatePasswordMutation.isPending}
                          className="h-8"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={updatePasswordMutation.isPending}
                  className="w-full"
                  size="sm"
                >
                  {updatePasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-3 w-3" />
                      Update Password
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
