'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import type { CommonConversationExport } from '@/lib/translation-types';

const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${month} ${day}, ${year} ${hours12}:${minutes} ${ampm}`;
};

const formatReasoningDuration = (durationSeconds: number): string => {
    return `${durationSeconds} ${durationSeconds === 1 ? 'second' : 'seconds'}`;
};

type ConversationViewProps = { conversation: CommonConversationExport };

export const ConversationView = ({ conversation }: ConversationViewProps) => {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Platform:</span>
                    <Badge variant="default">{conversation.llm}</Badge>
                </div>
                {conversation.model && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Model:</span>
                        <Badge variant="secondary">{conversation.model}</Badge>
                    </div>
                )}
                {conversation.created_at && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Created:</span>
                        <span className="text-sm">{formatTimestamp(conversation.created_at)}</span>
                    </div>
                )}
                {conversation.updated_at && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Updated:</span>
                        <span className="text-sm">{formatTimestamp(conversation.updated_at)}</span>
                    </div>
                )}
            </div>

            {conversation.title && (
                <div>
                    <h3 className="font-semibold text-lg">{conversation.title}</h3>
                </div>
            )}

            <Accordion type="multiple" defaultValue={['response']} className="w-full">
                <AccordionItem value="prompt">
                    <AccordionTrigger>Prompt</AccordionTrigger>
                    <AccordionContent>
                        <div className="rounded-lg border bg-card p-4">
                            <p className="whitespace-pre-wrap text-sm">{conversation.prompt || '—'}</p>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                {conversation.reasoning.length > 0 && (
                    <AccordionItem value="reasoning">
                        <AccordionTrigger>
                            {typeof conversation.reasoning_duration_sec === 'number'
                                ? `Reasoning (${conversation.reasoning.length} steps) [${formatReasoningDuration(conversation.reasoning_duration_sec)}]`
                                : `Reasoning (${conversation.reasoning.length} steps)`}
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="rounded-lg border bg-card p-4">
                                <ol className="list-decimal space-y-2 pl-4">
                                    {conversation.reasoning.map((step) => (
                                        <li key={step} className="whitespace-pre-wrap text-sm">
                                            {step}
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}
                <AccordionItem value="response">
                    <AccordionTrigger>Response</AccordionTrigger>
                    <AccordionContent>
                        <div className="rounded-lg border bg-card p-4">
                            <p className="whitespace-pre-wrap text-sm">{conversation.response || '—'}</p>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
};
