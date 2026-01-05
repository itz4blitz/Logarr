'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-invert max-w-none',
        // Override prose defaults for dark mode
        'prose-headings:text-foreground prose-headings:font-semibold',
        'prose-p:text-muted-foreground prose-p:leading-relaxed',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg',
        'prose-ul:text-muted-foreground prose-ol:text-muted-foreground',
        'prose-li:marker:text-muted-foreground',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block styling
          code: ({ className, children, ...props }) => {
            const isInline = !className?.includes('language-');

            if (isInline) {
              return (
                <code
                  className="bg-muted text-primary rounded px-1.5 py-0.5 font-mono text-xs"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={cn('block font-mono text-xs', className)} {...props}>
                {children}
              </code>
            );
          },
          // Custom pre block with better styling
          pre: ({ children, ...props }) => (
            <pre
              className="bg-muted/50 border-border overflow-x-auto rounded-lg border p-4 text-sm"
              {...props}
            >
              {children}
            </pre>
          ),
          // Custom list styling
          ul: ({ children, ...props }) => (
            <ul className="text-muted-foreground list-disc space-y-1 pl-4" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="text-muted-foreground list-decimal space-y-1 pl-4" {...props}>
              {children}
            </ol>
          ),
          // Custom link styling
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              {...props}
            >
              {children}
            </a>
          ),
          // Custom heading styling
          h1: ({ children, ...props }) => (
            <h1 className="text-foreground mt-6 mb-3 text-xl font-semibold" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-foreground mt-5 mb-2 text-lg font-semibold" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-foreground mt-4 mb-2 text-base font-semibold" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="text-foreground mt-3 mb-1 text-sm font-semibold" {...props}>
              {children}
            </h4>
          ),
          // Custom paragraph styling
          p: ({ children, ...props }) => (
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed" {...props}>
              {children}
            </p>
          ),
          // Custom blockquote styling
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-primary/50 text-muted-foreground border-l-2 pl-4 italic"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Custom table styling for GFM tables
          table: ({ children, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table className="border-border min-w-full rounded-lg border text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted/50" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th
              className="text-foreground border-border border-b px-3 py-2 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="text-muted-foreground border-border border-b px-3 py-2" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
