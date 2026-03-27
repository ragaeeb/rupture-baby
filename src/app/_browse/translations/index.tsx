import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_browse/translations/')({ component: TranslationsIndexComponent });

function TranslationsIndexComponent() {
    return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center">
            <p className="text-muted-foreground text-sm">Select a JSON file from the sidebar.</p>
        </div>
    );
}
