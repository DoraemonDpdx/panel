import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Toaster } from 'sonner';

import '@/components/elements/app-toaster.css';

const iconClassName = 'h-4 w-4 shrink-0';

const AppToaster = () => (
    <Toaster
        closeButton
        theme='dark'
        position='top-right'
        visibleToasts={4}
        toastOptions={{
            unstyled: true,
            classNames: {
                toast: 'glass-toast',
                actionButton:
                    'inline-flex h-7 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90',
            },
        }}
        icons={{
            error: <CircleAlert className={iconClassName} />,
            success: <CircleCheck className={iconClassName} />,
            warning: <TriangleAlert className={iconClassName} />,
            info: <Info className={iconClassName} />,
        }}
    />
);

export default AppToaster;
