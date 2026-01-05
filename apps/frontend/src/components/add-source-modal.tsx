'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, ExternalLink, Loader2, Plus, Sparkles } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v3';

import { IntegrationIcon } from '@/components/integration-icon';
import { IntegrationPicker } from '@/components/integration-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateServer } from '@/hooks/use-api';
import { type Integration, type ConfigField, getIntegrationById } from '@/lib/integrations';
import { cn } from '@/lib/utils';

interface AddSourceModalProps {
  trigger?: React.ReactNode;
  defaultIntegrationId?: string;
  onSuccess?: () => void;
}

type Step = 'select' | 'configure' | 'success';

// Build Zod schema from integration config fields
function buildFormSchema(fields: ConfigField[]) {
  const schemaShape: { [key: string]: z.ZodTypeAny } = {};

  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case 'url':
        fieldSchema = z.string().url('Please enter a valid URL');
        break;
      case 'number':
        fieldSchema = z.coerce.number();
        if (field.validation?.min !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).min(field.validation.min);
        }
        if (field.validation?.max !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).max(field.validation.max);
        }
        break;
      case 'checkbox':
        fieldSchema = z.boolean();
        break;
      default:
        fieldSchema = z.string();
        if (field.validation?.pattern) {
          fieldSchema = (fieldSchema as z.ZodString).regex(
            new RegExp(field.validation.pattern),
            'Invalid format'
          );
        }
    }

    if (field.required) {
      if (field.type === 'checkbox') {
        // Checkboxes don't need min length
      } else {
        fieldSchema = (fieldSchema as z.ZodString).min(1, `${field.label} is required`);
      }
    } else {
      fieldSchema = fieldSchema.optional();
    }

    schemaShape[field.name] = fieldSchema;
  }

  return z.object(schemaShape);
}

// Build default values from integration config fields
function buildDefaultValues(fields: ConfigField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.default !== undefined) {
      defaults[field.name] = field.default;
    } else {
      switch (field.type) {
        case 'checkbox':
          defaults[field.name] = false;
          break;
        case 'number':
          defaults[field.name] = '';
          break;
        default:
          defaults[field.name] = '';
      }
    }
  }

  return defaults;
}

