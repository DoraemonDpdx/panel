import { replaceable, useSkin } from '@/themes/skins';

export interface PageFooterProps {
    className?: string;
}

/** The copyright line below each page's content. Replace it with a component that renders nothing to drop it. */
function CorePageFooter({ className }: PageFooterProps) {
    const ui = useSkin('PageFooter', {});

    return (
        <div {...ui('root', className)}>
            <p {...ui('text')}>
                <span {...ui('link')}>Astrelyse</span>
                &nbsp;&copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span>
            </p>
        </div>
    );
}

const PageFooter = replaceable('PageFooter', CorePageFooter);

export default PageFooter;
