import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="text-slate-300 text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          // 1. TRANSFORM HEADERS: Makes '### Title' look like a nice card header
          h3: ({ node, ...props }) => (
            <h3 
              {...props} 
              className="text-lg font-bold text-white mt-6 mb-2 font-display tracking-tight" 
            />
          ),

          // 2. TRANSFORM LINKS: Turns [Source](url) into small blue pills
          a: ({ node, href, children, ...props }) => {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
                className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[10px] font-medium border border-blue-500/20 transition-all no-underline align-middle transform hover:scale-105"
              >
                <span>{children}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </a>
            );
          },

          // 3. TRANSFORM PARAGRAPHS: Adds breathing room
          p: ({ node, ...props }) => (
            <p {...props} className="mb-4 text-slate-300 leading-7" />
          ),

          // 4. TRANSFORM BOLD: Highlights Metadata (Date/Source) in blue
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-semibold text-blue-400" />
          ),

          // 5. TRANSFORM HORIZONTAL RULES: Replaces '---' with a transparent spacer
          hr: () => <div className="h-6 border-b border-white/5 mb-6" />,

          // 6. LISTS: Standard styling just in case the LLM outputs a list
          ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 space-y-2 mb-4" />,
          li: ({ node, ...props }) => <li {...props} className="pl-1" />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}