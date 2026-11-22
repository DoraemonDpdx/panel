import { Coffee } from 'lucide-react';
import { Button, InputSpinner, Select } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import PromptCard, { PromptActions } from './PromptCard';

export default function JavaVersionPrompt({ model, className }: ViewProps<'server.feature.javaVersion'>) {
    return (
        <PromptCard
            className={className}
            open={model.open}
            title='Unsupported Java version'
            icon={Coffee}
            pending={model.pending}
            onClose={model.close}
        >
            <p>
                This server uses a Java version it cannot run on, so it will not start.
                {model.canChangeImage && <> Pick a supported version and the server will restart with it.</>}
            </p>
            {model.canChangeImage && (
                <>
                    <InputSpinner visible={model.loading}>
                        <Select
                            disabled={!model.images}
                            value={model.selected}
                            onChange={(value) => model.select(String(value))}
                            options={(model.images ?? []).map(({ label, value }) => ({ value, label }))}
                        />
                    </InputSpinner>
                    <PromptActions>
                        <Button
                            isLoading={model.pending}
                            disabled={model.pending || model.loading}
                            onClick={() => void model.update().catch(() => {})}
                        >
                            Update Docker image
                        </Button>
                    </PromptActions>
                </>
            )}
        </PromptCard>
    );
}