// Dynamic form field component - uses useFormContext to get form control
function DynamicFormField({ field }: { field: ConfigField }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </FormLabel>
          <FormControl>
            {field.type === 'select' ? (
              <Select onValueChange={formField.onChange} defaultValue={formField.value as string}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'checkbox' ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={formField.value as boolean}
                  onCheckedChange={formField.onChange}
                />
                <span className="text-muted-foreground text-sm">{field.description}</span>
              </div>
            ) : (
              <Input
                type={
                  field.type === 'password'
                    ? 'password'
                    : field.type === 'number'
                      ? 'number'
                      : 'text'
                }
                placeholder={field.placeholder}
                {...formField}
                value={formField.value as string}
              />
            )}
          </FormControl>
          {field.type !== 'checkbox' && field.description && (
            <FormDescription>{field.description}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Configuration form step component
function ConfigurationStep({
  integration,
  onBack,
  onSuccess,
}: {
  integration: Integration;
  onBack: () => void;
  onSuccess: () => void;
}) {
  // Animation class for step entrance
  const animationClass = 'step-slide-in-right';
  const createServer = useCreateServer();

  const formSchema = buildFormSchema(integration.configFields);
  const defaultValues = buildDefaultValues(integration.configFields);

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues as FormData,
  });

  async function onSubmit(data: Record<string, unknown>) {
    try {
      await createServer.mutateAsync({
        name: data.name as string,
        providerId: integration.id,
        url: data.url as string,
        apiKey: (data.apiKey || data.token || data.password || '') as string,
        logPath: data.logPath as string | undefined,
      });
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add source');
    }
  }

  return (
    <div className={cn('flex h-full flex-col', animationClass)}>
      {/* Header with back button and integration info */}
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${integration.color}15` }}
        >
          <IntegrationIcon integration={integration} size="lg" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{integration.name}</h3>
            {integration.status === 'beta' && (
              <Badge
                variant="outline"
                className="border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Beta
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground truncate text-sm">{integration.description}</p>
        </div>

        {integration.website && (
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <a href={integration.website} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" />
              Docs
            </a>
          </Button>
        )}
      </div>

      {/* Form */}
      <ScrollArea className="-mx-1 flex-1 px-1 py-4">
        <Form {...form}>
          <form id="add-source-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {integration.configFields.map((field) => (
              <DynamicFormField key={field.name} field={field} />
            ))}

            {/* Capabilities info */}
            <div className="border-t pt-4">
              <h4 className="mb-2 text-sm font-medium">Capabilities</h4>
              <div className="flex flex-wrap gap-2">
                {integration.capabilities.realTimeLogs && (
                  <Badge variant="secondary">Real-time logs</Badge>
                )}
                {integration.capabilities.activityLog && (
                  <Badge variant="secondary">Activity log</Badge>
                )}
                {integration.capabilities.sessions && <Badge variant="secondary">Sessions</Badge>}
                {integration.capabilities.webhooks && <Badge variant="secondary">Webhooks</Badge>}
                {integration.capabilities.metrics && <Badge variant="secondary">Metrics</Badge>}
              </div>
            </div>
          </form>
        </Form>
      </ScrollArea>

      {/* Footer with submit button */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button type="submit" form="add-source-form" disabled={createServer.isPending}>
          {createServer.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add Source
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Success step component
function SuccessStep({
  integration,
  onAddAnother,
  onClose,
}: {
  integration: Integration;
  onAddAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="step-scale-in flex flex-col items-center justify-center py-8 text-center">
      {/* Success icon */}
      <div
        className="success-icon-enter mb-6 flex h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: `${integration.color}15` }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: integration.color }}
        >
          <Check className="h-8 w-8 text-white" />
        </div>
      </div>

      <h3 className="mb-2 text-xl font-semibold">Source Added Successfully!</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        {integration.name} has been added to your sources. You can now start monitoring logs and
        activity.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onAddAnother}>
          <Plus className="mr-2 h-4 w-4" />
          Add Another
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

export function AddSourceModal({ trigger, defaultIntegrationId, onSuccess }: AddSourceModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(
    defaultIntegrationId ? getIntegrationById(defaultIntegrationId) || null : null
  );

  // Handle dialog open/close with proper state management
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        // When opening, set initial step based on whether we have a default integration
        if (defaultIntegrationId) {
          const integration = getIntegrationById(defaultIntegrationId);
          if (integration) {
            setSelectedIntegration(integration);
            setStep('configure');
            return;
          }
        }
        setStep('select');
      } else {
        // When closing, delay reset to allow close animation
        setTimeout(() => {
          setStep('select');
          if (!defaultIntegrationId) {
            setSelectedIntegration(null);
          }
        }, 200);
      }
    },
    [defaultIntegrationId]
  );

  const handleSelect = useCallback((integration: Integration) => {
    setSelectedIntegration(integration);
    setStep('configure');
  }, []);

  const handleBack = useCallback(() => {
    setStep('select');
  }, []);

  const handleSuccess = useCallback(() => {
    setStep('success');
    onSuccess?.();
    toast.success(`${selectedIntegration?.name} added successfully!`);
  }, [selectedIntegration, onSuccess]);

  const handleAddAnother = useCallback(() => {
    setSelectedIntegration(null);
    setStep('select');
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Determine modal size based on step
  const modalSizeClass = step === 'select' ? 'sm:max-w-4xl' : 'sm:max-w-lg';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex! flex-col! overflow-hidden transition-all duration-300',
          modalSizeClass,
          step === 'select' ? 'h-[85vh] max-h-[900px]' : 'h-auto max-h-[85vh]'
        )}
        showCloseButton={step !== 'success'}
      >
        {step === 'select' && (
          <>
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-xl">Add Source</DialogTitle>
              <DialogDescription>
                Choose an integration to connect. Select from available sources or browse upcoming
                integrations.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <IntegrationPicker onSelect={handleSelect} selectedId={selectedIntegration?.id} />
            </div>
          </>
        )}

        {step === 'configure' && selectedIntegration && (
          <ConfigurationStep
            integration={selectedIntegration}
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        )}

        {step === 'success' && selectedIntegration && (
          <SuccessStep
            integration={selectedIntegration}
            onAddAnother={handleAddAnother}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Export a simple hook for programmatic usage
export function useAddSourceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | undefined>();

  const open = useCallback((integrationId?: string) => {
    setIntegrationId(integrationId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    integrationId,
    open,
    close,
    setIsOpen,
  };
}
