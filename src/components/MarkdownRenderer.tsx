import { FC, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  invertInDarkMode?: boolean;
}

// Define a specific type for the props our custom code component will receive.
// This tells TypeScript that 'inline' is an expected prop.
interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({ content, invertInDarkMode = true }) => {
  return (
    <div className={cn(
      "prose max-w-none prose-p:my-2 prose-headings:my-3 prose-blockquote:not-italic",
      invertInDarkMode && "dark:prose-invert"
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Apply our custom type to the component's props.
          code({ node, inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};